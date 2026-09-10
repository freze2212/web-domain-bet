/**
 * Option A: Freze DIRECT/folder → Admin Git Pages (same family).
 * Live truth: HTTP 302/301 Location first, else domains.json.
 *
 * Usage:
 *   node scripts/migrate-freze-direct-to-admin-git.mjs prepare
 *   node scripts/migrate-freze-direct-to-admin-git.mjs run [concurrency]
 */
import fs from "fs";
import path from "path";

function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const CF = process.env.CLOUDFLARE_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const AD = process.env.CLOUDFLARE_ADMIN_API_TOKEN || CF;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;
const DATA = path.join("data");

/** Freze DIRECT project → Admin Git project */
const FAMILIES = [
  { freze: "lp-5h-gg88", admin: "lp-5h-gg88" },
  { freze: "lp-9d-xoaip-gg88", admin: "lp-9d-xoaip-gg88" },
  { freze: "lp-mm88-fly88", admin: "lp-mm88-fly88" },
  { freze: "lp-mm88-fly88-2", admin: "lp-mm88-fly88" },
  { freze: "landingpage-5f-g", admin: "landingpage-5f-g" },
];

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || e.register_url || "";
}
function norm(u) {
  try {
    const x = new URL(String(u).trim());
    x.hash = "";
    let s = x.toString();
    if (s.endsWith("/") && !x.search) s = s.slice(0, -1);
    return s;
  } catch {
    return String(u || "")
      .trim()
      .replace(/\/$/, "");
  }
}
function apexOf(d) {
  d = String(d).toLowerCase();
  return d.startsWith("www.") ? d.slice(4) : d;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cf(token, method, p, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: !!j.success, status: r.status, result: j.result, errors: j.errors || [], json: j };
}

/** Pages on Admin: Freze token works on Admin account; Admin token often lacks Pages */
const pagesTok = CF;
async function pagesAdmin(method, p, body) {
  return cf(pagesTok, method, p, body);
}
async function pagesFreze(method, p, body) {
  return cf(CF, method, p, body);
}

