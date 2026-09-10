/**
 * Sync domains.json from config.js LINK_CONFIG for Git LP templates.
 * Also scan Freze+Admin Pages Git projects for config↔domains.json drift.
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

const CF = process.env.CLOUDFLARE_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER || "freze2212";

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || e.register_url || "";
}

function norm(u) {
  try {
    const x = new URL(String(u).trim());
    x.hash = "";
    let s = x.toString();
    if (s.endsWith("/") && !x.search) s = s.slice(0, -1);
    return s;
  } catch {
    return String(u || "")
      .trim()
      .replace(/\/$/, "");
  }
}

function apexOf(d) {
  d = String(d).toLowerCase().trim();
  while (d.startsWith("www.")) d = d.slice(4);
  return d;
}

function entry(link) {
  return {
    main_url: link,
    messenger_url: link,
    register_url: link,
    app_url: link,
    cskh_url: link,
  };
}

function parseConfigDomains(jsText) {
  // Extract domains: { ... } from LINK_CONFIG
  const m = jsText.match(/domains\s*:\s*\{/);
  if (!m) return {};
  let i = m.index + m[0].length - 1;
  let depth = 0;
  let end = -1;
  for (; i < jsText.length; i++) {
    if (jsText[i] === "{") depth++;
    else if (jsText[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return {};
  const objText = jsText.slice(m.index + m[0].length - 1, end + 1);
  // Convert JS object-ish to JSON-ish
  let jsonish = objText
    .replace(/\/\/[^\n]*/g, "")
    .replace(/,\s*}/g, "}")
    .replace(/'/g, '"');
  // quote bare keys if any
  try {
    return JSON.parse(jsonish);
  } catch {
    const map = {};
    const re = /["']([^"']+)["']\s*:\s*["']([^"']*)["']/g;
    let mm;
    while ((mm = re.exec(objText))) {
      map[mm[1]] = mm[2];
    }
    return map;
  }
}

async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "sync-config-dj",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, json: await r.json() };
}

