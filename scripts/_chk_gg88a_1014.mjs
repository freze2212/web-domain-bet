import { Client } from "ssh2";
import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const {
  findZoneByName,
  tokenForZone,
  cfRequest,
  isAdminAccountZone,
  getPrimaryAccountId,
} = await import("../src/cloudflare.js");

const domain = "gg88a.ink";
const zone = await findZoneByName(domain);
console.log("ZONE", {
  id: zone?.id,
  status: zone?.status,
  account: zone?.account?.name,
  accountId: zone?.account?.id,
  admin: isAdminAccountZone(zone),
  ns: zone?.name_servers,
});

const tok = tokenForZone(zone);
const dns = await cfRequest(`/zones/${zone.id}/dns_records?per_page=100`, { token: tok });
const relevant = (dns || []).filter((r) =>
  ["A", "AAAA", "CNAME"].includes(r.type) &&
  (r.name === domain || r.name === `www.${domain}` || r.name.endsWith(`.${domain}`))
);
console.log("DNS", relevant.map((r) => ({ type: r.type, name: r.name, content: r.content, proxied: r.proxied })));

const accId = process.env.CLOUDFLARE_ACCOUNT_ID;
async function listPagesDomains(project) {
  try {
    const doms = await cfRequest(
      `/accounts/${accId}/pages/projects/${encodeURIComponent(project)}/domains`
    );
    const hit = (doms || []).filter((d) =>
      String(d.name || "").toLowerCase().includes(domain)
    );
    console.log(`PAGES ${project}`, hit.length ? hit : "NO DOMAIN ENTRY");
    return hit;
  } catch (e) {
    console.log(`PAGES ${project} ERR`, e.message);
    return [];
  }
}

const projects = [
  "lp-gg88-vip-2",
  "lp-gg88-vip-3",
  "lp-gg88-vip-4",
  "lp-gg88-vip",
];
for (const p of projects) await listPagesDomains(p);

// Also search all pages projects for this domain
try {
  const projectsList = await cfRequest(`/accounts/${accId}/pages/projects?per_page=50`);
  for (const p of projectsList || []) {
    const name = p.name;
    if (!/gg88|vip|5uae/i.test(name)) continue;
    await listPagesDomains(name);
  }
} catch (e) {
  console.log("list projects err", e.message);
}

console.log("LIVE body", await fetch(`https://${domain}/`).then(async (r) => ({
  status: r.status,
  text: (await r.text()).slice(0, 80),
  cfRay: r.headers.get("cf-ray"),
})).catch((e) => e.message));
