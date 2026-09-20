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
const LINK = "https://gg8858.com/?id=633886974";
const TEMPLATE_ID = "gg88_lp_5uae";
const OLD_REPO = "/var/www/Landingpages/GG88/ldpape_4d/domains.json";

const { addPagesDomain, ensurePagesCname, removeDomainFromAllPagesProjects } = await import("../src/cloudflare.js");
const { getTemplate, updateTemplateDomainsJson } = await import("../src/templates.js");
const { removeDomainFromRepo } = await import("../src/repo-scanner.js");
const { assignDomain } = await import("../src/ownership.js");

console.log("=== FIX 88kjc.dev ===");

// 1) Xóa bản ghi trùng repo cũ (link gg8830 sai)
if (fs.existsSync(OLD_REPO)) {
  const j = JSON.parse(fs.readFileSync(OLD_REPO, "utf8"));
  if (j[D]) {
    delete j[D];
    fs.writeFileSync(OLD_REPO, JSON.stringify(j, null, 2) + "\n", "utf8");
    console.log("OK removed duplicate from ldpape_4d/domains.json");
    await removeDomainFromRepo(D, OLD_REPO).catch((e) => console.warn("git old repo:", e.message));
  }
}

// 2) Đồng bộ link đúng vào mẫu 5 UAE
const tpl = getTemplate(TEMPLATE_ID);
if (!tpl) throw new Error("Template gg88_lp_5uae not found");
await updateTemplateDomainsJson(tpl, D, LINK, LINK);
console.log("OK domains.json 5-quocgia link", LINK);

// 3) Gỡ khỏi Pages project cũ (vip-2), gắn lại 5uae
await removeDomainFromAllPagesProjects(D, null, {
  hintProjects: ["lp-gg88-vip-2", "lp-gg88-vip-2-1", "lp-gg88-vip-2-2"],
}).catch((e) => console.warn("cleanup old pages:", e.message));

const added = await addPagesDomain(D, tpl.pagesProject, tpl.path);
console.log("OK addPagesDomain", JSON.stringify(added));

const cname = await ensurePagesCname(D, tpl.cnameTarget);
console.log("OK ensurePagesCname", JSON.stringify(cname));

assignDomain(D, "u_admin", {
  mode: "LP",
  currentLink: LINK,
  templateId: TEMPLATE_ID,
  cnameTarget: tpl.cnameTarget,
});
console.log("OK ownership updated");

// 4) Verify live
await new Promise((r) => setTimeout(r, 8000));
for (const host of [D, tpl.cnameTarget.replace(".pages.dev", "") + ".pages.dev"]) {
  try {
    const r = await fetch(`https://${host === D ? D : tpl.cnameTarget}/domains.json?v=${Date.now()}`, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    console.log("VERIFY", host, "http", r.status, "entry", JSON.stringify(j[D]));
  } catch (e) {
    console.log("VERIFY_ERR", host, e.message);
  }
}

console.log("DONE");