async function listGitPages(acc) {
  const out = [];
  let page = 1;
  while (page <= 30) {
    const j = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/pages/projects?page=${page}`,
      { headers: { Authorization: `Bearer ${CF}` } }
    ).then((r) => r.json());
    if (!j.success) break;
    for (const p of j.result || []) {
      if (p.source?.type !== "github") continue;
      const repo = p.source?.config
        ? `${p.source.config.owner}/${p.source.config.repo_name}`
        : null;
      if (!repo) continue;
      out.push({
        account: acc === AID ? "freze" : "admin",
        name: p.name,
        subdomain: p.subdomain || `${p.name}.pages.dev`,
        repo,
        branch: p.source.config.production_branch || "main",
      });
    }
    const info = j.result_info;
    if (!info || page >= (info.total_pages || 1)) break;
    page++;
  }
  return out;
}

async function analyzeProject(proj) {
  const base = `https://${proj.subdomain}`;
  let cfgText = "";
  let dj = null;
  try {
    const r = await fetch(`${base}/config.js?v=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    if (r.ok) cfgText = await r.text();
  } catch {}
  try {
    const r = await fetch(`${base}/js/config.js?v=${Date.now()}`, { signal: AbortSignal.timeout(10000) });
    if (r.ok && !cfgText) cfgText = await r.text();
  } catch {}
  try {
    const r = await fetch(`${base}/domains.json?v=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    if (r.ok) dj = await r.json();
  } catch {}

  if (!cfgText || !cfgText.includes("LINK_CONFIG")) {
    return { ...proj, skip: "no_link_config", missing: [], mismatch: [] };
  }
  if (!dj || typeof dj !== "object") {
    return { ...proj, skip: "no_domains_json", missing: [], mismatch: [] };
  }

  const cfgMap = parseConfigDomains(cfgText);
  // collapse www duplicates → apex map
  const byApex = new Map();
  for (const [host, link] of Object.entries(cfgMap)) {
    if (!link || host === "default") continue;
    const a = apexOf(host);
    if (!a || a.includes(" ")) continue;
    // prefer non-www key already handled by apex
    if (!byApex.has(a) || !String(host).startsWith("www.")) byApex.set(a, String(link));
  }

  const missing = [];
  const mismatch = [];
  for (const [a, link] of byApex) {
    const cur = linkOf(dj[a] || dj[`www.${a}`]);
    if (!cur) missing.push({ domain: a, link });
    else if (norm(cur) !== norm(link)) mismatch.push({ domain: a, config: link, domainsJson: cur });
  }
  return { ...proj, skip: null, cfgCount: byApex.size, missing, mismatch };
}

async function syncRepo(repoFull, branch, updates) {
  if (!updates.length) return { changed: 0 };
  const [owner, repo] = repoFull.split("/");
  const meta = await gh("GET", `/repos/${owner}/${repo}/contents/domains.json?ref=${branch}`);
  if (!meta.ok) throw new Error(`${repoFull} GET domains.json ${meta.status} ${meta.json.message}`);
  let data;
  try {
    data = JSON.parse(Buffer.from(meta.json.content, "base64").toString("utf8"));
  } catch (e) {
    throw new Error(`${repoFull} bad domains.json: ${e.message}`);
  }

  let changed = 0;
  for (const u of updates) {
    if (norm(linkOf(data[u.domain] || data[`www.${u.domain}`])) === norm(u.link)) continue;
    const e = entry(u.link);
    data[u.domain] = e;
    data[`www.${u.domain}`] = e;
    changed++;
  }
  if (!changed) return { changed: 0 };

  const body = JSON.stringify(data, null, 2) + "\n";
  JSON.parse(body);
  const put = await gh("PUT", `/repos/${owner}/${repo}/contents/domains.json`, {
    message: `sync(domains): fill ${changed} entries from config.js LINK_CONFIG`,
    content: Buffer.from(body, "utf8").toString("base64"),
    sha: meta.json.sha,
    branch,
  });
  if (!put.ok) throw new Error(`${repoFull} PUT ${put.status} ${JSON.stringify(put.json)}`);
  return { changed, commit: put.json.commit?.sha };
}

const freze = await listGitPages(AID);
const admin = await listGitPages(AA);
const projects = [...freze, ...admin];

// Prefer unique by repo+name
const seen = new Set();
const uniq = [];
for (const p of projects) {
  const k = `${p.account}:${p.name}`;
  if (seen.has(k)) continue;
  seen.add(k);
  uniq.push(p);
}

console.log(`Scanning ${uniq.length} Git Pages projects for config.js drift...\n`);

const report = { at: new Date().toISOString(), scanned: 0, withConfig: 0, drifted: [], synced: [], errors: [] };

for (const p of uniq) {
  process.stderr.write(`scan ${p.account}/${p.name}...\n`);
  let a;
  try {
    a = await analyzeProject(p);
  } catch (e) {
    report.errors.push({ project: p.name, error: e.message });
    continue;
  }
  report.scanned++;
  if (a.skip) continue;
  report.withConfig++;
  if (!a.missing.length && !a.mismatch.length) continue;

  const row = {
    account: p.account,
    project: p.name,
    repo: p.repo,
    pagesDev: p.subdomain,
    missing: a.missing.length,
    mismatch: a.mismatch.length,
    missingDomains: a.missing.map((x) => x.domain),
    mismatchDomains: a.mismatch.map((x) => x.domain),
  };
  report.drifted.push(row);
  console.log(
    `DRIFT ${p.account}/${p.name} missing=${a.missing.length} mismatch=${a.mismatch.length} → ${a.missing
      .map((x) => x.domain)
      .slice(0, 8)
      .join(",")}`
  );

  // Sync: only fill MISSING from config (don't overwrite mismatch without review — but user asked sync to chuẩn; config is live truth for 5f)
  // For mismatch: prefer config.js as source of truth (that's what buttons use today)
  const updates = [
    ...a.missing.map((x) => ({ domain: x.domain, link: x.link })),
    ...a.mismatch.map((x) => ({ domain: x.domain, link: x.config })),
  ];
  try {
    const res = await syncRepo(p.repo, p.branch || "main", updates);
    report.synced.push({ ...row, ...res });
    console.log(`  synced changed=${res.changed} ${res.commit || ""}`);
  } catch (e) {
    report.errors.push({ project: p.name, repo: p.repo, error: e.message });
    console.log(`  FAIL sync: ${e.message}`);
  }
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/_sync_config_domains.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      scanned: report.scanned,
      withConfig: report.withConfig,
      drifted: report.drifted.length,
      synced: report.synced.map((s) => `${s.project}:${s.changed}`),
      errors: report.errors,
      driftedDetail: report.drifted,
    },
    null,
    2
  )
);
