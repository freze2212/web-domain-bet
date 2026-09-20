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

const adminToken = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const adminId = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const FROM = new Date("2026-09-11T00:00:00+07:00");

function vn(iso) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}

const out = [];
let page = 1;
let totalPages = 1;
while (page <= totalPages && page <= 50) {
  const url =
    "https://api.cloudflare.com/client/v4/zones?account.id=" +
    encodeURIComponent(adminId) +
    "&per_page=50&page=" +
    page;
  const j = await (await fetch(url, { headers: { Authorization: "Bearer " + adminToken } })).json();
  if (!j.success) throw new Error(JSON.stringify(j.errors));
  if (page === 1) console.log("ADMIN total_zones", j.result_info?.total_count);
  out.push(...(j.result || []));
  totalPages = j.result_info?.total_pages || 1;
  page += 1;
}

const neu = out
  .filter((z) => z.created_on && new Date(z.created_on) >= FROM)
  .sort((a, b) => a.created_on.localeCompare(b.created_on));

console.log("\\n=== Zone thêm vào CF ADMIN từ 11/09/2026 → nay ===");
console.log("count", neu.length);
for (const z of neu) {
  console.log(
    [vn(z.created_on), z.name, z.status, (z.name_servers || []).slice(0, 2).join(",")].join("\\t")
  );
}

const byDay = {};
for (const z of neu) {
  const day = vn(z.created_on).slice(0, 10);
  (byDay[day] ||= []).push(z.name);
}
console.log("\\n=== Theo ngày ===");
for (const day of Object.keys(byDay).sort()) {
  console.log(day + " (" + byDay[day].length + "): " + byDay[day].join(", "));
}

if (!neu.length) {
  // show newest 15 admin zones for sanity
  const newest = [...out].sort((a, b) => b.created_on.localeCompare(a.created_on)).slice(0, 15);
  console.log("\\n(Không có zone mới từ 11/09. 15 zone ADMIN mới nhất:)");
  for (const z of newest) console.log(vn(z.created_on), z.name, z.status);
}
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
