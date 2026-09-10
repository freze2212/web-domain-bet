/**
 * Finish remaining DIRECT → Git Pages migrations.
 * Live truth: off-site 302 first, else domains.json.
 * Safe JSON write (no broken \\n). Fail → rollback DNS+pages.
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
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const AD = process.env.CLOUDFLARE_ADMIN_API_TOKEN || CF;
const GH = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER || "freze2212";

const FAMILIES = [
  {
    id: "mm88",
    freze: "lp-mm88-5uae",
    gitProject: "lp-mm88-5uae-git2",
    repo: "lp-mm88-5uae",
    branch: "main",
    createGitIfMissing: false,
  },
  {
    id: "gg882pro",
    freze: "lp-gg882pro",
    gitProject: "lp-gg882pro-git2",
    repo: "lp-gg882pro",
    branch: "main",
    createGitIfMissing: false,
  },
  {
    id: "gg88pr",
    freze: "lp-gg88pr",
    gitProject: "lp-gg88pr-git2",
    repo: "lp-gg88pr",
    branch: "main",
    createGitIfMissing: true,
  },
  {
    id: "7f-llwin-2",
    freze: "lp-7f-llwin-games-2",
    gitProject: "lp-7f-llwin-games", // already GIT same template
    repo: "lp-7f-llwin-games",
    branch: "main",
    createGitIfMissing: false,
  },
  {
    id: "gt9",
    freze: "lp-gg88-gt9",
    gitProject: "lp-gg88-gt9-git2",
    repo: "lp-gg88-gt9",
    branch: "main",
    createGitIfMissing: false,
  },
  {
    id: "vip-3",
    freze: "lp-gg88-vip-3",
    gitProject: "lp-gg88-vip-7",
    repo: "lp-gg88-vip",
    branch: "main",
    createGitIfMissing: false,
  },
  {
    id: "vip-5",
    freze: "lp-gg88-vip-5",
    gitProject: "lp-gg88-vip-7",
    repo: "lp-gg88-vip",
    branch: "main",
    createGitIfMissing: false,
  },
  {
    id: "5uae-3",
    freze: "gg88-lp-5uae-3",
    gitProject: "gg88-lp-5uae-5",
    repo: "gg88-lp-5uae",
    branch: "main",
    createGitIfMissing: false,
  },
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
function hostOf(u) {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
function sameSite(domain, loc) {
  return !!hostOf(loc) && hostOf(loc) === apexOf(domain);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function cf(method, p, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, {
    method,
    headers: { Authorization: `Bearer ${CF}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: !!j.success, status: r.status, result: j.result, errors: j.errors || [] };
}

async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "finish-direct",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

async function probeLive(domain) {
  const out = { domain, mode: "unknown", link: "", ok: false, homeStatus: 0 };
  let hop = domain;
  try {
    for (let i = 0; i < 5; i++) {
      const home = await fetch(`https://${hop}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
        headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0" },
      });
      out.homeStatus = home.status;
      let loc = home.headers.get("location") || "";
      if (home.status >= 300 && home.status < 400 && loc) {
        if (loc.startsWith("/")) loc = `https://${hop}${loc}`;
        if (sameSite(domain, loc)) {
          hop = new URL(loc).hostname;
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
  for (const host of [domain, `www.${apexOf(domain)}`, hop]) {
    try {
      const r = await fetch(`https://${host}/domains.json?v=${Date.now()}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
        headers: { "Cache-Control": "no-cache" },
      });
      if (!r.ok) continue;
      const text = await r.text();
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        // recover truncated/corrupt
        let depth = 0,
          end = -1;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        if (end < 0) continue;
        j = JSON.parse(text.slice(0, end + 1));
      }
      const link = linkOf(
        j[domain] ||
          j[`www.${apexOf(domain)}`] ||
          j[apexOf(domain)] ||
          j._default ||
          j.defaultLink
      );
      out.mode = "LP";
      out.link = link;
      out.ok = !!norm(link);
      return out;
    } catch (e) {
      out.djError = e.message;
    }
  }
  return out;
}

async function getProject(name) {
  const r = await cf("GET", `/accounts/${AID}/pages/projects/${encodeURIComponent(name)}`);
  if (!r.ok) return null;
  const sub = r.result.subdomain || name;
  const pagesDev = String(sub).endsWith(".pages.dev") ? sub : `${sub}.pages.dev`;
  const custom = (r.result.domains || []).filter((d) => !String(d).endsWith(".pages.dev"));
  return {
    name,
    pagesDev,
    repo: r.result.source?.config
      ? `${r.result.source.config.owner}/${r.result.source.config.repo_name}`
      : null,
    branch: r.result.source?.config?.production_branch || "main",
    apex: custom.filter((d) => !String(d).startsWith("www.")).map((d) => String(d).toLowerCase()),
  };
}

async function ensureGitPages(fam) {
  let p = await getProject(fam.gitProject);
  if (p) return p;
  if (!fam.createGitIfMissing) throw new Error(`missing git project ${fam.gitProject}`);
  const created = await cf("POST", `/accounts/${AID}/pages/projects`, {
    name: fam.gitProject,
    production_branch: fam.branch,
    source: {
      type: "github",
      config: {
        owner: OWNER,
        repo_name: fam.repo,
        production_branch: fam.branch,
        pr_comments_enabled: false,
      },
    },
  });
  if (!created.ok) throw new Error(`create ${fam.gitProject}: ${JSON.stringify(created.errors)}`);
  // New Git-connected projects often have zero deployments until triggered
  const dep = await cf("POST", `/accounts/${AID}/pages/projects/${encodeURIComponent(fam.gitProject)}/deployments`, {
    branch: fam.branch || "main",
  });
  if (!dep.ok) {
    process.stderr.write(`  warn trigger deploy: ${JSON.stringify(dep.errors)}\n`);
  }
  for (let i = 0; i < 36; i++) {
    try {
      const text = await (
        await fetch(`https://${fam.gitProject}.pages.dev/domains.json?v=${Date.now()}`, {
          signal: AbortSignal.timeout(12000),
        })
      ).text();
      if (text.trim().startsWith("{")) break;
    } catch {
      /* wait */
    }
    await sleep(5000);
  }
  p = await getProject(fam.gitProject);
  if (!p) throw new Error(`created but not found ${fam.gitProject}`);
  return p;
}

