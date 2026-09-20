/**
 * Steps 1–2: Baseline live (domain → Pages → repo) then sync GitHub domains.json = live link.
 * NEVER writes a link different from probed live. Outputs fix table JSON/CSV.
 */
import fs from "fs";
import path from "path";
import { config } from "../src/config.js";
import { getAllPagesProjectsForAccount, cfRequest } from "../src/cloudflare.js";
import { upsertDomainEntryInRepo } from "../src/github.js";

for (const line of fs.readFileSync(".env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const GH = process.env.GITHUB_TOKEN;
const ghHeaders = {
  Authorization: `Bearer ${GH}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "hub-sync-live",
  "X-GitHub-Api-Version": "2022-11-28",
};

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e.trim();
  return String(e.main_url || e.url || e.link || "").trim();
}
function normLink(u) {
  return String(u || "")
    .trim()
    .replace(/\/$/, "")
    .toLowerCase();
}
function isGit(p) {
  const t = (p.source?.type || "").toLowerCase();
  return t === "github" || t === "gitlab";
}
function repoOf(p) {
  if (!p?.source?.config?.owner || !p?.source?.config?.repo_name) return null;
  return `${p.source.config.owner}/${p.source.config.repo_name}`;
}

async function fetchGithubDj(repo) {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/domains.json`, {
      headers: ghHeaders,
    });
    const j = await r.json();
    if (!r.ok || !j.content) return { ok: false, map: {}, sha: null, reason: j.message || String(r.status) };
    let text = Buffer.from(j.content, "base64").toString("utf8").replace(/^\uFEFF/, "").trim();
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    const data = JSON.parse(text.slice(a, b + 1));
    const map = {};
    for (const [k, v] of Object.entries(data)) {
      const d = String(k).toLowerCase().replace(/^www\./, "");
      if (d.endsWith(".pages.dev")) continue;
      const l = linkOf(v);
      if (l && !map[d]) map[d] = l;
    }
    return { ok: true, map, raw: data, sha: j.sha };
  } catch (e) {
    return { ok: false, map: {}, sha: null, reason: e.message };
  }
}

