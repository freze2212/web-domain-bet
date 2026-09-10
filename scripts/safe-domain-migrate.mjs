/**
 * Safe one-domain Git migrate helpers.
 *
 * Modes:
 *   baseline <cnameTarget> [limit]
 *   inspect <domain>
 *
 * NEVER changes DNS/CNAME unless you later run an explicit migrate command.
 * Default: read-only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");

function loadEnv() {
  const p = path.join(ROOT, ".env");
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

function cfHeaders() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("Thiếu CLOUDFLARE_API_TOKEN");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function accountId() {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error("Thiếu CLOUDFLARE_ACCOUNT_ID");
  return id;
}

async function cf(pathname) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    headers: cfHeaders(),
  });
  const j = await r.json();
  if (!j.success) throw new Error(JSON.stringify(j.errors || j));
  return j.result;
}

function linkOf(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry.main_url || entry.url || entry.link || "";
}

async function fetchLiveDomainsJson(domain) {
  try {
    const r = await fetch(`https://${domain}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!r.ok) return { ok: false, status: r.status, link: "", hasEntry: false };
    const dj = await r.json();
    const entry = dj[domain] || dj[`www.${domain}`];
    return { ok: true, status: r.status, link: linkOf(entry), hasEntry: !!entry, entry };
  } catch (e) {
    return { ok: false, status: 0, link: "", hasEntry: false, error: e.message };
  }
}

async function getApexCname(domain) {
  const zones = await cf(
    `/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(accountId())}`
  );
  if (!zones?.length) return { zone: null, cname: null };
  const zone = zones.find((z) => z.status === "active") || zones[0];
  const recs = await cf(`/zones/${zone.id}/dns_records?type=CNAME&name=${encodeURIComponent(domain)}`);
  const hit = (recs || []).find((r) => r.name === domain || r.name === `${domain}.`);
  return {
    zone,
    cname: hit ? String(hit.content).toLowerCase().replace(/\.$/, "") : null,
  };
}

async function getPagesProjectInfo(projectName) {
  try {
    const p = await cf(`/accounts/${accountId()}/pages/projects/${encodeURIComponent(projectName)}`);
    return {
      name: p.name,
      subdomain: p.subdomain,
      sourceType: p.source?.type || "DIRECT_OR_NONE",
      repo: p.source?.config
        ? `${p.source.config.owner}/${p.source.config.repo_name}@${p.source.config.production_branch}`
        : "",
      domainsCount: Array.isArray(p.domains) ? p.domains.length : null,
    };
  } catch (e) {
    return { name: projectName, error: e.message };
  }
}

function projectFromCname(cname) {
  if (!cname) return null;
  return cname.replace(/\.pages\.dev$/i, "");
}

async function cmdBaseline(cnameTarget, limit = 15) {
  const auditPath = path.join(DATA, "_gg88_audit_live.json");
  if (!fs.existsSync(auditPath)) throw new Error("Thiếu data/_gg88_audit_live.json — chạy audit trước");
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  const cname = String(cnameTarget).toLowerCase();
  const candidates = audit.rows
    .filter((r) => (r.cname || "").toLowerCase() === cname)
    .slice(0, Number(limit) || 15);

  if (!candidates.length) {
    console.log(JSON.stringify({ error: `Không có domain CNAME=${cname} trong audit` }, null, 2));
    return;
  }

  const projectName = projectFromCname(cname);
  const projectInfo = await getPagesProjectInfo(projectName);

  const rows = [];
  for (const c of candidates) {
    const domain = c.domain;
    const dns = await getApexCname(domain);
    const live = await fetchLiveDomainsJson(domain);
    rows.push({
      domain,
      baselineLiveLink: live.link || c.liveLink || "",
      liveOk: live.ok,
      liveHasEntry: live.hasEntry,
      cnameNow: dns.cname,
      cnameExpected: cname,
      cnameUnchanged: dns.cname === cname,
      zoneStatus: dns.zone?.status || null,
      localFolderHint: c.folder || null,
      localLinkHint: c.localLink || null,
      note: "READ_ONLY — chưa sửa Git/DNS",
    });
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  const out = {
    generatedAt: new Date().toISOString(),
    mode: "baseline-readonly",
    cnameTarget: cname,
    projectInfo,
    count: rows.length,
    rows,
    nextStep:
      "Chọn 1 domain trong list → chạy: node scripts/safe-domain-migrate.mjs inspect <domain>. Chỉ khi Git đã có đúng live link mới được phép đổi DNS cho đúng miền đó.",
  };

  const outPath = path.join(
    DATA,
    `_baseline_${projectName || "unknown"}_${Date.now()}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ saved: outPath, projectInfo, sample: rows.slice(0, 5), total: rows.length }, null, 2));
}

async function cmdInspect(domain) {
  domain = String(domain).toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const dns = await getApexCname(domain);
  const live = await fetchLiveDomainsJson(domain);
  const projectName = projectFromCname(dns.cname);
  const projectInfo = projectName ? await getPagesProjectInfo(projectName) : null;

  // Find local folders containing this domain (read-only)
  const localHits = [];
  const roots = ["C:\\Landingpages\\GG88"];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const walk = (dir, depth = 0) => {
      if (depth > 4) return;
      let ents;
      try {
        ents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of ents) {
        if (["node_modules", ".git", "dist", "build"].includes(ent.name)) continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, depth + 1);
        else if (ent.name === "domains.json") {
          try {
            const dj = JSON.parse(fs.readFileSync(p, "utf8"));
            if (domain in dj || `www.${domain}` in dj) {
              localHits.push({
                file: p,
                link: linkOf(dj[domain] || dj[`www.${domain}`]),
              });
            }
          } catch {}
        }
      }
    };
    walk(root);
  }

  const result = {
    domain,
    live: {
      ok: live.ok,
      link: live.link,
      hasEntry: live.hasEntry,
      error: live.error || null,
    },
    dns: {
      cname: dns.cname,
      zoneStatus: dns.zone?.status || null,
      zoneId: dns.zone?.id || null,
    },
    pagesProject: projectInfo,
    localHits,
    safety: {
      mayChangeDns: false,
      reason:
        "inspect = READ ONLY. Chỉ đổi DNS khi: (1) Git repo đích đã có đúng live.link, (2) Pages Git đã deploy, (3) bạn chạy migrate có cờ --apply-dns cho đúng 1 domain.",
      gitConnected: projectInfo?.sourceType === "github",
      ifPagesFull:
        "Nếu project đầy: tạo project-N Connect CÙNG Git repo (không wrangler folder). Domain cũ giữ CNAME cũ cho đến khi làm tới domain đó.",
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

const [cmd, arg1, arg2] = process.argv.slice(2);
if (cmd === "baseline") {
  await cmdBaseline(arg1, arg2 || 15);
} else if (cmd === "inspect") {
  if (!arg1) throw new Error("Thiếu domain. VD: node scripts/safe-domain-migrate.mjs inspect 88de.top");
  await cmdInspect(arg1);
} else {
  console.log(`Usage:
  node scripts/safe-domain-migrate.mjs baseline <cnameTarget> [limit]
  node scripts/safe-domain-migrate.mjs inspect <domain>

Examples:
  node scripts/safe-domain-migrate.mjs baseline gg88-lp-5uae-2.pages.dev 15
  node scripts/safe-domain-migrate.mjs inspect 88de.top
`);
  process.exit(1);
}
