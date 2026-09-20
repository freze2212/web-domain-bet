import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const AT = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const FA = process.env.CLOUDFLARE_ACCOUNT_ID;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const FT = process.env.CLOUDFLARE_API_TOKEN;

async function listProjects(acc) {
  const out = [];
  let page = 1;
  for (;;) {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/pages/projects?per_page=10&page=${page}`,
      { headers: { Authorization: `Bearer ${AT}` } }
    );
    const j = await r.json();
    if (!j.success) throw new Error(JSON.stringify(j.errors));
    out.push(...(j.result || []));
    const total = j.result_info?.total_pages || 1;
    if (page >= total) break;
    page++;
  }
  return out;
}

function srcInfo(p) {
  const s = p.source;
  if (!s || !s.type) return { type: "direct", repo: null };
  const c = s.config || {};
  return {
    type: s.type,
    repo: c.owner ? `${c.owner}/${c.repo_name || c.repo}` : null,
  };
}

const freze = await listProjects(FA);
const admin = await listProjects(AA);
const fmap = new Map(freze.map((p) => [p.name, p]));
const amap = new Map(admin.map((p) => [p.name, p]));

const mod = await import(`../src/templates.js?t=${Date.now()}`);
const tpls = mod.ACTIVE_TEMPLATES || [];

const rows = [];
for (const t of tpls || []) {
  if (!t.pagesProject) continue;
  const name = t.pagesProject;
  const expectAdmin = t.pagesAccountId === AA || /uae/i.test(name) && t.pagesAccountId;
  const f = fmap.get(name);
  const a = amap.get(name);
  // also check -git2 sibling
  const f2 = fmap.get(name + "-git2") || fmap.get(name.replace(/-git2$/, ""));
  let where = null;
  let info = null;
  if (f) {
    where = "freze";
    info = srcInfo(f);
  } else if (a) {
    where = "admin";
    info = srcInfo(a);
  }
  const issues = [];
  if (!where) issues.push("PAGES_MISSING");
  else {
    if (info.type !== "github") issues.push("NOT_GIT:" + info.type);
    if (t.pagesAccountId === AA && where !== "admin") issues.push("HUB_EXPECTS_ADMIN_BUT_" + where);
    if (!t.pagesAccountId && where === "admin") issues.push("ON_ADMIN_NO_pagesAccountId");
    // renamed to git2?
    if (!f && fmap.get(name + "-git2")) issues.push("EXISTS_AS_" + name + "-git2");
    if (name.endsWith("-git2") === false) {
      const renamed = [...fmap.keys()].find((k) => k === name + "-git2" || k.startsWith(name + "-git"));
      // check known renames
    }
  }
  // known rename map from audit
  const renameHint = {
    "lp-mm88-5uae": "lp-mm88-5uae-git2",
    "lp-gg88-mx": "lp-gg88-mx-git2",
    "lp-gg88-gt9": "lp-gg88-gt9-git2",
  };
  if (renameHint[name] && fmap.get(renameHint[name]) && !fmap.get(name)) {
    issues.push("HUB_OLD_NAME_LIVE_" + renameHint[name]);
  }

  rows.push({
    id: t.id,
    pages: name,
    where,
    git: info?.type || null,
    repo: info?.repo || null,
    hubGit: t.gitRepo || null,
    pagesAccountId: !!t.pagesAccountId,
    issues,
  });
}

const bad = rows.filter((r) => r.issues.length);
const ok = rows.filter((r) => !r.issues.length);
console.log(JSON.stringify({
  frezeToken: "check separately",
  frezePages: freze.length,
  adminPages: admin.length,
  hubWithPages: rows.length,
  ok: ok.length,
  bad: bad.length,
  badRows: bad,
}, null, 2));
