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
const { findZoneByName, cfRequest, tokenForZone, cfRequestFull } = await import("../src/cloudflare.js");
const acc = process.env.CLOUDFLARE_ACCOUNT_ID;

const z = await findZoneByName(D);
const tok = tokenForZone(z);
const recs = await cfRequest(`/zones/${z.id}/dns_records`, { token: tok });
console.log("DNS", recs.filter((r) => r.name.includes("88kjc")).map((r) => ({ t: r.type, n: r.name, c: r.content })));

for (const proj of ["gg88-lp-5uae", "gg88-lp-5uae-5"]) {
  for (const n of [D, `www.${D}`]) {
    try {
      const r = await cfRequestFull(`/accounts/${acc}/pages/projects/${proj}/domains/${encodeURIComponent(n)}`);
      console.log("PAGES", proj, n, r.result?.status, r.result?.validation_data);
    } catch (e) {
      console.log("PAGES", proj, n, e.message.slice(0, 120));
    }
  }
}

for (const host of [D, "www." + D, "gg88-lp-5uae.pages.dev", "gg88-lp-5uae-5.pages.dev"]) {
  try {
    const r = await fetch(`https://${host}/domains.json?v=${Date.now()}`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    console.log("LIVE", host, r.status);
  } catch (e) {
    console.log("LIVE_ERR", host, e.message);
  }
}
