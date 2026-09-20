import { Client } from "ssh2";
const c = new Client();
c.on("ready", () => {
  c.exec(`
cd /var/www/web-ten-mien
node --input-type=module <<'NODE'
import fs from "fs";
for (const line of fs.readFileSync(".env","utf8").split(/\\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(k in process.env)) process.env[k] = v;
}

const adminId = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const frezeId = process.env.CLOUDFLARE_ACCOUNT_ID;
const tokens = [
  ["CLOUDFLARE_API_TOKEN", process.env.CLOUDFLARE_API_TOKEN],
  ["CLOUDFLARE_ADMIN_API_TOKEN", process.env.CLOUDFLARE_ADMIN_API_TOKEN],
  ["CF_ADMIN_TOKEN", process.env.CF_ADMIN_TOKEN],
  ["CLOUDFLARE_ADMIN_TOKEN", process.env.CLOUDFLARE_ADMIN_TOKEN],
].filter(([, v]) => v);

console.log("adminId", adminId, "frezeId", frezeId);
console.log("token keys present", tokens.map(([k, v]) => k + ":" + (v || "").length));

async function probe(token, label) {
  // verify token
  const v = await (await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: "Bearer " + token },
  })).json();
  console.log("\\n"+label, "verify", v.success, v.result?.status);

  for (const acc of [adminId, frezeId]) {
    const url = "https://api.cloudflare.com/client/v4/zones?account.id=" + acc + "&per_page=5&page=1";
    const j = await (await fetch(url, { headers: { Authorization: "Bearer " + token } })).json();
    console.log(label, "acct", acc?.slice(0,8), "success", j.success, "total", j.result_info?.total_count, "err", JSON.stringify(j.errors||[]).slice(0,120));
  }
}

for (const [k, v] of tokens) await probe(v, k);

// cache file
const cachePath = "data/cf_zones_cache.json";
if (fs.existsSync(cachePath)) {
  const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  const zones = Array.isArray(raw) ? raw : raw.zones || [];
  const FROM = new Date("2026-09-11T00:00:00+07:00");
  const adminNew = zones.filter((z) => {
    const acc = z.account?.id || z.accountId || z.account_id;
    const created = z.created_on || z.createdAt;
    return acc === adminId && created && new Date(created) >= FROM;
  }).sort((a,b)=>String(a.created_on).localeCompare(String(b.created_on)));
  console.log("\\n=== from cf_zones_cache.json ADMIN since 11/09 ===");
  console.log("cache total", zones.length, "adminNew", adminNew.length);
  for (const z of adminNew) {
    const ns = (z.name_servers || z.nameServers || []).slice(0,2).join(",");
    console.log([new Date(z.created_on).toLocaleString("sv-SE",{timeZone:"Asia/Ho_Chi_Minh"}), z.name, z.status, ns].join("\\t"));
  }
  // count admin zones total in cache
  const adminAll = zones.filter((z) => (z.account?.id || z.accountId || z.account_id) === adminId);
  console.log("cache admin total zones", adminAll.length);
  const frezeNew = zones.filter((z) => {
    const acc = z.account?.id || z.accountId || z.account_id;
    const created = z.created_on || z.createdAt;
    return acc === frezeId && created && new Date(created) >= FROM;
  });
  console.log("cache freze since 11/09", frezeNew.length);
} else console.log("no cache");
NODE
`, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