async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "migrate-freze-to-admin-git",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function hostOf(u) {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSameSiteRedirect(domain, locationUrl) {
  const a = apexOf(domain);
  const b = hostOf(locationUrl);
  return !!b && b === a;
}

/** LIVE TRUTH: off-site 302/301 Location first, else domains.json (ignore www↔apex hops) */
async function probeLive(domain) {
  const out = { domain, mode: "unknown", link: "", ok: false, homeStatus: 0, location: "", djLink: "" };
  let hopHost = domain;
  try {
    for (let hop = 0; hop < 5; hop++) {
      const home = await fetch(`https://${hopHost}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0" },
      });
      out.homeStatus = home.status;
      let loc = home.headers.get("location") || "";
      if (home.status >= 300 && home.status < 400 && loc) {
        if (loc.startsWith("/")) loc = `https://${hopHost}${loc}`;
        out.location = loc;
        if (isSameSiteRedirect(domain, loc)) {
          // www↔apex only — keep following
          hopHost = new URL(loc).hostname;
          continue;
        }
        out.mode = "302";
        out.link = loc;
        out.ok = !!norm(loc);
        return out;
      }
      break;
    }
  } catch (e) {
    out.homeError = e.message;
  }

  for (const host of [domain, `www.${apexOf(domain)}`, hopHost]) {
    try {
      const r = await fetch(`https://${host}/domains.json?v=${Date.now()}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache" },
      });
      out.djHttp = r.status;
      if (r.ok) {
        const j = await r.json();
        const apex = apexOf(domain);
        const link = linkOf(j[domain] || j[`www.${apex}`] || j[apex] || j[host]);
        out.djLink = link;
        out.mode = "LP";
        out.link = link;
        out.ok = !!norm(link);
        return out;
      }
    } catch (e) {
      out.djError = e.message;
    }
  }
  return out;
}

async function getProject(accountId, name) {
  const r = await cf(pagesTok, "GET", `/accounts/${accountId}/pages/projects/${encodeURIComponent(name)}`);
  if (!r.ok) return null;
  const custom = (r.result.domains || []).filter((d) => !String(d).endsWith(".pages.dev"));
  const sub = r.result.subdomain || name;
  const pagesDev = String(sub).endsWith(".pages.dev") ? sub : `${sub}.pages.dev`;
  return {
    name,
    accountId,
    repo: r.result.source?.config
      ? `${r.result.source.config.owner}/${r.result.source.config.repo_name}`
      : null,
    branch: r.result.source?.config?.production_branch || "main",
    pagesDev,
    custom,
    apex: custom.filter((d) => !String(d).startsWith("www.")).map((d) => String(d).toLowerCase()),
    raw: r.result,
  };
}

async function findZone(domain) {
  for (const [which, token, acc] of [
    ["freze", CF, AID],
    ["admin", CF, AA], // Freze token can read Admin zones
    ["admin", AD, AA],
  ]) {
    if (!token || !acc) continue;
    const z = await cf(token, "GET", `/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(acc)}`);
    if (z.ok && z.result?.length) {
      const zone = z.result.find((x) => x.status === "active") || z.result[0];
      return { which, token, accountId: acc, zone };
    }
  }
  return null;
}

async function disableForwardingRules(zoneInfo) {
  const rules = await cf(zoneInfo.token, "GET", `/zones/${zoneInfo.zone.id}/pagerules`);
  const fwd = (rules.result || []).filter((r) => r.actions?.some((a) => a.id === "forwarding_url"));
  for (const rule of fwd) {
    if (rule.status !== "disabled") {
      await cf(zoneInfo.token, "PATCH", `/zones/${zoneInfo.zone.id}/pagerules/${rule.id}`, { status: "disabled" });
    }
  }
  return fwd.length;
}

async function setCnames(zoneInfo, domain, target) {
  // remove conflicting A/AAAA on @ and www
  const all = await cf(zoneInfo.token, "GET", `/zones/${zoneInfo.zone.id}/dns_records?per_page=100`);
  for (const r of all.result || []) {
    if (
      (r.name === domain || r.name === `www.${domain}`) &&
      (r.type === "A" || r.type === "AAAA" || r.type === "CNAME")
    ) {
      // will recreate CNAME
      if (r.type !== "CNAME" || r.content !== target) {
        await cf(zoneInfo.token, "DELETE", `/zones/${zoneInfo.zone.id}/dns_records/${r.id}`);
      }
    }
  }
  const existing = await cf(zoneInfo.token, "GET", `/zones/${zoneInfo.zone.id}/dns_records?type=CNAME&per_page=100`);
  for (const host of [domain, `www.${domain}`]) {
    const hit = (existing.result || []).find((r) => r.name === host);
    if (hit) {
      if (hit.content === target && hit.proxied) continue;
      await cf(zoneInfo.token, "PUT", `/zones/${zoneInfo.zone.id}/dns_records/${hit.id}`, {
        type: "CNAME",
        name: host === domain ? "@" : "www",
        content: target,
        proxied: true,
        ttl: 1,
      });
    } else {
      await cf(zoneInfo.token, "POST", `/zones/${zoneInfo.zone.id}/dns_records`, {
        type: "CNAME",
        name: host === domain ? "@" : "www",
        content: target,
        proxied: true,
        ttl: 1,
      });
    }
  }
}

async function removePagesDomain(accountId, project, domain) {
  return cf(
    pagesTok,
    "DELETE",
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}`
  );
}

async function addPagesDomain(accountId, project, domain) {
  return cf(pagesTok, "POST", `/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/domains`, {
    name: domain,
  });
}

function entry(link) {
  return {
    main_url: link,
    register_url: link,
    app_url: link,
    cskh_url: link,
    messenger_url: link,
  };
}

async function syncGitLinks(repoFull, branch, updates) {
  // updates: [{domain, link}]
  const [owner, repo] = repoFull.split("/");
  const meta = await gh("GET", `/repos/${owner}/${repo}/contents/domains.json?ref=${branch}`);
  if (!meta.ok) throw new Error(`GET domains.json ${repoFull}: ${meta.status} ${meta.json.message || ""}`);
  const data = JSON.parse(Buffer.from(meta.json.content, "base64").toString("utf8"));
  let changed = 0;
  for (const u of updates) {
    const cur = linkOf(data[u.domain] || data[`www.${u.domain}`]);
    if (norm(cur) === norm(u.link)) continue;
    const val = entry(u.link);
    data[u.domain] = val;
    data[`www.${u.domain}`] = val;
    changed++;
  }
  if (!changed) return { changed: 0, commit: null };
  const content = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64");
  const put = await gh("PUT", `/repos/${owner}/${repo}/contents/domains.json`, {
    message: `fix(domains): sync ${changed} live links (302-first) for Freze→Admin migrate`,
    content,
    sha: meta.json.sha,
    branch,
  });
  if (!put.ok) throw new Error(`PUT domains.json: ${put.status} ${JSON.stringify(put.json)}`);
  return { changed, commit: put.json.commit?.sha };
}

async function waitAdminDj(pagesDev, domain, expected, tries = 36) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`https://${pagesDev}/domains.json?v=${Date.now()}`, {
        signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache" },
      });
      if (r.ok) {
        const j = await r.json();
        const link = linkOf(j[domain] || j[`www.${domain}`]);
        if (norm(link) === norm(expected)) return { ok: true, i, link };
        process.stderr.write(`  waitGit ${domain} #${i} got ${link}\n`);
      } else process.stderr.write(`  waitGit ${domain} #${i} http ${r.status}\n`);
    } catch (e) {
      process.stderr.write(`  waitGit ${domain} #${i} ${e.message}\n`);
    }
    await sleep(5000);
  }
  return { ok: false };
}

