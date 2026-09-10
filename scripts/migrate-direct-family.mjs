/**
 * Safe migrate DIRECT Pages → new Git Pages project.
 * Supports Freze + Admin DNS (zone may live on either account).
 *
 * Usage:
 *   node scripts/migrate-direct-family.mjs prepare <oldProject> <newProject> <owner/repo> [branch]
 *   node scripts/migrate-direct-family.mjs sync-git <declare.json>
 *   node scripts/migrate-direct-family.mjs run <declare.json> [concurrency]
 *   node scripts/migrate-direct-family.mjs create-pages <newProject> <owner/repo> [branch]
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
const AD = process.env.CLOUDFLARE_ADMIN_API_TOKEN;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}
function norm(u) {
  return String(u || "")
    .trim()
    .replace(/\/$/, "");
}
function apexOf(d) {
  d = String(d).toLowerCase();
  return d.startsWith("www.") ? d.slice(4) : d;
}

async function cf(token, method, p, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  return { ok: !!j.success, status: r.status, result: j.result, errors: j.errors || [] };
}
const freze = (m, p, b) => cf(CF, m, p, b);
const admin = (m, p, b) => cf(AD, m, p, b);

async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "migrate-direct-family",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

async function probe(domain) {
  try {
    const r = await fetch(`https://${domain}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!r.ok) return { ok: false, http: r.status, link: "" };
    const j = await r.json();
    const link = linkOf(j[domain] || j[`www.${domain}`] || j[apexOf(domain)]);
    return { ok: true, http: r.status, link };
  } catch (e) {
    return { ok: false, http: 0, link: "", error: e.message };
  }
}

async function findZone(domain) {
  // Prefer Freze, then Admin
  for (const [which, token, acc] of [
    ["freze", CF, AID],
    ["admin", AD, AA],
  ]) {
    if (!token || !acc) continue;
    const z = await cf(
      token,
      "GET",
      `/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(acc)}`
    );
    if (z.ok && z.result?.length) {
      const zone = z.result.find((x) => x.status === "active") || z.result[0];
      return { which, token, accountId: acc, zone };
    }
  }
  return null;
}

async function getCnameRecords(zoneInfo, domain) {
  const recs = await cf(
    zoneInfo.token,
    "GET",
    `/zones/${zoneInfo.zone.id}/dns_records?type=CNAME&per_page=100`
  );
  return (recs.result || []).filter((r) => r.name === domain || r.name === `www.${domain}`);
}

async function setCnames(zoneInfo, domain, target) {
  const records = await getCnameRecords(zoneInfo, domain);
  const out = [];
  for (const name of [domain, `www.${domain}`]) {
    const rec = records.find((r) => r.name === name);
    if (!rec) {
      // create if missing
      const created = await cf(zoneInfo.token, "POST", `/zones/${zoneInfo.zone.id}/dns_records`, {
        type: "CNAME",
        name,
        content: target,
        proxied: true,
        ttl: 1,
      });
      out.push({ name, ok: created.ok, action: "create", content: created.result?.content, errors: created.errors });
      continue;
    }
    const patch = await cf(zoneInfo.token, "PATCH", `/zones/${zoneInfo.zone.id}/dns_records/${rec.id}`, {
      type: "CNAME",
      name,
      content: target,
      proxied: true,
      ttl: 1,
    });
    out.push({ name, ok: patch.ok, action: "patch", content: patch.result?.content, errors: patch.errors });
  }
  return out;
}

async function delDomains(project, domain) {
  const out = [];
  for (const d of [domain, `www.${domain}`]) {
    const del = await freze(
      "DELETE",
      `/accounts/${AID}/pages/projects/${project}/domains/${encodeURIComponent(d)}`
    );
    out.push({ d, ok: del.ok || del.errors?.[0]?.code === 8000021, errors: del.errors });
  }
  return out;
}

async function addDomains(project, domain) {
  const out = [];
  for (const d of [domain, `www.${domain}`]) {
    const add = await freze("POST", `/accounts/${AID}/pages/projects/${project}/domains`, { name: d });
    if (add.ok) {
      out.push({ d, ok: true, already: false, status: add.result?.status });
      continue;
    }
    if (add.errors?.[0]?.code === 8000018) {
      const get = await freze(
        "GET",
        `/accounts/${AID}/pages/projects/${project}/domains/${encodeURIComponent(d)}`
      );
      out.push({
        d,
        ok: get.ok && !!get.result?.status,
        already: true,
        onThis: get.ok && !!get.result?.status,
        status: get.result?.status || null,
        errors: add.errors,
      });
      continue;
    }
    out.push({ d, ok: false, errors: add.errors });
  }
  return out;
}

async function pagesStatus(project, domain) {
  const r = await freze(
    "GET",
    `/accounts/${AID}/pages/projects/${project}/domains/${encodeURIComponent(domain)}`
  );
  return { ok: r.ok, status: r.result?.status || null };
}

async function cmdCreatePages(newProject, repoFull, branch = "main") {
  const [owner, repo] = repoFull.split("/");
  const body = {
    name: newProject,
    production_branch: branch,
    source: {
      type: "github",
      config: {
        owner,
        repo_name: repo,
        production_branch: branch,
        deployments_enabled: true,
        production_deployments_enabled: true,
        pr_comments_enabled: false,
        preview_deployment_setting: "none",
      },
    },
  };
  const res = await freze("POST", `/accounts/${AID}/pages/projects`, body);
  if (!res.ok && !/already|exist/i.test(JSON.stringify(res.errors))) {
    throw new Error("create pages fail: " + JSON.stringify(res.errors));
  }
  // trigger empty commit deploy
  const ref = await gh("GET", `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  if (ref.ok) {
    const parent = ref.json.object.sha;
    const cj = await gh("GET", `/repos/${owner}/${repo}/git/commits/${parent}`);
    const nc = await gh("POST", `/repos/${owner}/${repo}/git/commits`, {
      message: `chore: trigger deploy for ${newProject}`,
      tree: cj.json.tree.sha,
      parents: [parent],
    });
    if (nc.ok) {
      await gh("PATCH", `/repos/${owner}/${repo}/git/refs/heads/${branch}`, { sha: nc.json.sha });
    }
  }
  // wait deploy
  for (let i = 0; i < 36; i++) {
    const deps = await freze(
      "GET",
      `/accounts/${AID}/pages/projects/${encodeURIComponent(newProject)}/deployments?per_page=3`
    );
    const ok = (deps.result || []).find(
      (d) => d.latest_stage?.name === "deploy" && d.latest_stage?.status === "success"
    );
    if (ok) {
      console.log(JSON.stringify({ ok: true, project: newProject, deployment: ok.id, url: ok.url }, null, 2));
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(JSON.stringify({ ok: true, project: newProject, warn: "deploy still pending" }, null, 2));
}

async function cmdPrepare(oldProject, newProject, repoFull, branch = "main") {
  const [owner, repo] = repoFull.split("/");
  const OLD_CNAME = `${oldProject}.pages.dev`;
  const NEW_CNAME = `${newProject}.pages.dev`;

  const proj = await freze("GET", `/accounts/${AID}/pages/projects/${encodeURIComponent(oldProject)}`);
  if (!proj.ok) throw new Error("old project missing");
  const custom = (proj.result.domains || [])
    .filter((d) => !String(d).endsWith(".pages.dev"))
    .map((d) => String(d).toLowerCase());
  const apexes = [...new Set(custom.map(apexOf))].sort();

  // pages.dev link map once
  let pagesDj = {};
  try {
    const r = await fetch(`https://${NEW_CNAME}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(20000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (r.ok) pagesDj = await r.json();
  } catch {}

  const domains = [];
  for (const domain of apexes) {
    const live = await probe(domain);
    const zone = await findZone(domain);
    const on4 = linkOf(pagesDj[domain] || pagesDj[`www.${domain}`]);
    let cnameNow = null;
    if (zone) {
      const recs = await getCnameRecords(zone, domain);
      cnameNow = recs.find((r) => r.name === domain)?.content?.toLowerCase() || null;
    }
    domains.push({
      domain,
      dnsAccount: zone?.which || null,
      zoneStatus: zone?.zone?.status || null,
      cname_now: cnameNow,
      cname_after: NEW_CNAME,
      old_cname_expected: OLD_CNAME,
      link_live_now: live.link || "",
      link_after_must_equal: live.link || "",
      link_on_new_pages: on4,
      pages_matches_live: !!(live.link && norm(on4) === norm(live.link)),
      live_ok: live.ok && !!live.link,
      migrate: live.ok && !!live.link && !!zone,
      skip_reason: !live.ok
        ? "live_fail"
        : !zone
          ? "no_zone_freze_or_admin"
          : null,
    });
    process.stderr.write(domain + (live.ok ? "." : "x"));
  }
  process.stderr.write("\n");

  const declare = {
    batch_id: `mig_${oldProject}_to_${newProject}`,
    oldProject,
    newProject,
    clearProjects: [oldProject, newProject],
    git: { owner, repo, branch },
    OLD_CNAME,
    NEW_CNAME,
    generatedAt: new Date().toISOString(),
    summary: {
      total: domains.length,
      migrate: domains.filter((d) => d.migrate).length,
      frezeDns: domains.filter((d) => d.dnsAccount === "freze").length,
      adminDns: domains.filter((d) => d.dnsAccount === "admin").length,
      needGitSync: domains.filter((d) => d.migrate && !d.pages_matches_live).length,
      skip: domains.filter((d) => !d.migrate).map((d) => ({ domain: d.domain, reason: d.skip_reason })),
    },
    domains: domains.filter((d) => d.migrate),
    skipped: domains.filter((d) => !d.migrate),
  };
  const out = path.join("data", `_${declare.batch_id}_declare.json`);
  fs.writeFileSync(out, JSON.stringify(declare, null, 2));
  fs.writeFileSync(
    path.join("data", `_${declare.batch_id}_before.json`),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        snap: declare.domains.map((d) => ({
          domain: d.domain,
          link_before: d.link_live_now,
          dnsAccount: d.dnsAccount,
        })),
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ saved: out, summary: declare.summary }, null, 2));
}

async function cmdSyncGit(declarePath) {
  const declared = JSON.parse(fs.readFileSync(declarePath, "utf8"));
  const { owner, repo, branch } = declared.git;
  const need = declared.domains.filter((d) => d.migrate && !d.pages_matches_live && d.live_ok);
  if (!need.length) {
    console.log(JSON.stringify({ ok: true, changed: 0, message: "Git already matches live for migrate set" }, null, 2));
    return;
  }
  const meta = await gh("GET", `/repos/${owner}/${repo}/contents/domains.json?ref=${branch}`);
  if (!meta.ok) throw new Error("git get fail " + JSON.stringify(meta.json));
  const dj = JSON.parse(Buffer.from(meta.json.content.replace(/\n/g, ""), "base64").toString("utf8"));
  const now = new Date().toISOString();
  const changed = [];
  for (const d of need) {
    // re-check live
    const live = await probe(d.domain);
    if (!live.ok || !live.link) throw new Error("STOP sync live fail " + d.domain);
    if (norm(live.link) !== norm(d.link_live_now)) {
      throw new Error(`STOP sync live changed ${d.domain}`);
    }
    const entry = {
      main_url: live.link,
      register_url: live.link,
      app_url: live.link,
      cskh_url: live.link,
      updated_at: now,
    };
    dj[d.domain] = entry;
    dj[`www.${d.domain}`] = { ...entry };
    changed.push(d.domain);
  }
  const content = Buffer.from(JSON.stringify(dj, null, 2) + "\n", "utf8").toString("base64");
  const put = await gh("PUT", `/repos/${owner}/${repo}/contents/domains.json`, {
    message: `fix(domains): sync ${changed.length} live links for ${declared.oldProject}→${declared.newProject}`,
    content,
    sha: meta.json.sha,
    branch,
  });
  if (!put.ok) throw new Error("git put fail " + JSON.stringify(put.json));
  // wait pages on NEW
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const r = await fetch(`https://${declared.NEW_CNAME}/domains.json?v=${Date.now()}`, {
        signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache" },
      });
      if (!r.ok) continue;
      const pages = await r.json();
      const bad = changed.filter((dom) => norm(linkOf(pages[dom] || pages[`www.${dom}`])) !== norm(need.find((n) => n.domain === dom).link_live_now));
      if (!bad.length) {
        console.log(JSON.stringify({ ok: true, commit: put.json.commit?.sha, changed }, null, 2));
        return;
      }
    } catch {}
  }
  console.log(JSON.stringify({ ok: true, commit: put.json.commit?.sha, changed, warn: "pages verify timeout — check manually" }, null, 2));
}

async function migrateOne(item, declared) {
  const domain = item.domain;
  const expected = item.link_after_must_equal;
  const OLD = declared.oldProject;
  const NEW = declared.newProject;
  const NEW_CNAME = declared.NEW_CNAME;
  const OLD_CNAME = declared.OLD_CNAME;
  const clearList = declared.clearProjects || [OLD, NEW];

  const before = await probe(domain);
  if (!before.ok || norm(before.link) !== norm(expected)) {
    return { domain, ok: false, stop: true, reason: "preflight_mismatch", before, expected };
  }

  const zone = await findZone(domain);
  if (!zone) return { domain, ok: false, stop: true, reason: "no_zone" };

  // clear from clearList
  for (const proj of clearList) await delDomains(proj, domain);

  const add = await addDomains(NEW, domain);
  if (add.some((a) => !a.ok)) {
    await addDomains(OLD, domain);
    await setCnames(zone, domain, OLD_CNAME);
    return { domain, ok: false, stop: true, reason: "add_new_fail", add };
  }

  let attached = false;
  for (let i = 0; i < 8; i++) {
    const st = await pagesStatus(NEW, domain);
    if (st.ok && st.status) {
      attached = true;
      break;
    }
    if (i === 3) await addDomains(NEW, domain);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!attached) {
    await addDomains(OLD, domain);
    await setCnames(zone, domain, OLD_CNAME);
    return { domain, ok: false, stop: true, reason: "not_attached" };
  }

  const dns = await setCnames(zone, domain, NEW_CNAME);
  if (dns.some((d) => !d.ok)) {
    await setCnames(zone, domain, OLD_CNAME);
    await delDomains(NEW, domain);
    await addDomains(OLD, domain);
    return { domain, ok: false, stop: true, reason: "dns_fail", dns };
  }

  // wait live stable
  let stable = 0;
  let last = null;
  for (let i = 0; i < 30; i++) {
    const live = await probe(domain);
    const www = await probe(`www.${domain}`);
    const st = await pagesStatus(NEW, domain);
    last = { i, live, www, st };
    const liveOk = live.ok && norm(live.link) === norm(expected);
    const wwwOk = www.ok && norm(www.link) === norm(expected);
    process.stderr.write(`  wait ${domain} #${i} live=${live.http} www=${www.http} ssl=${st.status} stable=${stable}\n`);
    if (liveOk && st.ok && st.status) {
      if (wwwOk) stable++;
      else stable = Math.min(stable + 1, 2); // apex OK counts; need 4 apex-stable if www lagging
      const need = wwwOk ? 2 : 4;
      if (stable >= need) break;
    } else stable = 0;
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (stable < 2) {
    await setCnames(zone, domain, OLD_CNAME);
    await delDomains(NEW, domain);
    await addDomains(OLD, domain);
    // wait rollback
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const rb = await probe(domain);
      if (rb.ok && norm(rb.link) === norm(expected)) break;
    }
    return { domain, ok: false, stop: true, reason: "wait_timeout", last };
  }

  const final = await probe(domain);
  if (!final.ok || norm(final.link) !== norm(expected)) {
    await setCnames(zone, domain, OLD_CNAME);
    await delDomains(NEW, domain);
    await addDomains(OLD, domain);
    return { domain, ok: false, stop: true, reason: "final_mismatch", final, expected };
  }
  return { domain, ok: true, link: final.link, dnsAccount: zone.which, cname: NEW_CNAME };
}

async function cmdRun(declarePath, concurrency = 4) {
  const declared = JSON.parse(fs.readFileSync(declarePath, "utf8"));
  let pages = {};
  try {
    const r = await fetch(`https://${declared.NEW_CNAME}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(20000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (r.ok) pages = await r.json();
  } catch (e) {
    throw new Error("pages.dev fetch fail: " + e.message);
  }
  const items = declared.domains.filter((d) => {
    const onNew = linkOf(pages[d.domain] || pages[`www.${d.domain}`]);
    if (norm(onNew) !== norm(d.link_after_must_equal)) {
      console.error(`SKIP ${d.domain} pages link mismatch — run sync-git first`);
      return false;
    }
    return true;
  });

  console.error(`Run ${declared.batch_id}: ${items.length} domains concurrency=${concurrency}`);
  const results = [];
  let idx = 0;
  let stop = null;
  async function worker() {
    while (idx < items.length) {
      if (stop) return;
      const my = idx++;
      const item = items[my];
      console.error(`\n==> ${item.domain} [${item.dnsAccount}] expect ${item.link_after_must_equal}`);
      const res = await migrateOne(item, declared);
      results[my] = res;
      if (res.ok) console.error(`OK ${item.domain} → ${res.link}`);
      else {
        console.error(`FAIL ${item.domain} → ${res.reason}`);
        stop = res;
        return;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker()));

  const flat = results.filter(Boolean);
  if (stop) {
    const out = path.join("data", `_${declared.batch_id}_STOP.json`);
    fs.writeFileSync(out, JSON.stringify({ stoppedAt: stop.domain, stop, results: flat }, null, 2));
    console.log(JSON.stringify({ STOP: true, domain: stop.domain, reason: stop.reason, saved: out, results: flat }, null, 2));
    process.exit(2);
  }
  const out = path.join("data", `_${declared.batch_id}_DONE.json`);
  fs.writeFileSync(out, JSON.stringify({ ok: true, results: flat, at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ ok: true, migrated: flat.length, results: flat, saved: out }, null, 2));
}

const [cmd, a1, a2, a3, a4] = process.argv.slice(2);
if (cmd === "create-pages") await cmdCreatePages(a1, a2, a3 || "main");
else if (cmd === "prepare") await cmdPrepare(a1, a2, a3, a4 || "main");
else if (cmd === "sync-git") await cmdSyncGit(a1);
else if (cmd === "run") await cmdRun(a1, Number(a2) || 4);
else {
  console.log(`Usage:
  create-pages <newProject> <owner/repo> [branch]
  prepare <oldProject> <newProject> <owner/repo> [branch]
  sync-git <declare.json>
  run <declare.json> [concurrency]`);
  process.exit(1);
}
