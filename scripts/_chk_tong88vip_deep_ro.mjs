/**
 * READ-ONLY deep check tong88vip.com — no mutations.
 */
import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const D = "tong88vip.com";
const FREZE = process.env.CLOUDFLARE_API_TOKEN;
const ADMIN = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const FA = process.env.CLOUDFLARE_ACCOUNT_ID;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}

async function cf(tok, method, path) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: !!j.success, err: j.errors?.[0]?.message || "", result: j.result, errors: j.errors };
}

async function findZone() {
  for (const [lab, tok, acc] of [
    ["admin", ADMIN, AA],
    ["freze", FREZE, FA],
  ]) {
    const j = await cf(tok, "GET", `/zones?name=${encodeURIComponent(D)}&account.id=${encodeURIComponent(acc)}`);
    if (j.ok && j.result?.length) {
      const z = j.result.find((x) => x.status === "active") || j.result[0];
      return { lab, tok, z };
    }
  }
  return null;
}

async function probe(host) {
  const out = { host };
  try {
    const r = await fetch(`https://${host}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(20000),
      headers: { "Cache-Control": "no-cache" },
      redirect: "manual",
    });
    out.http = r.status;
    out.loc = r.headers.get("location") || "";
    out.cfRay = r.headers.get("cf-ray") || "";
    out.server = r.headers.get("server") || "";
    const ct = r.headers.get("content-type") || "";
    out.ct = ct;
    if (r.status >= 300 && r.status < 400) {
      out.kind = "redirect";
      return out;
    }
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      const apex = host.replace(/^www\./, "");
      out.kind = "json";
      out.n = Object.keys(j).length;
      out.entry = j[host] || j[apex] || j[`www.${apex}`] || null;
      out.link = linkOf(out.entry);
      out.hasKey = !!(j[host] || j[apex] || j[`www.${apex}`]);
      out.sampleKeys = Object.keys(j).slice(0, 8);
    } catch {
      out.kind = "html/other";
      out.body = text.slice(0, 200).replace(/\s+/g, " ");
      if (/Error 1014|Cross-User|1016|522|523|525|526|530/i.test(text)) {
        out.cfError = (text.match(/Error \d{4}[^<]*/i) || [""])[0];
      }
    }
  } catch (e) {
    out.err = e.message;
  }
  return out;
}

async function digPublic() {
  // Cloudflare DNS over HTTPS
  const out = {};
  for (const name of [D, `www.${D}`]) {
    for (const type of ["A", "AAAA", "CNAME", "NS"]) {
      const r = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
        { headers: { Accept: "application/dns-json" } }
      );
      const j = await r.json();
      const answers = (j.Answer || []).map((a) => `${a.type}:${a.data}`);
      if (answers.length) out[`${name}/${type}`] = answers;
    }
  }
  return out;
}

console.log("=== 1) ZONE ===");
const zoneInfo = await findZone();
if (!zoneInfo) {
  console.log("NO ZONE on Freze or Admin");
} else {
  const z = zoneInfo.z;
  console.log({
    account: zoneInfo.lab,
    id: z.id,
    status: z.status,
    paused: z.paused,
    nameServers: z.name_servers,
    originalNS: z.original_name_servers,
    accountId: z.account?.id,
    accountName: z.account?.name,
  });

  console.log("\n=== 2) DNS records (CF API) ===");
  const dns = await cf(zoneInfo.tok, "GET", `/zones/${z.id}/dns_records?per_page=100`);
  const recs = (dns.result || []).filter(
    (r) => r.name === D || r.name === `www.${D}` || r.name.endsWith(`.${D}`)
  );
  console.log(
    recs.map((r) => ({
      type: r.type,
      name: r.name,
      content: r.content,
      proxied: r.proxied,
      ttl: r.ttl,
    }))
  );

  console.log("\n=== 3) Page Rules ===");
  const pr = await cf(zoneInfo.tok, "GET", `/zones/${z.id}/pagerules`);
  const rules = (pr.result || []).map((r) => ({
    status: r.status,
    targets: (r.targets || []).map((t) => t.constraint?.value),
    actions: (r.actions || []).map((a) => ({
      id: a.id,
      value: a.value,
    })),
  }));
  console.log(JSON.stringify(rules, null, 2).slice(0, 3000));
}

console.log("\n=== 4) Public DNS (DoH) ===");
console.log(await digPublic());

console.log("\n=== 5) Spaceship ===");
try {
  const { getDomainInfo } = await import("../src/spaceship.js").catch(() => import("./src/spaceship.js").catch(() => null));
} catch {}
try {
  const { getDomainInfo } = await import("../src/spaceship.js");
} catch {
  // path from scripts/
}
const spMod = await import("../src/spaceship.js").catch(() => import("./src/spaceship.js"));
try {
  const info = await spMod.getDomainInfo(D);
  console.log({
    lifecycle: info.lifecycleStatus,
    ns: info.nameservers,
    reg: info.registrationDate,
    exp: info.expirationDate,
  });
} catch (e) {
  console.log("Spaceship:", e.message);
}

console.log("\n=== 6) Pages custom domain attachment ===");
async function listProjects(tok, acc) {
  const out = [];
  let page = 1;
  for (;;) {
    const j = await cf(tok, "GET", `/accounts/${acc}/pages/projects?per_page=10&page=${page}`);
    if (!j.ok) break;
    out.push(...(j.result || []));
    // can't easily get total_pages from our wrapper — fetch until short page
    if ((j.result || []).length < 10) break;
    page++;
    if (page > 40) break;
  }
  return out;
}

const hits = [];
for (const [lab, tok, acc] of [
  ["freze", FREZE, FA],
  ["admin", ADMIN, AA],
]) {
  // direct domain search via known approach: check domains endpoint is per-project — slow
  // Use CF: list projects then filter domain API only if name mentions tong — too slow
  // Faster: get zone DNS CNAME target then check that pages project
}
// From DNS CNAME if any
let cnameTarget = null;
if (zoneInfo) {
  const dns = await cf(zoneInfo.tok, "GET", `/zones/${zoneInfo.z.id}/dns_records?type=CNAME&per_page=100`);
  const www = (dns.result || []).find((r) => r.name === `www.${D}` || r.name === D);
  if (www) cnameTarget = www.content;
  console.log("CNAME target from zone:", cnameTarget);
  if (cnameTarget && /\.pages\.dev$/i.test(cnameTarget)) {
    const proj = cnameTarget.replace(/\.pages\.dev$/i, "");
    for (const [lab, tok, acc] of [
      ["freze", FREZE, FA],
      ["admin", ADMIN, AA],
    ]) {
      const meta = await cf(tok, "GET", `/accounts/${acc}/pages/projects/${encodeURIComponent(proj)}`);
      const doms = await cf(tok, "GET", `/accounts/${acc}/pages/projects/${encodeURIComponent(proj)}/domains`);
      const mine = (doms.result || []).filter((d) => String(d.name).includes("tong88vip"));
      console.log(`Pages ${lab}/${proj}:`, meta.ok ? `source=${meta.result?.source?.type || "direct"}` : meta.err, "domainHits", mine);
    }
  }
}

// Also scan both accounts for any pages domain matching tong88vip (sampled via parallel known projects only if CNAME empty)
if (!cnameTarget) {
  console.log("No CNAME to pages.dev — scanning Pages domains on both accounts (may take time)...");
  for (const [lab, tok, acc] of [
    ["admin", ADMIN, AA],
    ["freze", FREZE, FA],
  ]) {
    let page = 1;
    let found = [];
    while (page <= 50) {
      const j = await cf(tok, "GET", `/accounts/${acc}/pages/projects?per_page=10&page=${page}`);
      const list = j.result || [];
      if (!list.length) break;
      for (const p of list) {
        const doms = await cf(tok, "GET", `/accounts/${acc}/pages/projects/${encodeURIComponent(p.name)}/domains`);
        for (const d of doms.result || []) {
          if (String(d.name).includes("tong88vip")) {
            found.push({ project: p.name, domain: d.name, status: d.status, source: p.source?.type || "direct" });
          }
        }
      }
      if (list.length < 10) break;
      page++;
    }
    console.log(`Pages scan ${lab}:`, found.length ? found : "none");
  }
}

console.log("\n=== 7) Live probe ===");
console.log(await probe(D));
console.log(await probe(`www.${D}`));
console.log(await probe(`http://${D}`.replace("http://", ""))); // same

// http vs https apex
try {
  const r = await fetch(`http://${D}/`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  console.log("HTTP apex /", r.status, r.headers.get("location"));
} catch (e) {
  console.log("HTTP apex", e.message);
}

console.log("\n=== 8) Hub cache / history (local if present) ===");
try {
  const cache = JSON.parse(fs.readFileSync("data/cf_zones_cache.json", "utf8"));
  console.log(
    "cache",
    cache.filter((z) => String(z.name).includes("tong88vip"))
  );
} catch (e) {
  console.log("cache", e.message);
}

console.log("\nDONE read-only");