async function waitLiveMatch(domain, expected, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const p = await probeLive(domain);
    // after migrate expect LP mode with domains.json == expected (302 rules disabled)
    if (p.mode === "LP" && norm(p.link) === norm(expected)) return { ok: true, i, p };
    if (p.mode === "302" && norm(p.link) === norm(expected)) {
      // still 302 — page rule not cleared yet or DNS not switched
      process.stderr.write(`  waitLive ${domain} #${i} still 302 ${p.link}\n`);
    } else {
      process.stderr.write(`  waitLive ${domain} #${i} mode=${p.mode} link=${p.link} home=${p.homeStatus}\n`);
    }
    await sleep(5000);
  }
  return { ok: false };
}

async function prepare() {
  const rows = [];
  for (const fam of FAMILIES) {
    const freze = await getProject(AID, fam.freze);
    const admin = await getProject(AA, fam.admin);
    if (!freze) {
      rows.push({ ...fam, status: "skip", reason: "freze_missing" });
      continue;
    }
    if (!admin || !admin.repo) {
      rows.push({ ...fam, status: "skip", reason: "admin_git_missing", frezeApex: freze.apex });
      continue;
    }
    for (const domain of freze.apex) {
      const live = await probeLive(domain);
      const zone = await findZone(domain);
      const alreadyOnAdmin = admin.apex.includes(domain);
      rows.push({
        frezeProject: fam.freze,
        adminProject: fam.admin,
        adminRepo: admin.repo,
        adminBranch: admin.branch,
        adminPagesDev: admin.pagesDev,
        frezePagesDev: freze.pagesDev,
        domain,
        liveMode: live.mode,
        liveLink: live.link,
        liveOk: live.ok,
        zoneAcc: zone?.which || null,
        alreadyOnAdmin,
        migrate: live.ok && !!zone && !alreadyOnAdmin,
        skip_reason: !live.ok ? "live_fail" : !zone ? "no_zone" : alreadyOnAdmin ? "already_admin" : null,
      });
      process.stderr.write(`${domain} ${live.mode} ${live.ok ? "OK" : "FAIL"} ${live.link}\n`);
    }
  }
  const file = path.join(DATA, "_mig_freze_to_admin_prepare.json");
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
  console.log(JSON.stringify({ file, total: rows.length, migrate: rows.filter((r) => r.migrate).length, rows }, null, 2));
  return rows;
}

