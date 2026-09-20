/**
 * Read-only live probe: Admin@itkjc zones for "globe / no link" style failures.
 * Flags:
 *  - missing self key in domains.json
 *  - empty link
 *  - tiny JSON (<=5 keys) or only-autotest
 *  - HTML instead of JSON
 *  - fetch error / non-200
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const zones = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cf_zones_cache.json"), "utf8"));
const adminZones = zones.filter((z) => String(z.accountName || "").toLowerCase().includes("admin@itkjc"));
const active = adminZones.filter((z) => z.status === "active");
const pending = adminZones.filter((z) => z.status !== "active");

const CONCURRENCY = 25;
const OUT = path.join(ROOT, "data", `_probe_admin_live_${Date.now()}.json`);
const OUT_MD = path.join(ROOT, "data", "_PROBE_ADMIN_LIVE_LATEST.md");

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}

async function probe(domain) {
  const url = `https://${domain}/domains.json?t=${Date.now()}`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { "Cache-Control": "no-cache", Accept: "application/json", "User-Agent": "admin-live-probe/1.0" },
    });
    const t = await r.text();
    if (!r.ok) return { domain, ok: false, kind: "http", http: r.status };
    if (t.trim().startsWith("<")) return { domain, ok: false, kind: "html", http: r.status, bytes: t.length };
    let j;
    try {
      j = JSON.parse(t);
    } catch {
      return { domain, ok: false, kind: "bad_json", http: r.status };
    }
    const keys = Object.keys(j);
    const self = j[domain] || j[`www.${domain}`];
    const link = linkOf(self);
    const onlyAutotest = keys.length > 0 && keys.every((k) => k.includes("autotest"));
    if (onlyAutotest) return { domain, ok: false, kind: "only_autotest", http: r.status, keys: keys.length, keysSample: keys };
    if (keys.length <= 5 && !self) return { domain, ok: false, kind: "tiny_no_self", http: r.status, keys: keys.length, keysSample: keys };
    if (!self) return { domain, ok: false, kind: "missing_self", http: r.status, keys: keys.length };
    if (!link) return { domain, ok: false, kind: "empty_link", http: r.status, keys: keys.length };
    return { domain, ok: true, kind: "ok", http: r.status, keys: keys.length, link: link.slice(0, 100) };
  } catch (e) {
    return { domain, ok: false, kind: "error", error: e.message };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
      if ((idx + 1) % 50 === 0 || idx + 1 === items.length) {
        process.stdout.write(`\rProbed ${idx + 1}/${items.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  process.stdout.write("\n");
  return out;
}

const domains = active.map((z) => z.name).sort();
console.log(`Admin zones: ${adminZones.length} (active ${active.length}, other ${pending.length})`);
console.log(`Probing ${domains.length} active Admin domains...`);

const results = await pool(domains, CONCURRENCY, (d) => probe(d));
const ok = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);
const byKind = {};
for (const r of bad) byKind[r.kind] = (byKind[r.kind] || 0) + 1;

const report = {
  at: new Date().toISOString(),
  scope: "Admin@itkjc.com active zones from cf_zones_cache.json",
  totals: {
    adminZones: adminZones.length,
    activeProbed: domains.length,
    ok: ok.length,
    bad: bad.length,
    pendingSkipped: pending.length,
  },
  byKind,
  bad,
  okSample: ok.slice(0, 20),
  pendingSample: pending.slice(0, 20).map((z) => ({ name: z.name, status: z.status })),
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
fs.writeFileSync(
  OUT_MD,
  `# Probe live — miền Admin CF\n\n` +
    `- At: ${report.at}\n` +
    `- Active probed: **${domains.length}**\n` +
    `- OK (có key + link): **${ok.length}**\n` +
    `- Lỗi: **${bad.length}**\n` +
    `- Pending/skip: ${pending.length}\n\n` +
    `## Phân loại lỗi\n\n` +
    Object.entries(byKind)
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join("\n") +
    `\n\n## Danh sách lỗi\n\n` +
    bad.map((r) => `- \`${r.domain}\` — ${r.kind}${r.keys != null ? ` (keys=${r.keys})` : ""}${r.http ? ` http=${r.http}` : ""}${r.error ? ` ${r.error}` : ""}`).join("\n") +
    `\n\nJSON: \`${path.basename(OUT)}\`\n`
);

console.log(JSON.stringify(report.totals, null, 2));
console.log("byKind", byKind);
console.log("Wrote", OUT);
console.log("Bad domains:", bad.map((r) => r.domain + ":" + r.kind).join(", ") || "(none)");
