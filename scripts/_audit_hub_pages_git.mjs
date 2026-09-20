import fs from "fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const { listTemplates } = await import("../src/templates.js");

const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
const tok = process.env.CLOUDFLARE_API_TOKEN;
const adminAcc = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const adminTok = process.env.CLOUDFLARE_ADMIN_API_TOKEN;

console.log("frezeTok", (tok || "").slice(0, 12), "adminTok", (adminTok || "").slice(0, 12));

async function listAll(accId, token, label) {
  const all = [];
  let page = 1;
  while (page <= 50) {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accId}/pages/projects?page=${page}&per_page=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const j = await r.json();
    if (!j.success) {
      throw new Error(`${label}: ${(j.errors || []).map((e) => e.message).join("; ") || r.status}`);
    }
    if (!j.result?.length) break;
    all.push(...j.result);
    if (j.result.length < 10) break;
    page++;
  }
  return all;
}

const freze = await listAll(acc, adminTok, "freze-via-adminTok");
const admin = await listAll(adminAcc, adminTok, "admin");
console.log("NOTE: CLOUDFLARE_API_TOKEN in .env is INVALID — listed Freze Pages via Admin token (All accounts).");
console.log("Freze Pages", freze.length, "Admin Pages", admin.length);

const frezeMap = new Map(freze.map((p) => [p.name.toLowerCase(), p]));
const adminMap = new Map(admin.map((p) => [p.name.toLowerCase(), p]));

const rows = [];
for (const t of listTemplates()) {
  const name = String(t.pagesProject || "")
    .replace(/\.pages\.dev$/i, "")
    .trim();
  if (!name) continue;
  const expect = t.pagesAccountId && t.pagesAccountId === adminAcc ? "admin" : "freze";
  const frezeHit = frezeMap.get(name.toLowerCase());
  const adminHit = adminMap.get(name.toLowerCase());
  const primary = expect === "admin" ? adminHit : frezeHit;
  const src = primary?.source?.type || null;
  const repo = primary?.source?.config
    ? `${primary.source.config.owner}/${primary.source.config.repo_name}`
    : null;
  rows.push({
    id: t.id,
    pages: name,
    expect,
    onFreze: Boolean(frezeHit),
    onAdmin: Boolean(adminHit),
    git: !primary ? "MISSING" : src === "github" ? "github" : src || "direct",
    liveRepo: repo,
    hubGit: t.gitRepo || null,
  });
}

const frezeExpected = rows.filter((r) => r.expect === "freze");
const missF = frezeExpected.filter((r) => !r.onFreze);
const noGit = frezeExpected.filter((r) => r.onFreze && r.git !== "github");
const okGit = frezeExpected.filter((r) => r.onFreze && r.git === "github");

console.log("\n=== EXPECT FREZE (hub pagesProject) ===");
for (const r of frezeExpected) {
  const st = !r.onFreze ? "MISS" : r.git !== "github" ? "NO_GIT" : "OK_GIT";
  console.log(
    `${st.padEnd(6)} ${r.pages.padEnd(28)} git=${String(r.git).padEnd(8)} live=${r.liveRepo || "-"} hub=${r.hubGit || "-"}`
  );
}

console.log("\n=== EXPECT ADMIN ===");
for (const r of rows.filter((x) => x.expect === "admin")) {
  const st = !r.onAdmin ? "MISS" : r.git !== "github" ? "NO_GIT" : "OK_GIT";
  console.log(
    `${st.padEnd(6)} ${r.pages.padEnd(28)} git=${String(r.git).padEnd(8)} live=${r.liveRepo || "-"} onFreze=${r.onFreze}`
  );
}

console.log("\nSUMMARY");
console.log("Freze-expected templates:", frezeExpected.length);
console.log("  OK + GitHub:", okGit.length);
console.log("  MISSING on Freze:", missF.map((r) => r.pages));
console.log(
  "  On Freze but NOT Git:",
  noGit.map((r) => `${r.pages}:${r.git}`)
);

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(
  "data/_hub_pages_git_audit.json",
  JSON.stringify(
    { at: new Date().toISOString(), frezeTotal: freze.length, adminTotal: admin.length, rows, missF, noGit },
    null,
    2
  )
);
console.log("Wrote data/_hub_pages_git_audit.json");