async function probeLive(domain) {
  try {
    const r = await fetch(`https://${domain}/domains.json?cb=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "cache-control": "no-cache" },
      redirect: "follow",
    });
    if (r.ok) {
      const text = await r.text();
      try {
        const j = JSON.parse(text);
        const e = j[domain] || j[`www.${domain}`];
        const link = linkOf(e);
        if (link) return { ok: true, link, via: "domains.json", status: r.status };
      } catch {}
    }
  } catch (e) {
    /* fallthrough */
  }
  try {
    const r = await fetch(`https://${domain}/`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    const loc = r.headers.get("location") || "";
    if (r.status >= 300 && r.status < 400 && loc && !/\/$/.test(loc.replace(/https?:\/\/[^/]+/, ""))) {
      // external 302
      if (!loc.includes(domain)) return { ok: true, link: loc, via: "302", status: r.status };
    }
    if (r.status === 200) return { ok: true, link: "", via: "lp-200-no-link", status: 200, bareLp: true };
    return { ok: false, link: "", via: `http-${r.status}`, status: r.status };
  } catch (e) {
    return { ok: false, link: "", via: e.cause?.code || e.message, error: true };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

console.log("Loading Freze Pages projects...");
const projects = (await getAllPagesProjectsForAccount(config.cloudflare.accountId())) || [];
const acc = config.cloudflare.accountId();

/** @type {Array<{domain:string, pages:string, pagesType:string, repo:string|null}>} */
const domainRows = [];
for (const p of projects) {
  const full = await cfRequest(`/accounts/${acc}/pages/projects/${encodeURIComponent(p.name)}`);
  const repo = repoOf(full) || repoOf(p);
  const typ = isGit(full || p) ? "GIT" : "DIRECT";
  for (const d of full?.domains || []) {
    const name = String(d.name || d)
      .toLowerCase()
      .replace(/^www\./, "");
    if (!name || name.endsWith(".pages.dev")) continue;
    domainRows.push({ domain: name, pages: p.name, pagesType: typ, repo });
  }
}

// Dedupe: prefer row whose pagesType is GIT if same domain on multiple
const byDomain = new Map();
for (const row of domainRows) {
  const prev = byDomain.get(row.domain);
  if (!prev) byDomain.set(row.domain, row);
  else if (prev.pagesType !== "GIT" && row.pagesType === "GIT") byDomain.set(row.domain, row);
  else if (prev.pagesType === row.pagesType) {
    // keep both pages listed
    prev.alsoOn = [...(prev.alsoOn || []), row.pages];
  }
}
const unique = [...byDomain.values()];
console.log(`Unique custom domains on Freze Pages: ${unique.length}`);

console.log("Probing LIVE...");
const baseline = await pool(unique, 10, async (row) => {
  const live = await probeLive(row.domain);
  return { ...row, liveLink: live.link || "", liveVia: live.via, liveOk: !!live.ok && !!live.link, bareLp: !!live.bareLp };
});

fs.writeFileSync(
  "data/_baseline_live_step1.json",
  JSON.stringify({ at: new Date().toISOString(), count: baseline.length, rows: baseline }, null, 2)
);
console.log("Saved data/_baseline_live_step1.json");

// Group syncable rows by repo (only GIT projects with repo)
const byRepo = new Map();
for (const row of baseline) {
  if (row.pagesType !== "GIT" || !row.repo) continue;
  if (!row.liveOk) continue; // only sync when we have clear live link
  if (!byRepo.has(row.repo)) byRepo.set(row.repo, []);
  byRepo.get(row.repo).push(row);
}

const fixed = [];
const skipped = [];
const alreadyOk = [];

for (const [repo, rows] of byRepo) {
  console.log(`\n=== Repo ${repo} (${rows.length} live domains) ===`);
  const gh = await fetchGithubDj(repo);
  if (!gh.ok) {
    console.warn("  cannot read domains.json:", gh.reason);
    for (const r of rows) skipped.push({ ...r, reason: "gh-read-fail: " + gh.reason });
    continue;
  }

  // Batch: collect changes then one upsert file write via sequential upsertDomainEntryInRepo
  // (API one domain at a time with sha retry is safer)
  for (const r of rows) {
    const ghLink = gh.map[r.domain] || "";
    if (normLink(ghLink) === normLink(r.liveLink)) {
      alreadyOk.push({ domain: r.domain, pages: r.pages, repo, link: r.liveLink });
      continue;
    }
    const before = ghLink || null;
    try {
      await upsertDomainEntryInRepo(
        repo,
        r.domain,
        {
          main_url: r.liveLink,
          messenger_url: r.liveLink,
          telegram_url: r.liveLink,
        },
        { message: `fix(domains): align ${r.domain} to live (probe)` }
      );
      gh.map[r.domain] = r.liveLink; // local cache
      fixed.push({
        domain: r.domain,
        pages: r.pages,
        pagesType: r.pagesType,
        repo,
        before,
        after: r.liveLink,
        liveVia: r.liveVia,
        action: before ? "UPDATE_GH_TO_LIVE" : "ADD_GH_FROM_LIVE",
      });
      console.log(`  FIXED ${r.domain}: ${(before || "(missing)").slice(0, 50)} → ${r.liveLink.slice(0, 50)}`);
    } catch (e) {
      skipped.push({ ...r, reason: "upsert-fail: " + e.message, before });
      console.warn(`  FAIL ${r.domain}:`, e.message);
    }
    // gentle rate limit
    await new Promise((r) => setTimeout(r, 400));
  }
}

// Direct-hosted with live link but no git: list for later (don't invent repo)
const directLive = baseline.filter((r) => r.pagesType === "DIRECT" && r.liveOk);
const noLive = baseline.filter((r) => !r.liveOk);

const report = {
  at: new Date().toISOString(),
  summary: {
    baselineDomains: baseline.length,
    alreadyOk: alreadyOk.length,
    fixed: fixed.length,
    skipped: skipped.length,
    directWithLive: directLive.length,
    noLiveLink: noLive.length,
  },
  fixed,
  skipped,
  directWithLive: directLive.map((r) => ({
    domain: r.domain,
    pages: r.pages,
    liveLink: r.liveLink,
    note: "Still DIRECT Pages — GH sync deferred until Git Pages exists for this exact project/repo",
  })),
  noLiveLink: noLive.map((r) => ({
    domain: r.domain,
    pages: r.pages,
    pagesType: r.pagesType,
    repo: r.repo,
    liveVia: r.liveVia,
  })),
  alreadyOkSample: alreadyOk.slice(0, 20),
};

fs.writeFileSync("data/_step2_gh_aligned_to_live.json", JSON.stringify(report, null, 2));

// Markdown table for user
const md = [
  `# Miền đã sửa GitHub = link LIVE (bước 1–2)`,
  ``,
  `Thời điểm: ${report.at}`,
  ``,
  `| # | Domain | Pages | Repo | Trước (GH) | Sau (= LIVE) | Action |`,
  `|---|--------|-------|------|------------|--------------|--------|`,
  ...fixed.map(
    (f, i) =>
      `| ${i + 1} | ${f.domain} | ${f.pages} | ${f.repo} | ${f.before || "_(thiếu)_"} | ${f.after} | ${f.action} |`
  ),
  ``,
  `## Không sửa (Direct — chờ bước Git Pages)`,
  ``,
  `| Domain | Pages Direct | Live link |`,
  `|--------|--------------|-----------|`,
  ...directLive.map((r) => `| ${r.domain} | ${r.pages} | ${r.liveLink} |`),
  ``,
  `## Không có link live rõ (bỏ qua, không đụng GH)`,
  ``,
  `| Domain | Pages | via |`,
  `|--------|-------|-----|`,
  ...noLive.map((r) => `| ${r.domain} | ${r.pages} (${r.pagesType}) | ${r.liveVia} |`),
  ``,
  `## Summary`,
  `- Already OK (GH=live): ${alreadyOk.length}`,
  `- Fixed: ${fixed.length}`,
  `- Skipped errors: ${skipped.length}`,
  `- Direct with live: ${directLive.length}`,
  `- No live link: ${noLive.length}`,
].join("\n");

fs.writeFileSync("data/_step2_fixed_domains.md", md);
console.log("\n========== SUMMARY ==========");
console.log(report.summary);
console.log("Saved data/_step2_gh_aligned_to_live.json");
console.log("Saved data/_step2_fixed_domains.md");