async function findZone(domain) {
  for (const [which, token, acc] of [
    ["freze", CF, AID],
    ["admin", CF, AA],
    ["admin", AD, AA],
  ]) {
    if (!token || !acc) continue;
    const z = await cf(
      "GET",
      `/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(acc)}`
    );
    // cf() always uses CF token - for AD need separate
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(acc)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const j = await r.json();
    if (j.success && j.result?.length) {
      const zone = j.result.find((x) => x.status === "active") || j.result[0];
      return { which, token, accountId: acc, zone };
    }
  }
  return null;
}

async function setCnames(zoneInfo, domain, target) {
  const dns = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/dns_records?per_page=100`,
    { headers: { Authorization: `Bearer ${zoneInfo.token}` } }
  ).then((r) => r.json());
  for (const host of [domain, `www.${domain}`]) {
    for (const r of (dns.result || []).filter((x) => x.name === host)) {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/dns_records/${r.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${zoneInfo.token}` },
      });
    }
    const name = host === domain ? "@" : "www";
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/dns_records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${zoneInfo.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "CNAME", name, content: target, proxied: true, ttl: 1 }),
    });
  }
}

async function disableForwarding(zoneInfo) {
  const rules = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/pagerules`,
    { headers: { Authorization: `Bearer ${zoneInfo.token}` } }
  ).then((r) => r.json());
  for (const rule of rules.result || []) {
    if (rule.actions?.some((a) => a.id === "forwarding_url") && rule.status !== "disabled") {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/pagerules/${rule.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${zoneInfo.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      });
    }
  }
}

async function parseDomainsJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    let depth = 0,
      end = -1;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) throw new Error("unrecoverable domains.json");
    return JSON.parse(raw.slice(0, end + 1));
  }
}

async function syncGit(repo, branch, updates) {
  const meta = await gh("GET", `/repos/${OWNER}/${repo}/contents/domains.json?ref=${branch}`);
  if (!meta.ok) throw new Error(`GET ${repo}/domains.json ${meta.status} ${meta.json.message}`);
  const raw = Buffer.from(meta.json.content, "base64").toString("utf8");
  const data = await parseDomainsJsonSafe(raw);
  let changed = 0;
  for (const u of updates) {
    if (norm(linkOf(data[u.domain] || data[`www.${u.domain}`])) === norm(u.link)) continue;
    const e = entry(u.link);
    data[u.domain] = e;
    data[`www.${u.domain}`] = e;
    changed++;
  }
  if (!changed) return { changed: 0, commit: null };
  const body = JSON.stringify(data, null, 2) + "\n";
  JSON.parse(body);
  const put = await gh("PUT", `/repos/${OWNER}/${repo}/contents/domains.json`, {
    message: `fix(domains): sync ${changed} live links (${updates.map((x) => x.domain).join(",")})`,
    content: Buffer.from(body, "utf8").toString("base64"),
    sha: meta.json.sha,
    branch,
  });
  if (!put.ok) throw new Error(`PUT ${repo}: ${put.status} ${JSON.stringify(put.json)}`);
  return { changed, commit: put.json.commit?.sha };
}

async function waitPagesDj(pagesDev, domain, expected, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const text = await (await fetch(`https://${pagesDev}/domains.json?v=${Date.now()}`, { signal: AbortSignal.timeout(15000) })).text();
      const j = await parseDomainsJsonSafe(text);
      const link = linkOf(j[domain] || j[`www.${domain}`]);
      if (norm(link) === norm(expected)) return { ok: true, i };
      process.stderr.write(`  waitPages ${domain} #${i} ${link}\n`);
    } catch (e) {
      process.stderr.write(`  waitPages ${domain} #${i} ${e.message}\n`);
    }
    await sleep(5000);
  }
  return { ok: false };
}

