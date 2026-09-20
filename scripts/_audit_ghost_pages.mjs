/**
 * Audit Freze + Admin zones:
 * 1) Ghost: CNAME → *.pages.dev but Pages project missing
 * 2) Orphan: project exists but custom domain NOT on that Pages project (→ Error 1014)
 */
import fs from "fs";
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const { cfRequest } = await import("../src/cloudflare.js");
const accId = process.env.CLOUDFLARE_ACCOUNT_ID;
const adminTok = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const adminAcc = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const frezeTok = process.env.CLOUDFLARE_API_TOKEN;

const projectCache = new Map(); // name -> { ok, subdomain } | { ok:false }
const projectDomainsCache = new Map(); // name -> Set of domain names lowercased

async function pagesMeta(name) {
  const key = name.toLowerCase();
  if (projectCache.has(key)) return projectCache.get(key);
  try {
    const p = await cfRequest(`/accounts/${accId}/pages/projects/${encodeURIComponent(name)}`);
    const meta = { ok: true, subdomain: p?.subdomain || `${name}.pages.dev` };
    projectCache.set(key, meta);
    return meta;
  } catch {
    const miss = { ok: false };
    projectCache.set(key, miss);
    return miss;
  }
}

async function pagesDomainSet(name) {
  const key = name.toLowerCase();
  if (projectDomainsCache.has(key)) return projectDomainsCache.get(key);
  try {
    const doms = await cfRequest(
      `/accounts/${accId}/pages/projects/${encodeURIComponent(name)}/domains`
    );
    const set = new Set((doms || []).map((d) => String(d.name || "").toLowerCase()));
    projectDomainsCache.set(key, set);
    return set;
  } catch {
    const empty = new Set();
    projectDomainsCache.set(key, empty);
    return empty;
  }
}

function projectFromCname(content) {
  const c = String(content || "").toLowerCase().replace(/\.$/, "");
  const m = c.match(/^([a-z0-9-]+)\.pages\.dev$/);
  return m ? m[1] : null;
}

async function listAllZones(token, accountId) {
  const zones = [];
  let page = 1;
  while (page <= 80) {
    const path = `/zones?page=${page}&per_page=50&account.id=${accountId}`;
    const batch = await cfRequest(path, { token });
    if (!Array.isArray(batch) || batch.length === 0) break;
    zones.push(...batch);
    if (batch.length < 50) break;
    page++;
  }
  return zones;
}

console.log("Listing zones...");
const frezeZones = await listAllZones(frezeTok, accId);
console.log("Freze zones:", frezeZones.length);
let adminZones = [];
if (adminTok && adminAcc) {
  adminZones = await listAllZones(adminTok, adminAcc);
  console.log("Admin zones:", adminZones.length);
}

const allZones = [
  ...frezeZones.map((z) => ({ ...z, _token: frezeTok, _label: "freze" })),
  ...adminZones.map((z) => ({ ...z, _token: adminTok, _label: "admin" })),
];

const ghost = [];
const orphan = []; // project exists, domain not bound
let scanned = 0;
const CONCURRENCY = 10;

async function scanZone(zone) {
  if (zone.status !== "active") return;
  scanned++;
  let records = [];
  try {
    records =
      (await cfRequest(`/zones/${zone.id}/dns_records?type=CNAME&per_page=100`, {
        token: zone._token,
      })) || [];
  } catch {
    return;
  }

  const zoneName = String(zone.name || "").toLowerCase();
  for (const r of records) {
    const proj = projectFromCname(r.content);
    if (!proj) continue;

    // Only care apex / www of the zone (not random subdomains)
    const recName = String(r.name || "").toLowerCase().replace(/\.$/, "");
    const isApexOrWww = recName === zoneName || recName === `www.${zoneName}`;
    if (!isApexOrWww) continue;

    const meta = await pagesMeta(proj);
    const row = {
      zone: zone.name,
      account: zone._label,
      record: r.name,
      cname: r.content,
      project: proj,
      proxied: r.proxied,
    };

    if (!meta.ok) {
      ghost.push(row);
      continue;
    }

    const bound = await pagesDomainSet(proj);
    const want = [recName, zoneName, `www.${zoneName}`];
    const has = want.some((d) => bound.has(d));
    if (!has) {
      orphan.push({ ...row, boundCount: bound.size });
    }
  }
}

for (let i = 0; i < allZones.length; i += CONCURRENCY) {
  const chunk = allZones.slice(i, i + CONCURRENCY);
  await Promise.all(chunk.map(scanZone));
  if (i % (CONCURRENCY * 5) === 0) {
    process.stdout.write(
      `\rzones ${Math.min(i + CONCURRENCY, allZones.length)}/${allZones.length} ghost=${ghost.length} orphan=${orphan.length}   `
    );
  }
}
console.log("\n");

function groupByProject(rows) {
  const m = {};
  for (const r of rows) {
    m[r.project] = m[r.project] || [];
    m[r.project].push(r.zone);
  }
  return Object.entries(m)
    .map(([project, domains]) => ({
      project,
      count: new Set(domains).size,
      domains: [...new Set(domains)].sort(),
    }))
    .sort((a, b) => b.count - a.count);
}

const ghostSummary = groupByProject(ghost);
const orphanSummary = groupByProject(orphan);

console.log("=== 1) GHOST Pages projects (CNAME → project không tồn tại) ===");
console.log(JSON.stringify(ghostSummary, null, 2));
console.log("\nChi tiết ghost:");
for (const g of ghost.sort((a, b) => a.project.localeCompare(b.project) || a.zone.localeCompare(b.zone))) {
  console.log(`  [${g.account}] ${g.zone}  ${g.record} → ${g.cname}`);
}

console.log("\n=== 2) ORPHAN bindings (project còn, nhưng domain CHƯA gắn Custom Domain) ===");
console.log(JSON.stringify(orphanSummary, null, 2));
console.log("\nChi tiết orphan:");
for (const o of orphan.sort((a, b) => a.project.localeCompare(b.project) || a.zone.localeCompare(b.zone))) {
  console.log(`  [${o.account}] ${o.zone}  ${o.record} → ${o.cname}`);
}

const out = {
  scannedZones: scanned,
  ghostCount: ghost.length,
  orphanCount: orphan.length,
  ghostProjects: ghostSummary,
  orphanProjects: orphanSummary,
  ghosts: ghost,
  orphans: orphan,
};
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/_ghost_pages_audit.json", JSON.stringify(out, null, 2));
console.log(`\nWrote data/_ghost_pages_audit.json`);
console.log(`TOTAL ghost=${ghost.length} orphan=${orphan.length}`);
