import { Client } from "ssh2";

const c = new Client();
c.on("ready", () => {
  c.exec(
    `cd /var/www/web-ten-mien && node --input-type=module <<'NODE'
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
const TO = new Date("2026-09-16T00:00:00+07:00");

function vn(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}
function inRange(iso) {
  const d = new Date(iso);
  return d >= FROM && d < TO;
}

const hist = JSON.parse(fs.readFileSync("data/history.json", "utf8"));
const items = Array.isArray(hist) ? hist : hist.items || [];
const buys = items
  .filter((h) => String(h.actionType || "").startsWith("BUY") && h.status === "success")
  .filter((h) => h.timestamp && inRange(h.timestamp))
  .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

const domains = [...new Set(buys.map((h) => String(h.domain || "").toLowerCase()).filter(Boolean))];

async function findZones(name) {
  const url = "https://api.cloudflare.com/client/v4/zones?name=" + encodeURIComponent(name) + "&per_page=5";
  const j = await (await fetch(url, { headers: { Authorization: "Bearer " + token } })).json();
  return j.result || [];
}

console.log("domain\\tbuy_at\\taction\\tcf_account\\tzone_created\\tstatus\\tns");
for (const d of domains) {
  const buy = buys.filter((h) => String(h.domain).toLowerCase() === d).pop();
  const zones = await findZones(d);
  if (!zones.length) {
    console.log([d, vn(buy.timestamp), buy.actionType, "NONE", "-", "-", "-"].join("\\t"));
    continue;
  }
  for (const z of zones) {
    const acct = z.account?.id === adminId ? "ADMIN" : z.account?.id === frezeId ? "FREZE" : z.account?.id || "?";
    console.log(
      [d, vn(buy.timestamp), buy.actionType, acct, vn(z.created_on), z.status, (z.name_servers || []).join(",")].join("\\t")
    );
  }
}

// Also: scan ALL admin zones created in range without early-stop bug — sample newest 200
async function newest(accountId, label, pages = 6) {
  const hit = [];
  for (let page = 1; page <= pages; page++) {
    const url =
      "https://api.cloudflare.com/client/v4/zones?account.id=" +
      accountId +
      "&per_page=50&page=" +
      page +
      "&order=created_on&direction=desc";
    const j = await (await fetch(url, { headers: { Authorization: "Bearer " + token } })).json();
    if (!j.success) {
      console.log(label, "ERR", JSON.stringify(j.errors));
      break;
    }
    for (const z of j.result || []) {
      if (inRange(z.created_on)) hit.push(z);
    }
    if (!(j.result || []).length) break;
  }
  return hit;
}

const adminHit = await newest(adminId, "admin");
const frezeHit = await newest(frezeId, "freze");
console.log("\\n=== Raw CF zones created_on in window (newest ~300 scan) ===");
console.log("ADMIN", adminHit.length);
for (const z of adminHit.sort((a,b)=>a.created_on.localeCompare(b.created_on))) {
  console.log(" ADMIN", vn(z.created_on), z.name, z.status);
}
console.log("FREZE", frezeHit.length);
for (const z of frezeHit.sort((a,b)=>a.created_on.localeCompare(b.created_on))) {
  console.log(" FREZE", vn(z.created_on), z.name, z.status);
}
NODE`,
    (e, s) => {
      let o = "";
      s.on("data", (d) => (o += d));
      s.stderr.on("data", (d) => (o += d));
      s.on("close", () => {
        console.log(o);
        c.end();
      });
    }
  );
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
