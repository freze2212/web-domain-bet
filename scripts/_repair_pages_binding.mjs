/**
 * Khắc phục 522: căn CNAME + re-assert Pages custom domain
 * Usage: node scripts/_repair_pages_binding.mjs 88kjc.dev
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const domainArg = process.argv[2] || "88kjc.dev";
const D = domainArg.trim().toLowerCase().replace(/^www\./, "");

const dir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(dir, ".."));
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const {
  pagesAccountHasDomain,
  reassertPagesCustomDomain,
  ensurePagesCname,
  cfRequestFull,
  findZoneByName,
  cfRequest,
  tokenForZone,
} = await import("../src/cloudflare.js");
const { findTemplateByDomain } = await import("../src/templates.js");

const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
const tok = process.env.CLOUDFLARE_API_TOKEN;

console.log("REPAIR", D);

const tpl = findTemplateByDomain(D);
const preferred = tpl?.pagesProject?.replace(/\.pages\.dev$/i, "") || "";
const hit = await pagesAccountHasDomain(acc, D, preferred);
console.log("PAGES_HIT", JSON.stringify(hit));

if (!hit.ok || !hit.project) {
  console.error("FAIL: chưa có custom domain trên Pages — cần deploy/addPagesDomain trước");
  process.exit(1);
}

// Re-assert nếu deactivated / pending
for (const n of [D]) {
  try {
    const st = await cfRequestFull(
      `/accounts/${acc}/pages/projects/${encodeURIComponent(hit.project)}/domains/${encodeURIComponent(n)}`,
      { token: tok }
    );
    const status = st.result?.status;
    console.log("STATUS", n, status);
    if (status !== "active") {
      console.log("RE-ASSERT", hit.project, D);
      await reassertPagesCustomDomain(hit.project, D, acc);
    }
  } catch (e) {
    console.log("RE-ASSERT after err", e.message.slice(0, 80));
    await reassertPagesCustomDomain(hit.project, D, acc);
  }
}

const actualTarget = `${hit.project}.pages.dev`;
console.log("CNAME ->", actualTarget);
await ensurePagesCname(D, actualTarget);

// Xóa www DNS (chỉ dùng apex)
const z = await findZoneByName(D);
const ztok = tokenForZone(z);
const recs = await cfRequest(`/zones/${z.id}/dns_records`, { token: ztok });
for (const n of [`www.${D}`]) {
  const ex = recs.find((r) => r.name.replace(/\.$/, "") === n);
  if (ex) {
    await cfRequest(`/zones/${z.id}/dns_records/${ex.id}`, { method: "DELETE", token: ztok });
    console.log("DEL DNS", n);
  }
  try {
    await cfRequestFull(
      `/accounts/${acc}/pages/projects/${encodeURIComponent(hit.project)}/domains/${encodeURIComponent(n)}`,
      { method: "DELETE", token: tok }
    );
    console.log("DEL PAGES", n);
  } catch {}
}

console.log("wait 20s...");
await new Promise((r) => setTimeout(r, 20000));
for (let i = 0; i < 6; i++) {
  try {
    const r = await fetch(`https://${D}/domains.json?v=${Date.now()}`, { signal: AbortSignal.timeout(15000) });
    console.log("LIVE", r.status, r.status === 200 ? "OK" : "still broken");
    if (r.status === 200) {
      const j = await r.json();
      console.log("LINK", JSON.stringify(j[D]));
      process.exit(0);
    }
  } catch (e) {
    console.log("LIVE_ERR", e.message);
  }
  await new Promise((r) => setTimeout(r, 10000));
}
process.exit(1);
