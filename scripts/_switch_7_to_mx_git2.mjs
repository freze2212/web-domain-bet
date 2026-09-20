import { Client } from "ssh2";

const remote = `
cd /var/www/web-ten-mien
set -a; . ./.env; set +a
export TZ=Asia/Ho_Chi_Minh

node --input-type=module <<'NODE'
import fs from "fs";
import { getTemplate, updateTemplateDomainsJson } from "./src/templates.js";
import { findDomainInRepos, removeDomainFromRepo } from "./src/repo-scanner.js";
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

const TARGET_TPL = "lp_gg88_mx";
const domains = [
  "gg88h.uk",
  "gg88k.uk",
  "gg88top.win",
  "gg88d.net",
  "gg88t.net",
  "gg88h.us",
  "gg88t.us",
];

async function probeLiveLink(domain) {
  try {
    const r = await fetch(\`https://\${domain}/\`, { redirect: "manual", signal: AbortSignal.timeout(18000) });
    const loc = r.headers.get("location");
    if (loc) return { link: loc, mode: "302", http: r.status };
  } catch {}
  try {
    const dj = await fetch(\`https://\${domain}/domains.json\`, { signal: AbortSignal.timeout(15000) });
    if (dj.ok) {
      const j = await dj.json();
      const e = j[domain] || j[\`www.\${domain}\`];
      const link = e?.main_url || e?.messenger_url || e?.telegram_url || null;
      const tele = e?.telegram_url || e?.messenger_url || link;
      return { link, tele, mode: "LP", http: 200, entry: e };
    }
  } catch (e) {
    return { link: null, err: e.message };
  }
  return { link: null };
}

const template = getTemplate(TARGET_TPL);
if (!template) throw new Error("missing template " + TARGET_TPL);
const tplPath = template.path;
console.log("TEMPLATE", template.id, template.pagesProject, tplPath, "exists", fs.existsSync(tplPath));

const results = [];

for (const domain of domains) {
  console.log("\\n========", domain, "========");
  const live = await probeLiveLink(domain);
  console.log("LIVE", live);
  if (!live.link) {
    results.push({ domain, ok: false, error: "no live link" });
    continue;
  }
  const link = live.link;
  const tele = live.tele || live.entry?.telegram_url || live.entry?.messenger_url || link;

  const histId = \`hist_\${Date.now()}_\${Math.random().toString(36).slice(2, 7)}\`;
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
    progress: \`Đang chuyển sang mẫu [\${template.name}] — giữ link live\`,
    userId: "u_admin",
    username: "admin",
    fullName: "Admin",
    details: { keepLiveLink: true, previousLive: link },
  });

  try {
    // 1) remove from ALL local repos (ghost cleanup)
    const matches = findDomainInRepos(domain);
    const removed = [];
    for (const m of matches) {
      const ok = await removeDomainFromRepo(domain, m.filePath);
      if (ok) removed.push(m.filePath);
    }
    console.log("removed repos", removed.length, removed.map((p) => p.replace("/var/www/Landingpages/", "")));

    // 2) drop 302 page rules if any
    const zone = await findZoneByName(domain).catch(() => null);
    if (zone) {
      await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) }).catch(() => {});
    }

    // 3) add to mx-git2 Pages FIRST (tránh 1014 Cross-User Banned)
    let finalTarget = template.cnameTarget;
    const pagesRes = await addPagesDomain(domain, template.pagesProject, template.path, {});
    console.log("pages", pagesRes);
    if (pagesRes?.canonicalSubdomain) finalTarget = pagesRes.canonicalSubdomain;

    // 4) CNAME -> mx
    await ensurePagesCname(domain, finalTarget);
    console.log("cname ->", finalTarget);

    if (pagesRes?.projectName) {
      await waitForPagesDomainActive(pagesRes.projectName, domain, pagesRes.accountId || undefined, 90000).catch((e) =>
        console.warn("wait active", e.message)
      );
    }

    // 5) gỡ custom domain khỏi Pages cũ (giữ mx)
    await removeDomainFromAllPagesProjects(domain, null, {
      hintProjects: ["lp-gg88-vip-2", "lp-gg88-vip-8", "gg88-lp-5uae", "landing-page-uae", "lp-gg88-vip"],
      exceptProjects: [template.pagesProject, "lp-gg88-mx-git2", pagesRes?.projectName].filter(Boolean),
    }).catch((e) => console.warn("remove pages warn", e.message));

    // 6) write domains.json on NEW template only + deploy/git
    await updateTemplateDomainsJson(template, domain, link, tele);
    console.log("domains.json updated on mx");

    // 7) ownership
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

    results.push({ domain, ok: true, link, finalTarget, removed: removed.length, histId });
  } catch (err) {
    console.error("FAIL", domain, err.message);
    updateHistoryItem(histId, { status: "failed", error: err.message, progress: null });
    results.push({ domain, ok: false, error: err.message, link });
  }
}

fs.writeFileSync("/tmp/_switch_mx_7.json", JSON.stringify(results, null, 2));
console.log("\\n==== SUMMARY ====");
console.log(JSON.stringify(results, null, 2));
NODE
`;

const c = new Client();
c.on("ready", () => {
  c.exec(remote, (e, s) => {
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
