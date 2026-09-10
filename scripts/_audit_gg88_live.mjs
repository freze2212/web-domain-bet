import fs from "fs";
import path from "path";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  const p = resolve(ROOT, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const inv = JSON.parse(fs.readFileSync(resolve(ROOT, "data/_gg88_audit_local.json"), "utf8"));
const zonesCachePath = resolve(ROOT, "data/cf_zones_cache.json");
const zonesCache = fs.existsSync(zonesCachePath) ? JSON.parse(fs.readFileSync(zonesCachePath, "utf8")) : [];
const zoneByName = new Map(zonesCache.map((z) => [String(z.name || "").toLowerCase(), z]));

const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function cf(path) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers });
  const j = await r.json();
  if (!j.success) throw new Error(JSON.stringify(j.errors || j));
  return j.result;
}

function normalizeCname(content) {
  return String(content || "").toLowerCase().replace(/\.$/, "");
}

function linkOf(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry.main_url || entry.url || entry.link || "";
}

async function getApexCname(domain, zoneId) {
  if (!zoneId) return null;
  try {
    const recs = await cf(`/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(domain)}`);
    const hit = (recs || []).find((r) => r.name === domain || r.name === `${domain}.`);
    return hit ? normalizeCname(hit.content) : null;
  } catch {
    return null;
  }
}

