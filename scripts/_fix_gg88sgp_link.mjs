import { Client } from "ssh2";

const cmd = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
node --input-type=module <<'NODE'
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { getTemplate, updateTemplateDomainsJson } from "./src/templates.js";
import { updateHistoryItem } from "./src/history.js";
import { assignDomain } from "./src/ownership.js";

const execAsync = promisify(exec);
const domain = "gg88sgp.com";
const link = "https://gg8847.com/?id=622036541";
const tele = link;
const histId = "hist_1789389300731_px86b";

// inspect both folders
for (const p of [
  "/var/www/Landingpages/GG88/landing-page-5f",
  "/var/www/Landingpages/GG88/3f-thanhnhan",
]) {
  console.log("\\n==", p);
  try {
    const { stdout: rem } = await execAsync("git remote -v", { cwd: p });
    console.log(rem.trim());
    const { stdout: br } = await execAsync("git branch -vv", { cwd: p });
    console.log(br.trim().split("\\n").slice(0,3).join(" | "));
    const j = JSON.parse(fs.readFileSync(p+"/domains.json","utf8"));
    console.log("entry", j[domain] || j["www."+domain]);
  } catch (e) { console.log("err", e.message); }
}

const tpl = getTemplate("landingpage_5f_g");
console.log("\\nTPL", tpl?.id, tpl?.path, tpl?.pagesProject, fs.existsSync(tpl?.path));

console.log("\\nUpdating via updateTemplateDomainsJson...");
const res = await updateTemplateDomainsJson(tpl, domain, link, tele);
console.log("pushRes", JSON.stringify(res?.gitPush || res).slice(0,400));

assignDomain(domain, "u_admin", {
  mode: "LP",
  currentLink: link,
  tele,
  templateId: tpl.id,
  templateName: tpl.name,
  cnameTarget: tpl.cnameTarget,
});

updateHistoryItem(histId, {
  status: "success",
  progress: null,
  error: null,
  link,
  tele,
  templateId: tpl.id,
  templateName: tpl.name,
  cnameTarget: tpl.cnameTarget,
  liveStatus: "PENDING_200",
  details: { fixedManually: true, reason: "wrote wrong local clone 3f-thanhnhan; fixed on landing-page-5f" },
});

console.log("waiting live...");
for (let i=0;i<8;i++) {
  await new Promise(r=>setTimeout(r,8000));
  try {
    const j = await (await fetch("https://"+domain+"/domains.json",{headers:{"user-agent":"Mozilla/5.0"},signal:AbortSignal.timeout(15000)})).json();
    const e = j[domain] || j["www."+domain];
    const live = e?.main_url || null;
    console.log("try", i+1, live);
    if (live && live.includes("622036541")) { console.log("LIVE_OK"); break; }
  } catch (e) { console.log("try", i+1, e.message); }
}
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
