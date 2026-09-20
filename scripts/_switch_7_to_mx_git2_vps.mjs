import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { getTemplate } from "../src/templates.js";
import { findDomainInRepos, removeDomainFromRepo } from "../src/repo-scanner.js";
import {
  addPagesDomain,
  ensurePagesCname,
  deleteForwardingPageRules,
  findZoneByName,
  tokenForZone,
  waitForPagesDomainActive,
  removeDomainFromAllPagesProjects,
} from "../src/cloudflare.js";
import { assignDomain } from "../src/ownership.js";
import { addHistoryItem, updateHistoryItem } from "../src/history.js";

const execAsync = promisify(exec);
const TARGET_TPL = "lp_gg88_mx";
const domains = [
  "gg88t.net",
  "gg88h.us",
  "gg88t.us",
];
const KEEP_LINKS = {
  "gg88h.uk": "https://www.gg8832.com/?id=894528974",
  "gg88k.uk": "https://www.gg8832.com/?id=851471280",
  "gg88top.win": "https://gg8817.com/?id=140366098",
  "gg88d.net": "https://gg8826.com/?id=769240761",
  "gg88t.net": "https://www.gg8824.com/?id=114851179",
  "gg88h.us": "https://www.gg8826.com/home/register?id=170291680",
  "gg88t.us": "https://gg8817.com/?id=720657617",
};

function log(...a) {
  const line = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  console.log(line);
  fs.appendFileSync("/tmp/_switch_mx_7.log", line + "\n");
}

/** Ghi domains.json + push — merge key với origin, KHÔNG reset --hard */
async function writeMxDomainsJson(tplPath, domain, link, tele) {
  const djPath = `${tplPath}/domains.json`;
  await execAsync("git fetch origin", { cwd: tplPath });
  const show = await execAsync("git show-ref", { cwd: tplPath });
  const refs = show.stdout || "";
  const remoteRef = refs.includes("refs/remotes/origin/main") ? "origin/main" : "origin/master";
  const localBranch = remoteRef.endsWith("/main") ? "main" : "master";

  let remoteObj = {};
  let localObj = {};
  try {
    const remoteDj = await execAsync(`git show ${remoteRef}:domains.json`, { cwd: tplPath });
    remoteObj = JSON.parse(remoteDj.stdout || "{}");
  } catch {}
  if (fs.existsSync(djPath)) {
    try {
      localObj = JSON.parse(fs.readFileSync(djPath, "utf8"));
    } catch {}
  }
  const entry = {
    main_url: link,
    messenger_url: tele || link,
    telegram_url: tele || link,
  };
  const dj = { ...remoteObj, ...localObj };
  dj[domain] = entry;
  dj[`www.${domain}`] = entry;
  fs.writeFileSync(djPath, JSON.stringify(dj, null, 2));

  await execAsync(`git checkout ${localBranch}`, { cwd: tplPath }).catch(() => {});
  await execAsync(`git merge --no-edit -X ours ${remoteRef}`, { cwd: tplPath }).catch(async () => {
    await execAsync("git merge --abort", { cwd: tplPath }).catch(() => {});
  });
  // Ghi lại entry sau merge (đảm bảo không bị mất)
  let again = {};
  try {
    again = JSON.parse(fs.readFileSync(djPath, "utf8"));
  } catch {}
  const finalDj = { ...remoteObj, ...again };
  finalDj[domain] = entry;
  finalDj[`www.${domain}`] = entry;
  fs.writeFileSync(djPath, JSON.stringify(finalDj, null, 2));

  await execAsync("git add domains.json", { cwd: tplPath });
  await execAsync(`git commit -m "Auto add/update domain ${domain}"`, { cwd: tplPath }).catch(() => {});
  await execAsync(`git push origin ${localBranch}`, { cwd: tplPath });
}

fs.writeFileSync("/tmp/_switch_mx_7.log", `START ${new Date().toISOString()}\n`);
const template = getTemplate(TARGET_TPL);
if (!template) throw new Error("missing template");
log("TEMPLATE", template.id, template.pagesProject, template.path, fs.existsSync(template.path));

const results = [];
for (const domain of domains) {
  log("\n========", domain, "========");
  const link = KEEP_LINKS[domain];
  const tele = link;
  if (!link) {
    results.push({ domain, ok: false, error: "no keep link" });
    continue;
  }
  log("KEEP_LINK", link);

  const histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  addHistoryItem({
    id: histId,
    domain,
    actionType: "SWITCH_TPL",
    actionLabel: "Đổi Mẫu Landing Page",
    templateName: template.name,
    templateId: template.id,
    cnameTarget: template.cnameTarget,
    link,
    tele,
    status: "in_progress",
    progress: `Đang chuyển sang [${template.name}] — giữ link`,
    userId: "u_admin",
    username: "admin",
    fullName: "Admin",
    details: { keepLiveLink: true, onlyThese7: true },
  });

  try {
    const matches = findDomainInRepos(domain);
    const removed = [];
    for (const m of matches) {
      // Không xoá entry trong chính folder mx nếu đã có
      if (String(m.filePath || "").includes("/lp-gg88-mx/")) continue;
      const ok = await removeDomainFromRepo(domain, m.filePath);
      if (ok) removed.push(m.filePath);
    }
    log("removed ghosts", removed.length, removed.map((p) => p.replace("/var/www/Landingpages/", "")));

    const zone = await findZoneByName(domain).catch(() => null);
    if (zone) await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) }).catch(() => {});

    let finalTarget = template.cnameTarget;
    const pagesRes = await addPagesDomain(domain, template.pagesProject, template.path, {});
    log("pages", pagesRes);
    if (pagesRes?.canonicalSubdomain) finalTarget = pagesRes.canonicalSubdomain;
    await ensurePagesCname(domain, finalTarget);
    log("cname", finalTarget);
    if (pagesRes?.projectName) {
      await waitForPagesDomainActive(pagesRes.projectName, domain, pagesRes.accountId || undefined, 90000).catch((e) =>
        log("wait", e.message)
      );
    }

    await removeDomainFromAllPagesProjects(domain, null, {
      hintProjects: ["lp-gg88-vip-2", "lp-gg88-vip-8", "gg88-lp-5uae", "landing-page-uae"],
      exceptProjects: [template.pagesProject, "lp-gg88-mx-git2", pagesRes?.projectName].filter(Boolean),
    }).catch((e) => log("rm pages", e.message));

    await writeMxDomainsJson(template.path, domain, link, tele);
    log("domains.json pushed");

    assignDomain(domain, "u_admin", {
      mode: "LP",
      currentLink: link,
      tele,
      templateId: template.id,
      templateName: template.name,
      cnameTarget: finalTarget,
    });

    updateHistoryItem(histId, {
      status: "success",
      progress: null,
      link,
      tele,
      cnameTarget: finalTarget,
      details: { keepLiveLink: true, removedRepos: removed, finalTarget },
    });
    results.push({ domain, ok: true, link, finalTarget, removed: removed.length });
  } catch (err) {
    log("FAIL", domain, err.message);
    updateHistoryItem(histId, { status: "failed", error: err.message, progress: null });
    results.push({ domain, ok: false, error: err.message, link });
  }
}

fs.writeFileSync("/tmp/_switch_mx_7.json", JSON.stringify(results, null, 2));
log("\n==== SUMMARY ====");
log(JSON.stringify(results, null, 2));
