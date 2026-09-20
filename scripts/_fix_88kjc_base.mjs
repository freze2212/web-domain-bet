import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const dir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(dir, ".."));
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const D = "88kjc.dev";
const BASE = "gg88-lp-5uae";
const BASE_TARGET = "gg88-lp-5uae.pages.dev";
const { cfRequest, cfRequestFull, findZoneByName, tokenForZone, getPagesProjectDomainsCount, addPagesDomain, ensurePagesCname } = await import("../src/cloudflare.js");

const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
const tok = process.env.CLOUDFLARE_API_TOKEN;
const count = await getPagesProjectDomainsCount(acc, BASE, { token: tok });
console.log("base count", count);

// Remove from -5 overflow, add via hub helper on base project
for (const n of [D, `www.${D}`]) {
  await cfRequest(`/accounts/${acc}/pages/projects/gg88-lp-5uae-5/domains/${encodeURIComponent(n)}`, {
    method: "DELETE",
    token: tok,
  }).catch((e) => console.log("del -5", n, e.message.slice(0, 60)));
}

const tplPath = "/var/www/Landingpages/GG88/ldpape_4d-5-quocgia";
await addPagesDomain(D, BASE, tplPath, { token: tok });
await ensurePagesCname(D, BASE_TARGET);
console.log("addPagesDomain base done");

// DNS -> base target
const z = await findZoneByName(D);
const ztok = tokenForZone(z);
const recs = await cfRequest(`/zones/${z.id}/dns_records`, { token: ztok });
for (const name of [D, `www.${D}`]) {
  const ex = recs.find((r) => r.type === "CNAME" && r.name.replace(/\.$/, "") === name.replace(/\.$/, ""));
  if (ex) {
    await cfRequest(`/zones/${z.id}/dns_records/${ex.id}`, {
      method: "PUT",
      token: ztok,
      body: { type: "CNAME", name, content: BASE_TARGET, proxied: true, ttl: 1 },
    });
    console.log("DNS", name, "->", BASE_TARGET);
  }
}

for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  let st = "?";
  try {
    const r = await cfRequestFull(`/accounts/${acc}/pages/projects/${BASE}/domains/${encodeURIComponent(D)}`, { token: tok });
    st = r.result?.status || "ok";
  } catch (e) {
    st = e.message.slice(0, 40);
  }
  let http = 0;
  try {
    const lr = await fetch(`https://${D}/domains.json?v=${Date.now()}`, { signal: AbortSignal.timeout(12000) });
    http = lr.status;
  } catch {}
  console.log(`poll ${i + 1}`, "pages", st, "http", http);
  if (http === 200) break;
}
