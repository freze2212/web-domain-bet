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

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || e.register_url || "";
}

async function proj(acc, name) {
  const j = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${acc}/pages/projects/${encodeURIComponent(name)}`,
    { headers: { Authorization: `Bearer ${CF}` } }
  ).then((r) => r.json());
  if (!j.success) return { err: j.errors?.[0]?.message || "missing" };
  const p = j.result;
  const custom = (p.domains || []).filter((d) => !String(d).endsWith(".pages.dev"));
  const apex = custom
    .filter((d) => !String(d).startsWith("www."))
    .map((d) => String(d).toLowerCase())
    .sort();
  return {
    name: p.name,
    source: p.source?.type || "DIRECT",
    repo: p.source?.config
      ? `${p.source.config.owner}/${p.source.config.repo_name}`
      : null,
    subdomain: p.subdomain || `${p.name}.pages.dev`,
    apex,
  };
}

async function probe(d) {
  try {
    const h = await fetch(`https://${d}/`, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    const loc = h.headers.get("location");
    const apex = d.replace(/^www\./, "");
    if (h.status >= 300 && h.status < 400 && loc && !loc.toLowerCase().includes(apex)) {
      return { ok: true, mode: "302", status: h.status, link: loc };
    }
    const r = await fetch(`https://${d}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return { ok: false, mode: "fail", status: h.status, dj: r.status };
    const j = await r.json();
    const link = linkOf(j[d] || j[`www.${d}`] || j._default || j.defaultLink);
    return { ok: h.status === 200 && !!link, mode: "LP", status: h.status, link };
  } catch (e) {
    return { ok: false, mode: "err", err: e.message };
  }
}

async function cnameOf(d) {
  for (const [label, acc] of [
    ["freze", AID],
    ["admin", AA],
  ]) {
    const z = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(d)}&account.id=${acc}`,
      { headers: { Authorization: `Bearer ${CF}` } }
    ).then((r) => r.json());
    if (!z.result?.[0]) continue;
    const dns = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${z.result[0].id}/dns_records?type=CNAME&per_page=50`,
      { headers: { Authorization: `Bearer ${CF}` } }
    ).then((r) => r.json());
    const rec = (dns.result || []).find((r) => r.name === d || r.name === `www.${d}`);
    return { zone: label, cname: rec?.content || null };
  }
  return { zone: null, cname: null };
}

const families = [
  { id: "5f-g", freze: "landingpage-5f-g", admin: "landingpage-5f-g" },
  { id: "5h", freze: "lp-5h-gg88", admin: "lp-5h-gg88" },
  { id: "9d", freze: "lp-9d-xoaip-gg88", admin: "lp-9d-xoaip-gg88" },
  { id: "fly88", freze: "lp-mm88-fly88", admin: "lp-mm88-fly88" },
  { id: "7f-2", freze: "lp-7f-llwin-games-2", admin: null },
  { id: "7f", freze: "lp-7f-llwin-games", admin: null },
];

const summary = [];

for (const f of families) {
  const fr = await proj(AID, f.freze);
  const ad = f.admin ? await proj(AA, f.admin) : { err: "n/a" };
  const live = ad.apex?.length ? ad : fr.apex?.length ? fr : null;
  const where = ad.apex?.length ? "ADMIN-GIT" : fr.apex?.length ? "FREZE" : "EMPTY";
  console.log(`\n#### ${f.id} where=${where}`);
  console.log(" freze", fr.err || `${fr.source} apex=${fr.apex.length} ${fr.subdomain}`);
  console.log(" admin", ad.err || `${ad.source} repo=${ad.repo} apex=${ad.apex.length} ${ad.subdomain}`);

  if (!live?.apex?.length) {
    summary.push({ id: f.id, where, apex: 0, ok: 0, bad: 0 });
    continue;
  }

  let ok = 0;
  const bad = [];
  for (const d of live.apex) {
    const p = await probe(d);
    const c = await cnameOf(d);
    const cnameMatch = !!(c.cname && (c.cname === live.subdomain || c.cname.startsWith(live.name)));
    if (p.ok && cnameMatch) ok++;
    else bad.push({ d, p, c });
    console.log(
      `  ${d} ${p.ok ? "OK" : "BAD"} ${p.mode} ${(p.link || "").slice(0, 55)} cname=${c.cname || "?"} ${cnameMatch ? "CNAME_OK" : "CNAME_BAD"}`
    );
  }
  summary.push({
    id: f.id,
    where,
    repo: live.repo,
    source: live.source,
    pagesDev: live.subdomain,
    apex: live.apex.length,
    ok,
    bad: bad.length,
    badDomains: bad.map((b) => b.d),
  });
}

fs.writeFileSync("data/_admin_families_status.json", JSON.stringify(summary, null, 2));
console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
