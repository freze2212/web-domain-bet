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
if (!token || !adminId) {
  console.log("MISSING_ENV", { hasToken: !!token, adminId, frezeId });
  process.exit(1);
}

const FROM = new Date("2026-09-11T00:00:00+07:00");
const TO = new Date("2026-09-16T00:00:00+07:00"); // exclusive end = end of Sep 15 VN

async function listAllZones(accountId, label) {
  const out = [];
  let page = 1;
  for (;;) {
    const url =
      "https://api.cloudflare.com/client/v4/zones?account.id=" +
      encodeURIComponent(accountId) +
      "&per_page=50&page=" +
      page +
      "&order=created_on&direction=desc";
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    const j = await r.json();
    if (!j.success) throw new Error(label + " zones fail: " + JSON.stringify(j.errors));
    out.push(...(j.result || []));
    const ti = j.result_info || {};
    if (!ti.total_pages || page >= ti.total_pages) break;
    // early stop if oldest on this page already before FROM
    const oldest = j.result?.[j.result.length - 1]?.created_on;
    if (oldest && new Date(oldest) < FROM) break;
    page += 1;
    if (page > 40) break;
  }
  return out;
}

function inRange(iso) {
  const d = new Date(iso);
  return d >= FROM && d < TO;
}

function vn(iso) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}

const adminZones = await listAllZones(adminId, "admin");
const adminNew = adminZones
  .filter((z) => inRange(z.created_on))
  .sort((a, b) => a.created_on.localeCompare(b.created_on));

console.log("=== CF ADMIN zones created 2026-09-11 .. 2026-09-15 (VN) ===");
console.log("admin_account", adminId);
console.log("count", adminNew.length);
for (const z of adminNew) {
  console.log([vn(z.created_on), z.name, z.status, z.id].join("\\t"));
}

// Hub BUY history same window
let buys = [];
try {
  const hist = JSON.parse(fs.readFileSync("data/history.json", "utf8"));
  const items = Array.isArray(hist) ? hist : hist.items || [];
  buys = items
    .filter((h) => String(h.actionType || "").startsWith("BUY"))
    .filter((h) => {
      const t = h.timestamp || h.createdAt || h.time;
      return t && inRange(t);
    })
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
} catch (e) {
  console.log("history_err", e.message);
}

console.log("\\n=== Hub history BUY_* same window ===");
console.log("count", buys.length);
for (const h of buys) {
  console.log(
    [
      vn(h.timestamp),
      h.domain,
      h.actionType,
      h.status,
      h.templateId || "",
      h.username || h.userId || "",
    ].join("\\t")
  );
}

const buySet = new Set(buys.map((h) => String(h.domain || "").toLowerCase()));
const cfSet = new Set(adminNew.map((z) => z.name.toLowerCase()));
const onlyCf = [...cfSet].filter((d) => !buySet.has(d)).sort();
const onlyHub = [...buySet].filter((d) => !cfSet.has(d)).sort();
console.log("\\n=== Diff ===");
console.log("CF admin zone but no hub BUY:", onlyCf.length, onlyCf.join(", ") || "-");
console.log("Hub BUY but no CF admin zone in range:", onlyHub.length, onlyHub.join(", ") || "-");
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
