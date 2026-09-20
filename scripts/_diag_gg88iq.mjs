import { Client } from "ssh2";
import fs from "fs";
import path from "path";

const root = "c:/FREZE-PRJ/web-tên-miền";
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const DOMAIN = "gg88iq.com";
const TOK = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;

function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => {
      c.exec(cmd, { maxBuffer: 8 * 1024 * 1024 }, (err, s) => {
        if (err) return reject(err);
        let o = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (o += d));
        s.on("close", () => {
          c.end();
          resolve(o);
        });
      });
    }).on("error", reject).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
  });
}

// CF zone + DNS
const zones = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${DOMAIN}`, {
  headers: { Authorization: `Bearer ${TOK}` },
}).then((r) => r.json());

console.log("=== ZONE ===");
const zone = zones.result?.[0];
console.log(zone ? { id: zone.id, status: zone.status, ns: zone.name_servers } : "NOT FOUND");

if (zone) {
  const dns = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?name=${DOMAIN}`, {
    headers: { Authorization: `Bearer ${TOK}` },
  }).then((r) => r.json());
  console.log("\n=== DNS apex ===");
  for (const rec of dns.result || []) {
    console.log(rec.type, rec.name, rec.content, "proxied=" + rec.proxied);
  }
  const www = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?name=www.${DOMAIN}`, {
    headers: { Authorization: `Bearer ${TOK}` },
  }).then((r) => r.json());
  console.log("\n=== DNS www ===");
  for (const rec of www.result || []) {
    console.log(rec.type, rec.name, rec.content, "proxied=" + rec.proxied);
  }
}

// Pages projects containing domain
const pages = await fetch(`https://api.cloudflare.com/client/v4/accounts/${AID}/pages/projects?per_page=50`, {
  headers: { Authorization: `Bearer ${TOK}` },
}).then((r) => r.json());

console.log("\n=== PAGES custom domains ===");
for (const p of pages.result || []) {
  const doms = p.domains || [];
  const hit = doms.filter((d) => (d.name || d).includes?.("gg88iq") || String(d).includes("gg88iq"));
  if (hit.length) console.log(p.name, hit);
}

// Search all pages for gg88iq via domains endpoint
for (const p of (pages.result || []).slice(0, 80)) {
  const dr = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${AID}/pages/projects/${encodeURIComponent(p.name)}/domains`,
    { headers: { Authorization: `Bearer ${TOK}` } }
  ).then((r) => r.json());
  const found = (dr.result || []).filter((d) => (d.name || "").includes("gg88iq"));
  if (found.length) console.log("FOUND in", p.name, found.map((d) => `${d.name} ${d.status || d.validation_data?.status || ""}`));
}

const probe = await sshExec(`
echo '=== HTTP ==='
for h in ${DOMAIN} www.${DOMAIN}; do
  code=$(curl -sI --max-time 15 https://$h/ | head -1)
  echo "$h $code"
done
echo '=== domains.json ==='
curl -s --max-time 15 https://${DOMAIN}/domains.json | head -c 500
echo
echo '=== history grep ==='
grep -r "gg88iq" /var/www/web-ten-mien/data/history*.json 2>/dev/null | tail -5 || true
grep -r "gg88iq" /var/www/web-ten-mien/data/tasks*.json 2>/dev/null | tail -3 || true
echo '=== find in landing ==='
grep -rl "gg88iq" /var/www/Landingpages/GG88/*/domains.json 2>/dev/null | head -5
`);
console.log("\n=== VPS PROBE ===\n" + probe);
