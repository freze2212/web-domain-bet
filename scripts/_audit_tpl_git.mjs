import { ACTIVE_TEMPLATES } from "../src/templates.js";
import { config } from "../src/config.js";
import { getAllPagesProjectsForAccount } from "../src/cloudflare.js";

function mapProj(p, acc) {
  const typ = (p.source?.type || "").toLowerCase();
  return {
    acc,
    name: p.name,
    isGit: typ === "github" || typ === "gitlab",
    repo: p.source?.config ? `${p.source.config.owner}/${p.source.config.repo_name}` : null,
  };
}

const frezeRaw = await getAllPagesProjectsForAccount(config.cloudflare.accountId());
const freze = (frezeRaw || []).map((p) => mapProj(p, "Freze"));

let admin = [];
const adminAcc = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const adminTok = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
if (adminAcc && adminTok) {
  // reuse same pagination pattern manually
  const out = [];
  let page = 1;
  while (page <= 50) {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${adminAcc}/pages/projects?page=${page}&per_page=10`,
      { headers: { Authorization: `Bearer ${adminTok}` } }
    );
    const j = await r.json();
    if (!j.success) {
      console.log("Admin fail:", JSON.stringify(j.errors).slice(0, 200));
      break;
    }
    out.push(...(j.result || []));
    if ((j.result || []).length < 10) break;
    page++;
  }
  admin = out.map((p) => mapProj(p, "Admin"));
}

const all = [...freze, ...admin];
console.log("Freze", freze.length, "Admin", admin.length, "GIT", all.filter((x) => x.isGit).length, "DIRECT", all.filter((x) => !x.isGit).length);
console.log("\nALL:");
for (const p of all.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(p.acc.padEnd(6), p.name.padEnd(30), p.isGit ? "GIT " + p.repo : "DIRECT");
}

function matchTpl(t) {
  const want = String(t.pagesProject || "").replace(/\.pages\.dev$/i, "").trim();
  const root = want.replace(/-\d+$/, "");
  let hits = all.filter(
    (p) =>
      p.name === want ||
      p.name === root ||
      p.name.startsWith(root + "-") ||
      p.name.startsWith(want + "-")
  );
  if (t.gitRepo) hits = [...hits, ...all.filter((p) => p.repo === t.gitRepo)];
  const seen = new Set();
  return hits.filter((h) => {
    const k = h.acc + ":" + h.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

let nGit = 0,
  nDirect = 0,
  nNone = 0,
  nMixed = 0;
console.log("\nTEMPLATE → CF");
for (const t of ACTIVE_TEMPLATES) {
  const hits = matchTpl(t);
  const git = hits.filter((h) => h.isGit);
  const dir = hits.filter((h) => !h.isGit);
  let status;
  if (!hits.length) {
    status = "NO_PAGES";
    nNone++;
  } else if (git.length && dir.length) {
    status = "MIXED";
    nMixed++;
  } else if (git.length) {
    status = "GIT";
    nGit++;
  } else {
    status = "DIRECT";
    nDirect++;
  }
  console.log(
    status.padEnd(8),
    t.id.padEnd(26),
    "want=" + String(t.pagesProject || "-").padEnd(22),
    hits.map((h) => `${h.acc}:${h.name}/${h.isGit ? "GIT" : "DIR"}`).join(", ") || "-"
  );
}
console.log("\nSUMMARY /29 → GIT", nGit, "| DIRECT-only", nDirect, "| MIXED", nMixed, "| NO_PAGES", nNone);
console.log("\nDIRECT leftovers:");
for (const p of all.filter((x) => !x.isGit)) console.log("-", p.acc, p.name);
