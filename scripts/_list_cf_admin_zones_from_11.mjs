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
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const token = process.env.CLOUDFLARE_API_TOKEN;
const adminId = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const frezeId = process.env.CLOUDFLARE_ACCOUNT_ID;
const FROM = new Date("2026-09-11T00:00:00+07:00");
const TO = new Date(); // now

function vn(iso) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}
function inRange(iso) {
  const d = new Date(iso);
  return d >= FROM && d <= TO;
}

async function listAllZones(accountId, label) {
  const out = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 100) {
    const url =
      "https://api.cloudflare.com/client/v4/zones?account.id=" +
      encodeURIComponent(accountId) +
      "&per_page=50&page=" +
      page;
    const j = await (await fetch(url, { headers: { Authorization: "Bearer " + token } })).json();
    if (!j.success) throw new Error(label + " " + JSON.stringify(j.errors));
    out.push(...(j.result || []));
    totalPages = j.result_info?.total_pages || 1;
    if (page === 1) console.log(label, "total_zones", j.result_info?.total_count, "pages", totalPages);
    page += 1;
  }
  return out;
}

const adminZones = await listAllZones(adminId, "ADMIN");
const adminNew = adminZones
  .filter((z) => inRange(z.created_on))
  .sort((a, b) => a.created_on.localeCompare(b.created_on));

console.log("\\n=== CF ADMIN zones created_on >= 2026-09-11 (VN) ===");
console.log("admin_account", adminId);
console.log("count", adminNew.length);
for (const z of adminNew) {
  console.log([vn(z.created_on), z.name, z.status, (z.name_servers || []).slice(0, 2).join(",")].join("\\t"));
}

// Also Freze for comparison (same window)
const frezeZones = await listAllZones(frezeId, "FREZE");
const frezeNew = frezeZones
  .filter((z) => inRange(z.created_on))
  .sort((a, b) => a.created_on.localeCompare(b.created_on));
console.log("\\n=== CF FREZE zones created_on >= 2026-09-11 (VN) — để đối chiếu ===");
console.log("count", frezeNew.length);
for (const z of frezeNew) {
  console.log([vn(z.created_on), z.name, z.status].join("\\t"));
}

// Group admin by day
const byDay = {};
for (const z of adminNew) {
  const day = vn(z.created_on).slice(0, 10);
  (byDay[day] ||= []).push(z.name);
}
console.log("\\n=== ADMIN by day ===");
for (const day of Object.keys(byDay).sort()) {
  console.log(day, "(" + byDay[day].length + ")", byDay[day].join(", "));
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
