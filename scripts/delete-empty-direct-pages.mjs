/**
 * Delete Cloudflare Pages projects that have ZERO custom domains
 * and are DIRECT (folder) leftovers — never delete Git projects with custom domains.
 * Dry-run first unless --apply
 */
import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const CF = process.env.CLOUDFLARE_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const APPLY = process.argv.includes("--apply");
const FREZE_ONLY = process.argv.includes("--freze-only");

// Never delete these even if empty (active Git targets / shared)
const KEEP = new Set([
  // keep nothing special if empty DIRECT — Git with 0 domains also kept unless DIRECT
]);

async function listAll(acc, label) {
  const out = [];
  let page = 1;
  while (page <= 50) {
    const j = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/pages/projects?page=${page}`,
      { headers: { Authorization: `Bearer ${CF}` } }
    ).then((r) => r.json());
    if (!j.success) {
      console.log(label, "list err", j.errors);
      break;
    }
    for (const p of j.result || []) {
      const custom = (p.domains || []).filter((d) => !String(d).endsWith(".pages.dev"));
      out.push({
        label,
        accountId: acc,
        name: p.name,
        source: p.source?.type || "DIRECT",
        custom: custom.length,
        subdomain: p.subdomain,
      });
    }
    const info = j.result_info;
    if (!info || page >= (info.total_pages || 1)) break;
    page++;
  }
  return out;
}

const all = [...(await listAll(AID, "freze")), ...(await listAll(AA, "admin"))];

// Empty = 0 custom domains. Prefer deleting DIRECT leftovers.
// Also delete DIRECT empty only (safer). Git empty kept (may be deploy target).
let victims = all.filter((p) => p.custom === 0 && p.source === "DIRECT" && !KEEP.has(p.name));
if (FREZE_ONLY) victims = victims.filter((p) => p.label === "freze");
// Extra known leftover if API still reports it
const extraNames = ["landingpage-5f-gg88"];
for (const name of extraNames) {
  if (victims.some((v) => v.name === name)) continue;
  const hit = all.find((p) => p.name === name && p.label === "freze");
  if (hit && hit.custom === 0) victims.push(hit);
}

console.log(`Total projects: ${all.length}`);
console.log(`Empty DIRECT to delete: ${victims.length}`);
for (const v of victims) console.log(`  ${v.label}/${v.name} (${v.subdomain || ""})`);

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(
  "data/_empty_pages_delete.json",
  JSON.stringify({ at: new Date().toISOString(), apply: APPLY, victims, keptGitEmpty: all.filter((p) => p.custom === 0 && p.source === "github") }, null, 2)
);

if (!APPLY) {
  console.log("\nDry-run only. Re-run with --apply to delete.");
  process.exit(0);
}

const results = [];
for (const v of victims) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${v.accountId}/pages/projects/${encodeURIComponent(v.name)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${CF}` } }
  ).then((x) => x.json());
  console.log(`DELETE ${v.label}/${v.name}`, r.success, r.errors || "");
  results.push({ ...v, success: r.success, errors: r.errors });
  await new Promise((res) => setTimeout(res, 300));
}
fs.writeFileSync("data/_empty_pages_delete_result.json", JSON.stringify(results, null, 2));
console.log(`Done. deleted=${results.filter((r) => r.success).length} fail=${results.filter((r) => !r.success).length}`);
