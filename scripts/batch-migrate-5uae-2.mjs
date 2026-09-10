/**
 * Batch migrate for gg88-lp-5uae-2 cluster.
 * STOP on first hard failure in any batch.
 *
 * Modes:
 *   A-plan          inventory live vs git (no write)
 *   A-push          push domains.json sync for mismatched apex (no DNS)
 *   A-verify        verify pages.dev links for synced domains
 *   B-connect       attempt connect -2 to Git (no DNS)
 *   C-batch N       migrate DNS batch size N (default 10); stop on fail
 *   C-status        show remaining on -2
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");

function loadEnv() {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
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
const GH = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER || "freze2212";
const REPO = "gg88-lp-5uae";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const OLD_PROJECT = "gg88-lp-5uae-2";
const NEW_PROJECT = process.env.MIGRATE_NEW_PROJECT || "gg88-lp-5uae-4";
const OLD_CNAME = `${OLD_PROJECT}.pages.dev`;
const NEW_CNAME = `${NEW_PROJECT}.pages.dev`;
/** Domains we must NOT auto-migrate (no Freze zone / no controllable DNS). */
const QUARANTINE = new Set(["gg88s.us"]);
const STATE = path.join(DATA, `_migrate_${OLD_PROJECT}_state.json`);

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || "";
}
function normLink(u) {
  return String(u || "").trim().replace(/\/$/, "");
}
function apexOf(d) {
  d = String(d).toLowerCase();
  return d.startsWith("www.") ? d.slice(4) : d;
}

