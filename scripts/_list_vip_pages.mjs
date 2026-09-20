import fs from "fs";
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const { cfRequest } = await import("../src/cloudflare.js");
const accId = process.env.CLOUDFLARE_ACCOUNT_ID;

let page = 1;
const all = [];
while (page <= 20) {
  const batch = await cfRequest(`/accounts/${accId}/pages/projects?page=${page}&per_page=20`);
  if (!batch?.length) break;
  all.push(...batch);
  if (batch.length < 20) break;
  page++;
}
const vip = all.filter((p) => /vip|gg88/i.test(p.name));
console.log("ALL", all.length);
console.log(
  "VIP/GG88",
  vip.map((p) => ({
    name: p.name,
    subdomain: p.subdomain,
    domains: (p.domains || []).slice(0, 5),
  }))
);

// Check domains on each vip*
for (const p of all.filter((x) => /lp-gg88-vip/i.test(x.name))) {
  try {
    const doms = await cfRequest(
      `/accounts/${accId}/pages/projects/${encodeURIComponent(p.name)}/domains`
    );
    const names = (doms || []).map((d) => `${d.name}:${d.status}`);
    console.log(p.name, "→", p.subdomain || "(no sub)", "count", names.length);
    const hit = names.filter((n) => n.includes("gg88a"));
    if (hit.length) console.log("  HIT", hit);
    // sample a few
    console.log("  sample", names.slice(0, 8));
  } catch (e) {
    console.log(p.name, "ERR", e.message);
  }
}
