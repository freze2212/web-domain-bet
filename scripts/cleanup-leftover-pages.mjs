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
  return e.main_url || e.url || e.link || "";
}
function entry(l) {
  return { main_url: l, messenger_url: l, register_url: l, app_url: l, cskh_url: l };
}
function norm(u) {
  try {
    const x = new URL(String(u).trim());
    x.hash = "";
    let s = x.toString();
    if (s.endsWith("/") && !x.search) s = s.slice(0, -1);
    return s;
  } catch {
    return String(u || "").replace(/\/$/, "");
  }
}
async function cf(method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${CF}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}
async function gh(method, path, body) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "cleanup",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, json: await r.json() };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- 1) migrate tiktoka.ink ---
let link = "";
try {
  const dj = await (await fetch("https://tiktoka.ink/domains.json")).json();
  link = linkOf(dj["tiktoka.ink"] || dj["www.tiktoka.ink"]);
} catch {}
if (!link) {
  const cfg = await (await fetch("https://tiktoka.ink/config.js")).text();
  const m =
    cfg.match(/"tiktoka\.ink"\s*:\s*"([^"]+)"/) ||
    cfg.match(/"www\.tiktoka\.ink"\s*:\s*"([^"]+)"/);
  link = m?.[1] || "";
}
console.log("tiktoka.ink link =", link || "MISSING");
if (!link) throw new Error("no live link for tiktoka.ink");

const meta = await gh("GET", `/repos/${OWNER}/landingpage-5f-g/contents/domains.json?ref=main`);
const data = JSON.parse(Buffer.from(meta.json.content, "base64").toString("utf8"));
const e = entry(link);
data["tiktoka.ink"] = e;
data["www.tiktoka.ink"] = e;
const body = JSON.stringify(data, null, 2) + "\n";
const put = await gh("PUT", `/repos/${OWNER}/landingpage-5f-g/contents/domains.json`, {
  message: "sync(domains): add tiktoka.ink leftover from 5f-gg88",
  content: Buffer.from(body, "utf8").toString("base64"),
  sha: meta.json.sha,
  branch: "main",
});
if (!put.ok) throw new Error(JSON.stringify(put.json));
console.log("pushed", put.json.commit?.sha);

// wait pages
for (let i = 0; i < 36; i++) {
  try {
    const j = await (await fetch(`https://landingpage-5f-g.pages.dev/domains.json?v=${Date.now()}`)).json();
    if (norm(linkOf(j["tiktoka.ink"])) === norm(link)) break;
  } catch {}
  await sleep(5000);
}

// move domain
for (const d of ["tiktoka.ink", "www.tiktoka.ink"]) {
  await cf("DELETE", `/accounts/${AID}/pages/projects/landingpage-5f-gg88/domains/${encodeURIComponent(d)}`);
  const add = await cf("POST", `/accounts/${AA}/pages/projects/landingpage-5f-g/domains`, { name: d });
  console.log("add", d, add.success, add.errors || "");
}

const z = await cf("GET", `/zones?name=tiktoka.ink&account.id=${AID}`);
const zone = z.result?.[0];
if (!zone) throw new Error("no zone");
const dns = await cf("GET", `/zones/${zone.id}/dns_records?per_page=100`);
for (const host of ["tiktoka.ink", "www.tiktoka.ink"]) {
  for (const r of (dns.result || []).filter((x) => x.name === host && ["A", "AAAA", "CNAME"].includes(x.type))) {
    await cf("DELETE", `/zones/${zone.id}/dns_records/${r.id}`);
  }
  const name = host === "tiktoka.ink" ? "@" : "www";
  await cf("POST", `/zones/${zone.id}/dns_records`, {
    type: "CNAME",
    name,
    content: "landingpage-5f-g.pages.dev",
    proxied: true,
    ttl: 1,
  });
}

for (let i = 0; i < 30; i++) {
  const j = await (await fetch(`https://tiktoka.ink/domains.json?v=${Date.now()}`)).json().catch(() => ({}));
  const got = linkOf(j["tiktoka.ink"] || j["www.tiktoka.ink"]);
  console.log("wait", i, got);
  if (norm(got) === norm(link)) break;
  await sleep(5000);
}

// delete empty 5f-gg88
const del = await cf("DELETE", `/accounts/${AID}/pages/projects/landingpage-5f-gg88`);
console.log("delete 5f-gg88", del.success, del.errors || "");

// --- 2) purge deployments then delete stuck projects ---
async function forceDeleteProject(name) {
  console.log("force delete", name);
  for (let round = 0; round < 30; round++) {
    const list = await cf("GET", `/accounts/${AID}/pages/projects/${encodeURIComponent(name)}/deployments?per_page=25`);
    const deps = list.result || [];
    if (!deps.length) break;
    console.log(`  round ${round} deps=${deps.length}`);
    for (const d of deps) {
      await cf(
        "DELETE",
        `/accounts/${AID}/pages/projects/${encodeURIComponent(name)}/deployments/${d.id}?force=true`
      );
    }
    await sleep(1000);
  }
  const r = await cf("DELETE", `/accounts/${AID}/pages/projects/${encodeURIComponent(name)}`);
  console.log("  delete project", r.success, r.errors || "");
  return r.success;
}

await forceDeleteProject("lp-gg88-vip-3");
await forceDeleteProject("gg88-lp-5uae-2");