async function migrateOne(row, adminProjCache) {
  const domain = row.domain;
  const expected = row.liveLink;
  const oldCname = row.frezePagesDev;
  const newCname = row.adminPagesDev;

  // re-probe
  const live = await probeLive(domain);
  if (!live.ok) throw new Error(`STOP live fail ${domain}`);
  if (norm(live.link) !== norm(expected)) {
    throw new Error(`STOP live changed ${domain}: was ${expected} now ${live.link}`);
  }

  const zone = await findZone(domain);
  if (!zone) throw new Error(`STOP no zone ${domain}`);

  // snapshot CNAME for rollback
  const beforeDns = await cf(zone.token, "GET", `/zones/${zone.zone.id}/dns_records?type=CNAME&per_page=100`);
  const snap = (beforeDns.result || []).filter((r) => r.name === domain || r.name === `www.${domain}`);

  // ensure git has link
  const onPages = await waitAdminDj(newCname, domain, expected, 2);
  if (!onPages.ok) {
    // sync this one
    await syncGitLinks(row.adminRepo, row.adminBranch, [{ domain, link: expected }]);
    const w = await waitAdminDj(newCname, domain, expected, 40);
    if (!w.ok) throw new Error(`STOP git deploy timeout ${domain}`);
  }

  // remove from Freze pages
  for (const d of [domain, `www.${domain}`]) {
    await removePagesDomain(AID, row.frezeProject, d);
  }

  // add to Admin pages
  for (const d of [domain, `www.${domain}`]) {
    const add = await addPagesDomain(AA, row.adminProject, d);
    if (!add.ok && !String(add.errors?.[0]?.message || "").match(/already|exists|taken/i)) {
      // rollback: re-add freze
      await addPagesDomain(AID, row.frezeProject, d).catch(() => {});
      throw new Error(`STOP add admin pages ${d}: ${JSON.stringify(add.errors)}`);
    }
  }

  // disable 302 page rules so LP wins
  const disabled = await disableForwardingRules(zone);

  // CNAME → admin
  await setCnames(zone, domain, newCname);

  const wait = await waitLiveMatch(domain, expected, 30);
  if (!wait.ok) {
    // rollback DNS + pages
    process.stderr.write(`ROLLBACK ${domain}\n`);
    await setCnames(zone, domain, oldCname);
    for (const d of [domain, `www.${domain}`]) {
      await removePagesDomain(AA, row.adminProject, d).catch(() => {});
      await addPagesDomain(AID, row.frezeProject, d).catch(() => {});
    }
    throw new Error(`STOP wait_timeout ${domain}`);
  }

  return {
    domain,
    link: expected,
    liveModeBefore: row.liveMode,
    disabledPageRules: disabled,
    cname: newCname,
    zoneAcc: zone.which,
    ok: true,
  };
}

async function run(concurrency = 2) {
  const prepFile = path.join(DATA, "_mig_freze_to_admin_prepare.json");
  let rows;
  if (fs.existsSync(prepFile)) {
    rows = JSON.parse(fs.readFileSync(prepFile, "utf8")).rows;
  } else {
    rows = await prepare();
  }
  // refresh prepare always for safety
  rows = await prepare();

  const todo = rows.filter((r) => r.migrate);
  // group git syncs
  const byRepo = new Map();
  for (const r of todo) {
    const k = `${r.adminRepo}|${r.adminBranch}`;
    if (!byRepo.has(k)) byRepo.set(k, []);
    byRepo.get(k).push(r);
  }
  for (const [k, list] of byRepo) {
    const [repo, branch] = k.split("|");
    const updates = list.map((r) => ({ domain: r.domain, link: r.liveLink }));
    process.stderr.write(`sync-git ${repo} ${updates.length} domains\n`);
    const sync = await syncGitLinks(repo, branch, updates);
    process.stderr.write(`sync-git done changed=${sync.changed} commit=${sync.commit}\n`);
  }

  // wait deploys for each unique pagesDev
  const seen = new Set();
  for (const r of todo) {
    const key = r.adminPagesDev;
    if (seen.has(key)) continue;
    seen.add(key);
    // wait first domain of this project
    const sample = todo.find((x) => x.adminPagesDev === key);
    const w = await waitAdminDj(key, sample.domain, sample.liveLink, 40);
    if (!w.ok) {
      // still try per-domain later
      process.stderr.write(`WARN pages.dev deploy slow for ${key}\n`);
    }
  }

  const ok = [];
  const fail = [];
  let i = 0;
  async function worker() {
    while (i < todo.length) {
      const idx = i++;
      const row = todo[idx];
      try {
        process.stderr.write(`\n## migrate ${row.domain} (${row.liveMode}) → ${row.adminProject}\n`);
        const res = await migrateOne(row);
        ok.push(res);
        process.stderr.write(`OK ${row.domain} → ${res.link}\n`);
      } catch (e) {
        fail.push({ domain: row.domain, error: e.message, row });
        process.stderr.write(`FAIL ${row.domain}: ${e.message}\n`);
        // continue others but record
      }
    }
  }
  const n = Math.max(1, Math.min(concurrency, 3));
  await Promise.all(Array.from({ length: n }, () => worker()));

  const report = {
    at: new Date().toISOString(),
    ok,
    fail,
    skipped: rows.filter((r) => !r.migrate),
  };
  const out = path.join(DATA, "_mig_freze_to_admin_DONE.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, ok: ok.length, fail: fail.length, table: ok.map((x) => `${x.domain} | ${x.link}`) }, null, 2));
  if (fail.length) process.exitCode = 2;
}

const cmd = process.argv[2] || "prepare";
if (cmd === "prepare") await prepare();
else if (cmd === "run") await run(Number(process.argv[3] || 2));
else {
  console.error("Usage: prepare | run [concurrency]");
  process.exit(1);
}