async function waitLiveLp(domain, expected, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const p = await probeLive(domain);
    // after migrate we want LP with correct link (302 disabled)
    if (p.mode === "LP" && norm(p.link) === norm(expected)) return { ok: true, i, p };
    // if still 302 to same expected (page rule not cleared) also acceptable briefly but prefer LP
    if (p.mode === "302" && norm(p.link) === norm(expected)) {
      process.stderr.write(`  waitLive ${domain} #${i} still 302 ok-link\n`);
    } else {
      process.stderr.write(`  waitLive ${domain} #${i} ${p.mode} ${p.homeStatus} ${p.link}\n`);
    }
    await sleep(6000);
  }
  return { ok: false };
}

async function migrateDomain(fam, gitProj, domain, liveLink, oldPagesDev) {
  const zone = await findZone(domain);
  if (!zone) throw new Error("no zone");
  const newCname = gitProj.pagesDev;

  // ensure git has link
  let w = await waitPagesDj(newCname, domain, liveLink, 2);
  if (!w.ok) {
    await syncGit(fam.repo, fam.branch, [{ domain, link: liveLink }]);
    w = await waitPagesDj(newCname, domain, liveLink, 40);
    if (!w.ok) throw new Error("git deploy timeout");
  }

  // remove from old freze project
  for (const d of [domain, `www.${domain}`]) {
    await cf("DELETE", `/accounts/${AID}/pages/projects/${encodeURIComponent(fam.freze)}/domains/${encodeURIComponent(d)}`);
  }
  // add to git project
  for (const d of [domain, `www.${domain}`]) {
    const add = await cf("POST", `/accounts/${AID}/pages/projects/${encodeURIComponent(fam.gitProject)}/domains`, {
      name: d,
    });
    if (!add.ok && !/already|exists|taken/i.test(add.errors?.[0]?.message || "")) {
      // rollback add old
      await cf("POST", `/accounts/${AID}/pages/projects/${encodeURIComponent(fam.freze)}/domains`, { name: d }).catch(
        () => {}
      );
      throw new Error(`add pages ${d}: ${JSON.stringify(add.errors)}`);
    }
  }

  await disableForwarding(zone);
  await setCnames(zone, domain, newCname);

  const live = await waitLiveLp(domain, liveLink, 36);
  if (!live.ok) {
    process.stderr.write(`ROLLBACK ${domain}\n`);
    await setCnames(zone, domain, oldPagesDev);
    for (const d of [domain, `www.${domain}`]) {
      await cf(
        "DELETE",
        `/accounts/${AID}/pages/projects/${encodeURIComponent(fam.gitProject)}/domains/${encodeURIComponent(d)}`
      ).catch(() => {});
      await cf("POST", `/accounts/${AID}/pages/projects/${encodeURIComponent(fam.freze)}/domains`, { name: d }).catch(
        () => {}
      );
    }
    throw new Error("wait_timeout");
  }
  return { domain, link: liveLink, cname: newCname, modeBefore: live.p?.mode, ok: true };
}

