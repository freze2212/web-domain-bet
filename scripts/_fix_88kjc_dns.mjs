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
const TARGET = "gg88-lp-5uae-5.pages.dev";
const { findZoneByName, cfRequest, tokenForZone } = await import("../src/cloudflare.js");
const { assignDomain } = await import("../src/ownership.js");

const z = await findZoneByName(D);
const tok = tokenForZone(z);
const recs = await cfRequest(`/zones/${z.id}/dns_records`, { token: tok });

async function upsertCname(name, content) {
  const existing = recs.find((r) => r.type === "CNAME" && (r.name === name || r.name === `${name}.`));
  const body = { type: "CNAME", name, content, proxied: true, ttl: 1 };
  if (existing) {
    if (existing.content === content && existing.proxied) {
      console.log("SKIP", name, "already", content);
      return;
    }
    await cfRequest(`/zones/${z.id}/dns_records/${existing.id}`, { method: "PUT", token: tok, body });
    console.log("UPD", name, "->", content);
  } else {
    await cfRequest(`/zones/${z.id}/dns_records`, { method: "POST", token: tok, body });
    console.log("ADD", name, "->", content);
  }
}

await upsertCname(D, TARGET);
await upsertCname(`www.${D}`, TARGET);
assignDomain(D, "u_admin", { cnameTarget: TARGET, mode: "LP", currentLink: "https://gg8858.com/?id=633886974", templateId: "gg88_lp_5uae" });

console.log("wait 15s...");
await new Promise((r) => setTimeout(r, 15000));
for (const host of [D, "www." + D]) {
  const r = await fetch(`https://${host}/domains.json?v=${Date.now()}`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  console.log("LIVE", host, r.status, JSON.stringify(j[D]));
}
