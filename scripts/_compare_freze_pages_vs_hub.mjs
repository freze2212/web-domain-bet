/**
 * Compare Freze CF Pages projects vs hub ACTIVE_TEMPLATES.
 * Run on VPS or local with CF env.
 */
import { config } from "../src/config.js";
import { getAllPagesProjectsForAccount } from "../src/cloudflare.js";
import { ACTIVE_TEMPLATES, listTemplates } from "../src/templates.js";
import fs from "fs";

const FREZE = config.cloudflare.accountId();
const projects = await getAllPagesProjectsForAccount(FREZE);
const tpl = listTemplates();

const inHub = new Set();
for (const t of tpl) {
  const base = String(t.pagesProject || "").replace(/-\d+$/, "");
  if (base) inHub.add(base.toLowerCase());
  if (t.pagesProject) inHub.add(String(t.pagesProject).toLowerCase());
  if (t.cnameTarget) inHub.add(String(t.cnameTarget).replace(/\.pages\.dev$/i, "").toLowerCase());
}

function rootBase(name) {
  return String(name || "").replace(/-\d+$/, "").toLowerCase();
}

const lpLike = (projects || []).filter((p) => {
  const n = String(p.name || "").toLowerCase();
  // landing-ish naming; skip obvious non-LP
  if (/media|vault|sexy|tool|api|server/i.test(n)) return false;
  return /lp-|landing|gg88|mm88|llwin|xx88|5uae|5f-|page|xoamaan|vip|fly|gt9|c168|uae|1a-|7f-|9d-|3c-|5h-|xoatong|game/i.test(n);
});

const missing = [];
const covered = [];
for (const p of lpLike) {
  const n = p.name.toLowerCase();
  const base = rootBase(n);
  const hit = inHub.has(n) || inHub.has(base);
  const row = {
    name: p.name,
    git: p.source?.type || "direct?",
    subdomain: p.subdomain || `${p.name}.pages.dev`,
  };
  if (hit) covered.push(row);
  else missing.push(row);
}

const report = {
  at: new Date().toISOString(),
  frezeAccountId: FREZE,
  hubTemplates: tpl.length,
  frezePagesTotal: (projects || []).length,
  lpLikeCount: lpLike.length,
  coveredCount: covered.length,
  missingOnHubCount: missing.length,
  missingOnHub: missing.sort((a, b) => a.name.localeCompare(b.name)),
  hubProjects: [...inHub].sort(),
};

fs.writeFileSync("data/_FREZE_PAGES_VS_HUB.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  hubTemplates: report.hubTemplates,
  frezePagesTotal: report.frezePagesTotal,
  lpLike: report.lpLikeCount,
  covered: report.coveredCount,
  missing: report.missingOnHubCount,
  missingNames: report.missingOnHub.map((x) => x.name),
}, null, 2));