const report = { at: new Date().toISOString(), batches: [], skipped: [], failed: [], ok: [] };
const ONLY = new Set(
  String(process.env.ONLY_FAMILIES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

for (const fam of FAMILIES) {
  if (ONLY.size && !ONLY.has(fam.id)) continue;
  process.stderr.write(`\n##### FAMILY ${fam.id} ${fam.freze} → ${fam.gitProject}\n`);
  const freze = await getProject(fam.freze);
  if (!freze || freze.apex.length === 0) {
    report.skipped.push({ family: fam.id, reason: "empty_or_missing_freze" });
    continue;
  }
  let gitProj;
  try {
    gitProj = await ensureGitPages(fam);
  } catch (e) {
    report.failed.push({ family: fam.id, error: e.message, stage: "ensureGitPages" });
    continue;
  }

  const prepared = [];
  for (const domain of freze.apex) {
    const live = await probeLive(domain);
    const zone = await findZone(domain);
    const row = {
      domain,
      liveMode: live.mode,
      liveLink: live.link,
      liveOk: live.ok,
      zone: zone?.which || null,
      migrate: live.ok && !!zone,
      skip: !live.ok ? "live_fail" : !zone ? "no_zone" : null,
    };
    prepared.push(row);
    process.stderr.write(`  probe ${domain} ${live.mode} ${live.ok ? live.link : "FAIL"}\n`);
  }

  const todo = prepared.filter((p) => p.migrate);
  const skip = prepared.filter((p) => !p.migrate);
  for (const s of skip) report.skipped.push({ family: fam.id, ...s });

  if (todo.length) {
    try {
      const sync = await syncGit(
        fam.repo,
        fam.branch,
        todo.map((t) => ({ domain: t.domain, link: t.liveLink }))
      );
      process.stderr.write(`  sync-git changed=${sync.changed} ${sync.commit || ""}\n`);
    } catch (e) {
      report.failed.push({ family: fam.id, error: e.message, stage: "syncGit" });
      continue;
    }
  }

  for (const t of todo) {
    try {
      process.stderr.write(`  migrate ${t.domain}\n`);
      // re-probe
      const live = await probeLive(t.domain);
      if (!live.ok) throw new Error("live_fail recheck");
      if (norm(live.link) !== norm(t.liveLink)) throw new Error(`live changed ${live.link}`);
      const res = await migrateDomain(fam, gitProj, t.domain, live.link, freze.pagesDev);
      report.ok.push({ family: fam.id, ...res });
      process.stderr.write(`  OK ${t.domain} → ${res.link}\n`);
    } catch (e) {
      report.failed.push({ family: fam.id, domain: t.domain, error: e.message, liveLink: t.liveLink });
      process.stderr.write(`  FAIL ${t.domain}: ${e.message}\n`);
    }
  }

  report.batches.push({
    family: fam.id,
    freze: fam.freze,
    git: fam.gitProject,
    prepared,
  });
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/_finish_remaining_direct.json", JSON.stringify(report, null, 2));
const table = report.ok.map((r) => `${r.domain} | ${r.link} | ${r.cname}`);
console.log(
  JSON.stringify(
    {
      ok: report.ok.length,
      failed: report.failed.length,
      skipped: report.skipped.length,
      table,
      failedDetail: report.failed,
      skippedDetail: report.skipped,
    },
    null,
    2
  )
);
if (report.failed.length) process.exitCode = 2;