async function cf(method, p, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, {
    method,
    headers: { Authorization: `Bearer ${CF}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  return { ok: !!j.success, status: r.status, result: j.result, errors: j.errors || [], messages: j.messages || [] };
}
async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "safe-batch-migrate",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

async function fetchLiveLink(domain) {
  try {
    const r = await fetch(`https://${domain}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!r.ok) return { ok: false, status: r.status, link: "" };
    const dj = await r.json();
    const e = dj[domain] || dj[`www.${domain}`] || dj[apexOf(domain)];
    return { ok: true, status: r.status, link: linkOf(e), hasEntry: !!e };
  } catch (e) {
    return { ok: false, status: 0, link: "", error: e.message };
  }
}

async function getGitDomains() {
  const res = await gh("GET", `/repos/${OWNER}/${REPO}/contents/domains.json?ref=${BRANCH}`);
  if (!res.ok) throw new Error("Git GET domains.json fail: " + JSON.stringify(res.json));
  const text = Buffer.from(res.json.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { sha: res.json.sha, dj: JSON.parse(text) };
}

async function listProjectDomains(project) {
  const res = await cf("GET", `/accounts/${AID}/pages/projects/${encodeURIComponent(project)}`);
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  return {
    project: res.result,
    domains: (res.result.domains || []).filter((d) => !String(d).endsWith(".pages.dev")).map((d) => String(d).toLowerCase()),
  };
}

async function getApexCname(domain) {
  const zones = await cf(
    "GET",
    `/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(AID)}`
  );
  if (!zones.ok || !zones.result?.length) return { zone: null, cname: null, records: [] };
  const zone = zones.result.find((z) => z.status === "active") || zones.result[0];
  const recs = await cf("GET", `/zones/${zone.id}/dns_records?type=CNAME&per_page=100`);
  const all = (recs.result || []).filter(
    (r) => r.name === domain || r.name === `www.${domain}` || r.name.endsWith(`.${domain}`)
  );
  const apex = all.find((r) => r.name === domain);
  return {
    zone,
    cname: apex ? String(apex.content).toLowerCase().replace(/\.$/, "") : null,
    records: all.map((r) => ({
      id: r.id,
      name: r.name,
      content: String(r.content).toLowerCase().replace(/\.$/, ""),
      proxied: r.proxied,
    })),
  };
}

function saveState(obj) {
  fs.writeFileSync(STATE, JSON.stringify(obj, null, 2));
}
function loadState() {
  if (!fs.existsSync(STATE)) return null;
  return JSON.parse(fs.readFileSync(STATE, "utf8"));
}

async function cmdAPlan() {
  const { domains } = await listProjectDomains(OLD_PROJECT);
  const apexes = [...new Set(domains.map(apexOf))].sort();
  const { sha, dj } = await getGitDomains();
  const rows = [];
  console.error(`Scanning ${apexes.length} apex domains on ${OLD_PROJECT}...`);
  for (const domain of apexes) {
    const live = await fetchLiveLink(domain);
    const dns = await getApexCname(domain);
    const gitLink = linkOf(dj[domain]);
    const gitWww = linkOf(dj[`www.${domain}`]);
    const liveN = normLink(live.link);
    const row = {
      domain,
      liveOk: live.ok && !!live.link,
      liveLink: live.link || "",
      liveError: live.error || (live.ok ? null : `http ${live.status}`),
      gitLink,
      gitWww,
      gitMatchLive: liveN && normLink(gitLink) === liveN && normLink(gitWww) === liveN,
      needsGitSync: !!(liveN && (normLink(gitLink) !== liveN || normLink(gitWww) !== liveN || !dj[domain] || !dj[`www.${domain}`])),
      cname: dns.cname,
      cnameOnOld: dns.cname === OLD_CNAME,
      zoneStatus: dns.zone?.status || null,
      zoneId: dns.zone?.id || null,
      dnsRecords: dns.records,
    };
    rows.push(row);
    process.stderr.write(row.liveOk ? (row.gitMatchLive ? "." : "!") : "x");
  }
  process.stderr.write("\n");

  const plan = {
    generatedAt: new Date().toISOString(),
    oldProject: OLD_PROJECT,
    newProject: NEW_PROJECT,
    gitRepo: `${OWNER}/${REPO}@${BRANCH}`,
    gitSha: sha,
    summary: {
      total: rows.length,
      liveOk: rows.filter((r) => r.liveOk).length,
      liveFail: rows.filter((r) => !r.liveOk).length,
      gitMatch: rows.filter((r) => r.gitMatchLive).length,
      needsGitSync: rows.filter((r) => r.needsGitSync).length,
      cnameOnOld: rows.filter((r) => r.cnameOnOld).length,
      quarantine: rows.filter((r) => !r.liveOk).map((r) => r.domain),
    },
    rows,
  };
  const out = path.join(DATA, `_migrate_${OLD_PROJECT}_plan.json`);
  fs.writeFileSync(out, JSON.stringify(plan, null, 2));
  saveState({ phase: "A-plan", planFile: out, summary: plan.summary, stopped: false });
  console.log(JSON.stringify({ saved: out, summary: plan.summary }, null, 2));
}

async function cmdAPush() {
  const planFile = path.join(DATA, `_migrate_${OLD_PROJECT}_plan.json`);
  if (!fs.existsSync(planFile)) throw new Error("Chạy A-plan trước");
  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  const quarantine = plan.summary.quarantine || [];
  const toSync = plan.rows.filter((r) => r.needsGitSync && r.liveOk);
  if (!toSync.length) {
    console.log(JSON.stringify({ ok: true, message: "Không có domain cần sync Git", quarantine }, null, 2));
    return;
  }

  // Preflight: re-fetch live for each toSync; STOP if any changed or failed
  console.error(`Preflight re-check ${toSync.length} domains...`);
  for (const r of toSync) {
    const live = await fetchLiveLink(r.domain);
    if (!live.ok || !live.link) {
      saveState({ phase: "A-push", stopped: true, reason: "live_fail_preflight", domain: r.domain, live });
      throw new Error(`STOP: ${r.domain} live fail preflight`);
    }
    if (normLink(live.link) !== normLink(r.liveLink)) {
      saveState({
        phase: "A-push",
        stopped: true,
        reason: "live_changed",
        domain: r.domain,
        was: r.liveLink,
        now: live.link,
      });
      throw new Error(`STOP: ${r.domain} live link changed during plan`);
    }
    process.stderr.write(".");
  }
  process.stderr.write("\n");

  const { sha, dj } = await getGitDomains();
  const now = new Date().toISOString();
  const changed = [];
  for (const r of toSync) {
    const entry = {
      main_url: r.liveLink,
      register_url: r.liveLink,
      app_url: r.liveLink,
      cskh_url: r.liveLink,
      updated_at: now,
    };
    dj[r.domain] = entry;
    dj[`www.${r.domain}`] = { ...entry };
    changed.push(r.domain);
  }

  const content = Buffer.from(JSON.stringify(dj, null, 2) + "\n", "utf8").toString("base64");
  const put = await gh("PUT", `/repos/${OWNER}/${REPO}/contents/domains.json`, {
    message: `fix(domains): sync ${changed.length} live links from ${OLD_PROJECT} cluster (no DNS)`,
    content,
    sha,
    branch: BRANCH,
  });
  if (!put.ok) {
    saveState({ phase: "A-push", stopped: true, reason: "git_put_fail", put });
    throw new Error("STOP: git push fail " + JSON.stringify(put.json));
  }

  const result = {
    ok: true,
    commit: put.json.commit?.sha,
    html: put.json.commit?.html_url,
    changedCount: changed.length,
    changed,
    quarantine,
    next: "Chạy A-verify sau khi Pages deploy",
  };
  saveState({ phase: "A-push", stopped: false, ...result });
  fs.writeFileSync(path.join(DATA, `_migrate_${OLD_PROJECT}_push.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

async function cmdAVerify() {
  const plan = JSON.parse(fs.readFileSync(path.join(DATA, `_migrate_${OLD_PROJECT}_plan.json`), "utf8"));
  const targets = plan.rows.filter((r) => r.liveOk);
  const fails = [];
  const ok = [];
  for (const r of targets) {
    let pages;
    try {
      const resp = await fetch(`https://${NEW_CNAME}/domains.json?v=${Date.now()}`, {
        signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache" },
      });
      if (!resp.ok) throw new Error("http " + resp.status);
      const dj = await resp.json();
      const link = linkOf(dj[r.domain] || dj[`www.${r.domain}`]);
      pages = { ok: true, link };
    } catch (e) {
      pages = { ok: false, error: e.message, link: "" };
    }
    const match = pages.ok && normLink(pages.link) === normLink(r.liveLink);
    if (!match) {
      fails.push({ domain: r.domain, expected: r.liveLink, got: pages.link, pages });
      saveState({ phase: "A-verify", stopped: true, reason: "pages_mismatch", fails });
      console.log(JSON.stringify({ STOP: true, domain: r.domain, expected: r.liveLink, got: pages.link }, null, 2));
      process.exit(2);
    }
    ok.push(r.domain);
    process.stderr.write(".");
  }
  process.stderr.write("\n");
  const result = { ok: true, verified: ok.length, fails: 0 };
  saveState({ phase: "A-verify", stopped: false, ...result });
  console.log(JSON.stringify(result, null, 2));
}

