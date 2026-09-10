/**
 * Scoped sync: only Pages projects that currently have custom domains.
 * Fill domains.json from config.js ONLY for apex currently attached to that project.
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
  const map = {};
  const re = /["']([^"']+)["']\s*:\s*["']([^"']*)["']/g;
  let mm;
  while ((mm = re.exec(objText))) map[mm[1]] = mm[2];
  return map;
}

function parseDomainsJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    let depth = 0,
      end = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) throw new Error("unrecoverable domains.json");
    return JSON.parse(raw.slice(0, end + 1));
  }
}

async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "sync-scoped",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, json: await r.json() };
}

async function listGitWithCustomDomains(acc, label) {
  const out = [];
  let page = 1;
  while (page <= 40) {
    const j = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/pages/projects?page=${page}`,
      { headers: { Authorization: `Bearer ${CF}` } }
    ).then((r) => r.json());
    if (!j.success) break;
    for (const p of j.result || []) {
      if (p.source?.type !== "github") continue;
      const custom = (p.domains || []).filter((d) => !String(d).endsWith(".pages.dev"));
      const apex = custom
        .filter((d) => !String(d).startsWith("www."))
        .map((d) => String(d).toLowerCase())
        .sort();
      if (!apex.length) continue;
      const repo = p.source?.config
        ? `${p.source.config.owner}/${p.source.config.repo_name}`
        : null;
      if (!repo) continue;
      out.push({
        label,
        name: p.name,
        subdomain: p.subdomain || `${p.name}.pages.dev`,
        repo,
        branch: p.source.config.production_branch || "main",
        apex,
      });
    }
    const info = j.result_info;
    if (!info || page >= (info.total_pages || 1)) break;
    page++;
  }
  return out;
}

async function loadConfigMap(pagesDev) {
  for (const path of ["config.js", "js/config.js"]) {
    try {
      const r = await fetch(`https://${pagesDev}/${path}?v=${Date.now()}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) continue;
      const t = await r.text();
      if (!t.includes("LINK_CONFIG") && !t.includes("domains")) continue;
      return parseConfigDomains(t);
    } catch {}
  }
  return null;
}

function linkFromConfig(cfgMap, domain) {
  if (!cfgMap) return "";
  return (
    cfgMap[domain] ||
    cfgMap[`www.${domain}`] ||
    cfgMap[`www.www.${domain}`] ||
    ""
  );
}

const projects = [
  ...(await listGitWithCustomDomains(AID, "freze")),
  ...(await listGitWithCustomDomains(AA, "admin")),
];

console.log(`Projects with custom domains + Git: ${projects.length}\n`);

const report = { at: new Date().toISOString(), projects: [], synced: [], skipped: [], errors: [] };

for (const p of projects) {
  const cfg = await loadConfigMap(p.subdomain);
  if (!cfg) {
    report.skipped.push({ project: p.name, reason: "no_config_js" });
    continue;
  }

  const missing = [];
  // Check live domains.json for attached apex only
  let liveDj = {};
  try {
    const r = await fetch(`https://${p.subdomain}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (r.ok) liveDj = parseDomainsJsonSafe(await r.text());
  } catch {}

  for (const d of p.apex) {
    const cfgLink = linkFromConfig(cfg, d);
    if (!cfgLink) continue; // no config entry — skip (don't invent)
    const djLink = linkOf(liveDj[d] || liveDj[`www.${d}`]);
    if (!djLink || norm(djLink) !== norm(cfgLink)) {
      missing.push({ domain: d, link: cfgLink, had: djLink || null });
    }
  }

  report.projects.push({
    project: p.name,
    label: p.label,
    apex: p.apex.length,
    needSync: missing.length,
    domains: missing.map((m) => m.domain),
  });

  if (!missing.length) continue;

  console.log(`NEED ${p.label}/${p.name} (${missing.length}/${p.apex.length}): ${missing.map((m) => m.domain).join(", ")}`);

  try {
    const [owner, repo] = p.repo.split("/");
    const meta = await gh("GET", `/repos/${owner}/${repo}/contents/domains.json?ref=${p.branch}`);
    if (!meta.ok) throw new Error(`GET ${p.repo} ${meta.json.message}`);
    const raw = Buffer.from(meta.json.content, "base64").toString("utf8");
    const data = parseDomainsJsonSafe(raw);
    let changed = 0;
    for (const u of missing) {
      if (norm(linkOf(data[u.domain] || data[`www.${u.domain}`])) === norm(u.link)) continue;
      const e = entry(u.link);
      data[u.domain] = e;
      data[`www.${u.domain}`] = e;
      changed++;
    }
    if (!changed) {
      console.log("  already in git (live lag)");
      continue;
    }
    const body = JSON.stringify(data, null, 2) + "\n";
    JSON.parse(body);
    const put = await gh("PUT", `/repos/${owner}/${repo}/contents/domains.json`, {
      message: `sync(domains): align ${changed} attached domains from config.js`,
      content: Buffer.from(body, "utf8").toString("base64"),
      sha: meta.json.sha,
      branch: p.branch,
    });
    if (!put.ok) throw new Error(`PUT ${JSON.stringify(put.json)}`);
    report.synced.push({ project: p.name, changed, commit: put.json.commit?.sha, domains: missing.map((m) => m.domain) });
    console.log(`  synced ${changed} → ${put.json.commit?.sha}`);
  } catch (e) {
    report.errors.push({ project: p.name, error: e.message });
    console.log(`  FAIL ${e.message}`);
  }
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/_sync_config_domains_scoped.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      projectsWithDomains: projects.length,
      needSync: report.projects.filter((p) => p.needSync).length,
      synced: report.synced,
      errors: report.errors,
      needList: report.projects.filter((p) => p.needSync),
    },
    null,
    2
  )
);
