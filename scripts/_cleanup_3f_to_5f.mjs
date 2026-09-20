import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh

node --input-type=module <<'NODE'
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { getTemplate, updateTemplateDomainsJson } from "./src/templates.js";
import {
  addPagesDomain,
  ensurePagesCname,
  deleteForwardingPageRules,
  findZoneByName,
  tokenForZone,
  waitForPagesDomainActive,
  removeDomainFromAllPagesProjects,
} from "./src/cloudflare.js";
import { assignDomain } from "./src/ownership.js";
import { addHistoryItem, updateHistoryItem } from "./src/history.js";

const execAsync = promisify(exec);

const p3 = "/var/www/Landingpages/GG88/3f-thanhnhan";
const removeOnly = ["ggtong.me", "ggquocte.net", "gg88sgp.com", "gg88usa.net"];
const switchDom = "gg88my.com";

function log(...a){ console.log(...a); }

async function pushRepo(cwd, msg) {
  await execAsync("git fetch origin", { cwd });
  const show = await execAsync("git show-ref", { cwd });
  const refs = show.stdout || "";
  const remoteRef = refs.includes("refs/remotes/origin/main") ? "origin/main" : "origin/master";
  const branch = remoteRef.endsWith("/main") ? "main" : "master";
  await execAsync("git checkout " + branch, { cwd }).catch(()=>{});
  await execAsync("git merge --no-edit -X ours " + remoteRef, { cwd }).catch(async () => {
    await execAsync("git merge --abort", { cwd }).catch(()=>{});
  });
  await execAsync("git add domains.json", { cwd });
  await execAsync('git commit -m "' + msg.replace(/"/g,"'") + '"', { cwd }).catch(()=>{});
  await execAsync("git push origin " + branch, { cwd });
  log("pushed", cwd, branch);
}

// --- 1) probe live link for gg88my before switch ---
async function liveLink(domain) {
  try {
    const j = await (await fetch("https://"+domain+"/domains.json", { headers:{"user-agent":"Mozilla/5.0"}, signal: AbortSignal.timeout(15000) })).json();
    const e = j[domain] || j["www."+domain];
    return e?.main_url || e?.messenger_url || null;
  } catch { return null; }
}
let keepLink = await liveLink(switchDom);
const j3 = JSON.parse(fs.readFileSync(p3+"/domains.json","utf8"));
if (!keepLink) {
  const e = j3[switchDom] || j3["www."+switchDom];
  keepLink = e?.main_url || null;
}
log("gg88my keepLink", keepLink);
if (!keepLink) throw new Error("no link for gg88my.com");

// --- 2) remove ghosts from 3f json (keep DNS) ---
let dj = JSON.parse(fs.readFileSync(p3+"/domains.json","utf8"));
const before = Object.keys(dj).length;
for (const d of [...removeOnly, switchDom]) {
  delete dj[d];
  delete dj["www."+d];
}
fs.writeFileSync(p3+"/domains.json", JSON.stringify(dj, null, 2));
log("3f cleaned keys", before, "->", Object.keys(dj).length, "left", Object.keys(dj).filter(k=>!k.startsWith("www.")));
await pushRepo(p3, "chore: remove ghost/moved domains from 3f (keep DNS elsewhere)");

// --- 3) switch gg88my.com -> landingpage_5f_g ---
const tpl = getTemplate("landingpage_5f_g");
if (!tpl?.path) throw new Error("missing 5f template");
const histId = "hist_" + Date.now() + "_3fto5f";
addHistoryItem({
  id: histId,
  domain: switchDom,
  actionType: "SWITCH_TPL",
  actionLabel: "Đổi Mẫu Landing Page",
  templateId: tpl.id,
  templateName: tpl.name,
  cnameTarget: tpl.cnameTarget,
  link: keepLink,
  tele: keepLink,
  status: "in_progress",
  progress: "3F -> 5F",
  userId: "u_admin",
  username: "admin",
});

const zone = await findZoneByName(switchDom).catch(()=>null);
if (zone) await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) }).catch(()=>{});

let finalTarget = tpl.cnameTarget;
const pagesRes = await addPagesDomain(switchDom, tpl.pagesProject, tpl.path, { accountId: tpl.pagesAccountId || undefined });
log("pages", pagesRes);
if (pagesRes?.canonicalSubdomain) finalTarget = pagesRes.canonicalSubdomain;
await ensurePagesCname(switchDom, finalTarget);
log("cname", finalTarget);
if (pagesRes?.projectName) {
  await waitForPagesDomainActive(pagesRes.projectName, switchDom, pagesRes.accountId || tpl.pagesAccountId || undefined, 90000).catch(e=>log("wait", e.message));
}

await removeDomainFromAllPagesProjects(switchDom, null, {
  hintProjects: ["ladpage-3f-nhannhan", "landingpage-5f-g"],
  exceptProjects: [tpl.pagesProject, pagesRes?.projectName].filter(Boolean),
}).catch(e=>log("rm pages", e.message));

await updateTemplateDomainsJson(tpl, switchDom, keepLink, keepLink);
log("5f domains.json updated");

assignDomain(switchDom, "u_admin", {
  mode: "LP",
  currentLink: keepLink,
  tele: keepLink,
  templateId: tpl.id,
  templateName: tpl.name,
  cnameTarget: finalTarget,
});

updateHistoryItem(histId, {
  status: "success",
  progress: null,
  link: keepLink,
  tele: keepLink,
  cnameTarget: finalTarget,
  details: { from: "3f-thanhnhan", to: "landing-page-5f", cleanedGhosts: removeOnly },
});

// verify
for (let i=0;i<6;i++) {
  await new Promise(r=>setTimeout(r,8000));
  const live = await liveLink(switchDom);
  log("live try", i+1, live);
  if (live && live === keepLink) { log("LIVE_OK"); break; }
}

// final 3f json apex
const left = JSON.parse(fs.readFileSync(p3+"/domains.json","utf8"));
log("3f apex left", Object.keys(left).filter(k=>!k.startsWith("www.")));
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", (code) => {
      console.log(o || "(empty)");
      console.log("exit", code);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