async function waitDeploy(commitSha, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await cf(
      "GET",
      `/accounts/${AID}/pages/projects/${encodeURIComponent(NEW_PROJECT)}/deployments?per_page=5`
    );
    const deps = res.result || [];
    const hit = deps.find((d) => d.deployment_trigger?.metadata?.commit_hash === commitSha);
    if (hit) {
      const st = hit.latest_stage?.status;
      const name = hit.latest_stage?.name;
      if (name === "deploy" && st === "success") return hit;
      if (st === "failure") throw new Error("Deploy failed: " + hit.id);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Deploy wait timeout for " + commitSha);
}

async function cmdBConnect() {
  // Cloudflare Pages: connecting Git to existing DIRECT project often requires dashboard.
  // Try PATCH with source; if fail, report exact error and STOP.
  const body = {
    source: {
      type: "github",
      config: {
        owner: OWNER,
        repo_name: REPO,
        production_branch: BRANCH,
        pr_comments_enabled: false,
        deployments_enabled: true,
        production_deployments_enabled: true,
        preview_deployment_setting: "none",
        path: "",
      },
    },
  };
  const res = await cf("PATCH", `/accounts/${AID}/pages/projects/${encodeURIComponent(OLD_PROJECT)}`, body);
  if (!res.ok) {
    saveState({ phase: "B-connect", stopped: true, reason: "api_connect_fail", res });
    console.log(
      JSON.stringify(
        {
          STOP: true,
          message:
            "API không Connect Git được (thường cần OAuth installation trên dashboard). Phase C vẫn có thể chạy vì NEW project đã Git.",
          errors: res.errors,
          manual: `Cloudflare Dashboard → Workers & Pages → ${OLD_PROJECT} → Settings → Builds & deployments → Connect to Git → ${OWNER}/${REPO} branch ${BRANCH}`,
        },
        null,
        2
      )
    );
    process.exit(2);
  }
  saveState({ phase: "B-connect", stopped: false, result: res.result?.source });
  console.log(JSON.stringify({ ok: true, source: res.result?.source }, null, 2));
}

async function cmdCBatch(batchSize = 10) {
  const plan = JSON.parse(fs.readFileSync(path.join(DATA, `_migrate_${OLD_PROJECT}_plan.json`), "utf8"));
  const candidates = plan.rows.filter(
    (r) => r.liveOk && r.cnameOnOld && !QUARANTINE.has(r.domain)
  );
  // refresh which still on old
  const remaining = [];
  for (const r of candidates) {
    const dns = await getApexCname(r.domain);
    if (dns.cname === OLD_CNAME) remaining.push({ ...r, zoneId: dns.zone?.id, dnsRecords: dns.records });
  }
  const batch = remaining.slice(0, batchSize);
  if (!batch.length) {
    console.log(JSON.stringify({ ok: true, message: "Không còn domain CNAME old cần migrate", remaining: 0 }, null, 2));
    return;
  }

  console.error(`C-batch size=${batch.length}: ${batch.map((b) => b.domain).join(", ")}`);
  const results = [];

  for (const r of batch) {
    const domain = r.domain;
    const www = `www.${domain}`;

    // 1) preflight live still correct on CURRENT host
    const pre = await fetchLiveLink(domain);
    if (!pre.ok || normLink(pre.link) !== normLink(r.liveLink)) {
      saveState({ phase: "C-batch", stopped: true, reason: "preflight_live", domain, pre, expected: r.liveLink });
      console.log(JSON.stringify({ STOP: true, step: "preflight", domain, pre, expected: r.liveLink }, null, 2));
      process.exit(2);
    }

    // 2) ensure NEW pages.dev has correct entry
    let pagesLink = "";
    try {
      const resp = await fetch(`https://${NEW_CNAME}/domains.json?v=${Date.now()}`, {
        signal: AbortSignal.timeout(12000),
        headers: { "Cache-Control": "no-cache" },
      });
      const dj = await resp.json();
      pagesLink = linkOf(dj[domain] || dj[www]);
    } catch (e) {
      saveState({ phase: "C-batch", stopped: true, reason: "pages_dev_fetch", domain, error: e.message });
      console.log(JSON.stringify({ STOP: true, step: "pages_dev", domain, error: e.message }, null, 2));
      process.exit(2);
    }
    if (normLink(pagesLink) !== normLink(r.liveLink)) {
      saveState({ phase: "C-batch", stopped: true, reason: "pages_link_mismatch", domain, pagesLink, expected: r.liveLink });
      console.log(JSON.stringify({ STOP: true, step: "pages_link", domain, pagesLink, expected: r.liveLink }, null, 2));
      process.exit(2);
    }

    // 3) remove from old pages (ignore 404)
    for (const d of [domain, www]) {
      await cf("DELETE", `/accounts/${AID}/pages/projects/${encodeURIComponent(OLD_PROJECT)}/domains/${encodeURIComponent(d)}`);
    }

    // 4) add to new pages
    for (const d of [domain, www]) {
      const add = await cf("POST", `/accounts/${AID}/pages/projects/${encodeURIComponent(NEW_PROJECT)}/domains`, {
        name: d,
      });
      // 8000014 already exists is ok; other errors STOP
      if (!add.ok) {
        const code = add.errors?.[0]?.code;
        if (code !== 8000014 && add.status !== 409) {
          // try continue if already exists message
          const msg = JSON.stringify(add.errors);
          if (!/already|exist/i.test(msg)) {
            saveState({ phase: "C-batch", stopped: true, reason: "add_domain_fail", domain: d, add });
            console.log(JSON.stringify({ STOP: true, step: "add_domain", domain: d, add }, null, 2));
            process.exit(2);
          }
        }
      }
    }

    // 5) patch DNS records pointing to OLD → NEW
    const dns = await getApexCname(domain);
    if (!dns.zone) {
      saveState({ phase: "C-batch", stopped: true, reason: "no_zone", domain });
      console.log(JSON.stringify({ STOP: true, step: "no_zone", domain }, null, 2));
      process.exit(2);
    }
    const toPatch = dns.records.filter((rec) => rec.content === OLD_CNAME && (rec.name === domain || rec.name === www));
    if (!toPatch.length) {
      // maybe already moved
      if (dns.cname === NEW_CNAME) {
        results.push({ domain, skipped: true, reason: "already_new_cname" });
        continue;
      }
      saveState({ phase: "C-batch", stopped: true, reason: "no_old_cname_records", domain, dns });
      console.log(JSON.stringify({ STOP: true, step: "dns_records", domain, dns }, null, 2));
      process.exit(2);
    }
    for (const rec of toPatch) {
      const patch = await cf("PATCH", `/zones/${dns.zone.id}/dns_records/${rec.id}`, {
        type: "CNAME",
        name: rec.name,
        content: NEW_CNAME,
        proxied: true,
        ttl: 1,
      });
      if (!patch.ok) {
        saveState({ phase: "C-batch", stopped: true, reason: "dns_patch_fail", domain: rec.name, patch });
        console.log(JSON.stringify({ STOP: true, step: "dns_patch", domain: rec.name, patch }, null, 2));
        process.exit(2);
      }
    }

    // 6) verify live link (retry a few times)
    let verified = null;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const post = await fetchLiveLink(domain);
      if (post.ok && normLink(post.link) === normLink(r.liveLink)) {
        verified = post;
        break;
      }
      verified = post;
    }
    if (!verified?.ok || normLink(verified.link) !== normLink(r.liveLink)) {
      saveState({
        phase: "C-batch",
        stopped: true,
        reason: "post_verify_fail",
        domain,
        verified,
        expected: r.liveLink,
      });
      console.log(
        JSON.stringify({ STOP: true, step: "post_verify", domain, verified, expected: r.liveLink }, null, 2)
      );
      process.exit(2);
    }

    results.push({ domain, ok: true, link: verified.link, cname: NEW_CNAME });
    console.error(`OK ${domain}`);
  }

  const left = remaining.length - batch.length;
  saveState({ phase: "C-batch", stopped: false, lastBatch: results, remainingEstimate: left });
  console.log(JSON.stringify({ ok: true, migrated: results, remainingEstimate: Math.max(0, left) }, null, 2));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "A-plan") await cmdAPlan();
