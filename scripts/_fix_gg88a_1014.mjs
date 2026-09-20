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
  addPagesDomain,
  ensurePagesCname,
  waitForPagesDomainActive,
  cfRequest,
  findZoneByName,
  tokenForZone,
} = await import("../src/cloudflare.js");
const { getTemplate } = await import("../src/templates.js");

const domain = "gg88a.ink";
const tpl = getTemplate("lp_gg88_vip_2");
const accId = process.env.CLOUDFLARE_ACCOUNT_ID;
console.log("tpl", tpl?.id, tpl?.pagesProject, tpl?.path, "exists", fs.existsSync(tpl?.path || ""));

for (const name of ["lp-gg88-vip", "lp-gg88-vip-2", "lp-gg88-vip-3", "lp-gg88-vip-4", "lp-gg88-vip-5"]) {
  try {
    const p = await cfRequest(`/accounts/${accId}/pages/projects/${encodeURIComponent(name)}`);
    console.log("EXISTS", name, "subdomain=", p?.subdomain, "domains=", (p?.domains || []).length);
  } catch (e) {
    console.log("MISSING", name, e.message.slice(0, 80));
  }
}

console.log("\n--- addPagesDomain ---");
const pages = await addPagesDomain(domain, tpl.pagesProject, tpl.path);
console.log("pages", pages);

console.log("\n--- ensurePagesCname ---");
const cname = await ensurePagesCname(domain, pages?.canonicalSubdomain || tpl.cnameTarget);
console.log("cname", cname);

if (pages?.projectName) {
  try {
    await waitForPagesDomainActive(pages.projectName, domain, accId, 90000);
    console.log("Pages active OK");
  } catch (e) {
    console.log("wait active:", e.message);
  }
}

const zone = await findZoneByName(domain);
const dns = await cfRequest(`/zones/${zone.id}/dns_records?per_page=100`, { token: tokenForZone(zone) });
console.log(
  "DNS now",
  (dns || [])
    .filter((r) => r.name === domain || r.name === `www.${domain}`)
    .map((r) => ({ type: r.type, name: r.name, content: r.content, proxied: r.proxied }))
);

for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const res = await fetch(`https://${domain}/`, { redirect: "manual" }).catch((e) => ({ status: 0, err: e.message }));
  let text = "";
  try {
    text = res.text ? (await res.text()).slice(0, 80) : String(res.err || "");
  } catch {}
  console.log(`probe ${i}`, res.status, text.replace(/\s+/g, " ").slice(0, 80));
  if (res.status === 200) break;
}