async function fetchLiveLink(domain) {
  try {
    const r = await fetch(`https://${domain}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!r.ok) return { ok: false, status: r.status, link: "" };
    const dj = await r.json();
    const entry = dj[domain] || dj[`www.${domain}`] || dj[domain.replace(/^www\./, "")];
    return { ok: true, status: r.status, link: linkOf(entry), hasEntry: !!entry };
  } catch (e) {
    return { ok: false, status: 0, link: "", error: e.message };
  }
}

async function fetchConfigFallback(domain) {
  try {
    const r = await fetch(`https://${domain}/config.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return "";
    const j = await r.json();
    return j.main_url || "";
  } catch {
    return "";
  }
}

function classify(item, cname, live) {
  const expected = item.expectedCnames || [];
  const issues = [];
  if (!cname) issues.push("NO_CNAME_OR_UNKNOWN_ZONE");
  else if (expected.length && !expected.some((e) => cname === e || cname.startsWith(e.replace(".pages.dev", "")))) {
    // allow any *.pages.dev that matches expected list exactly
    if (!expected.includes(cname)) issues.push("CNAME_MISMATCH_VS_FOLDER");
  }
  if (!live.ok) issues.push("LIVE_DOMAINS_JSON_FAIL");
  else if (!live.hasEntry) issues.push("MISSING_IN_LIVE_DOMAINS_JSON");
  else if (item.primaryLink && live.link && item.primaryLink !== live.link) issues.push("LIVE_LINK_NEQ_LOCAL");
  else if (!live.link) issues.push("LIVE_LINK_EMPTY");

  // folder expects X but cname is different pages project family
  if (cname && expected.length && !expected.includes(cname)) {
    issues.push(`LIVE_ON=${cname}`);
  }

  return issues;
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

const domains = inv.domains;
console.log("Auditing", domains.length, "GG88 domains...");

// Phase 1: resolve CNAME via zone cache + CF API (batched)
const withZone = domains.map((d) => {
  const z = zoneByName.get(d.domain);
  return { ...d, zoneId: z?.id || null, zoneStatus: z?.status || null, accountName: z?.accountName || null };
});

const cnameResults = await mapPool(withZone, 8, async (d) => {
  const cname = d.zoneId ? await getApexCname(d.domain, d.zoneId) : null;
  return { domain: d.domain, cname, zoneId: d.zoneId };
});
const cnameMap = new Map(cnameResults.map((x) => [x.domain, x.cname]));

// Phase 2: live domains.json for ALL (concurrency 20)
const liveResults = await mapPool(withZone, 20, async (d) => {
  const live = await fetchLiveLink(d.domain);
  return { domain: d.domain, live };
});
const liveMap = new Map(liveResults.map((x) => [x.domain, x.live]));

// Summarize
const report = {
  generatedAt: new Date().toISOString(),
  total: domains.length,
  counts: {
    ok: 0,
    cnameMismatch: 0,
    liveLinkNeqLocal: 0,
    missingLiveEntry: 0,
    liveFetchFail: 0,
    noCnameOrZone: 0,
    multiFolderLocal: inv.multiFolder,
    multiLinkLocal: inv.multiLink,
  },
  cnameTargets: {},
  samples: {
    cnameMismatch: [],
    liveLinkNeqLocal: [],
    missingLiveEntry: [],
    liveFetchFail: [],
    ok: [],
  },
  rows: [],
};

for (const d of withZone) {
  const cname = cnameMap.get(d.domain) || null;
  const live = liveMap.get(d.domain) || { ok: false };
  const issues = classify(d, cname, live);

  if (cname) report.cnameTargets[cname] = (report.cnameTargets[cname] || 0) + 1;

  const row = {
    domain: d.domain,
    folder: d.primaryFolder,
    localLink: d.primaryLink,
    liveLink: live.link || "",
    cname,
    issues,
    multiFolder: d.folders.length > 1,
    multiLink: d.links.length > 1,
  };
  report.rows.push(row);

  if (issues.length === 0) {
    report.counts.ok++;
    if (report.samples.ok.length < 10) report.samples.ok.push(row);
  }
  if (issues.includes("CNAME_MISMATCH_VS_FOLDER") || issues.some((x) => x.startsWith("LIVE_ON="))) {
    report.counts.cnameMismatch++;
    if (report.samples.cnameMismatch.length < 40) report.samples.cnameMismatch.push(row);
  }
  if (issues.includes("LIVE_LINK_NEQ_LOCAL")) {
    report.counts.liveLinkNeqLocal++;
    if (report.samples.liveLinkNeqLocal.length < 40) report.samples.liveLinkNeqLocal.push(row);
  }
  if (issues.includes("MISSING_IN_LIVE_DOMAINS_JSON")) {
    report.counts.missingLiveEntry++;
    if (report.samples.missingLiveEntry.length < 30) report.samples.missingLiveEntry.push(row);
  }
  if (issues.includes("LIVE_DOMAINS_JSON_FAIL")) {
    report.counts.liveFetchFail++;
    if (report.samples.liveFetchFail.length < 20) report.samples.liveFetchFail.push(row);
  }
  if (issues.includes("NO_CNAME_OR_UNKNOWN_ZONE")) {
    report.counts.noCnameOrZone++;
  }
}

// Sample config.json fallback presence on mismatch / ok landing-page-uae
const sampleDomains = [
  ...report.samples.cnameMismatch.slice(0, 5).map((r) => r.domain),
  ...report.samples.liveLinkNeqLocal.slice(0, 5).map((r) => r.domain),
  ...report.samples.ok.slice(0, 3).map((r) => r.domain),
].filter(Boolean);

report.configFallbackSamples = [];
for (const domain of sampleDomains) {
  const fb = await fetchConfigFallback(domain);
  const live = liveMap.get(domain);
  report.configFallbackSamples.push({
    domain,
    configMainUrl: fb,
    liveDomainsLink: live?.link || "",
    differs: !!(fb && live?.link && fb !== live.link),
  });
}

const outPath = resolve(ROOT, "data/_gg88_audit_live.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  total: report.total,
  counts: report.counts,
  topCnameTargets: Object.entries(report.cnameTargets).sort((a, b) => b[1] - a[1]).slice(0, 20),
  sampleCnameMismatch: report.samples.cnameMismatch.slice(0, 12).map((r) => ({
    domain: r.domain, folder: r.folder, cname: r.cname, local: r.localLink, live: r.liveLink,
  })),
  sampleLiveNeqLocal: report.samples.liveLinkNeqLocal.slice(0, 12).map((r) => ({
    domain: r.domain, folder: r.folder, cname: r.cname, local: r.localLink, live: r.liveLink,
  })),
  configFallbackSamples: report.configFallbackSamples,
  outPath,
}, null, 2));