else if (cmd === "A-push") await cmdAPush();
else if (cmd === "A-verify") await cmdAVerify();
else if (cmd === "A-wait-deploy") {
  const st = loadState();
  const sha = st?.commit;
  if (!sha) throw new Error("No commit in state");
  const dep = await waitDeploy(sha);
  console.log(JSON.stringify({ ok: true, deployment: dep.id, url: dep.url }, null, 2));
} else if (cmd === "B-connect") await cmdBConnect();
else if (cmd === "C-batch") await cmdCBatch(Number(arg) || 10);
else if (cmd === "C-status") {
  const plan = JSON.parse(fs.readFileSync(path.join(DATA, `_migrate_${OLD_PROJECT}_plan.json`), "utf8"));
  let onOld = 0,
    onNew = 0,
    other = 0;
  for (const r of plan.rows.filter((x) => x.liveOk)) {
    const dns = await getApexCname(r.domain);
    if (dns.cname === OLD_CNAME) onOld++;
    else if (dns.cname === NEW_CNAME) onNew++;
    else other++;
    process.stderr.write(".");
  }
  process.stderr.write("\n");
  console.log(JSON.stringify({ onOld, onNew, other }, null, 2));
} else {
  console.log(`Usage: node scripts/batch-migrate-5uae-2.mjs <A-plan|A-push|A-verify|A-wait-deploy|B-connect|C-batch [n]|C-status>`);
  process.exit(1);
}
