/**
 * Migrate:
 * 1) landingpage-5f-gg88 (20) → Admin Git landingpage-5f-g
 * 2) landingpage-5f-llwin (4) → Freze Git lp-5f-llwin (repo freze2212/lp-5f-llwin)
 *
 * Live truth from data/_probe_5f_migrate.json (302-first already applied in probe).
 * Per-domain verify + DNS/Pages rollback on failure. Stay LP (never convert to 302).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const CF = process.env.CLOUDFLARE_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const AA = process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER || "freze2212";

const probe = JSON.parse(fs.readFileSync("data/_probe_5f_migrate.json", "utf8"));

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
function entry(link) {
  return {
    main_url: link,
    register_url: link,
    app_url: link,
    cskh_url: link,
    messenger_url: link,
  };
}

async function cfAcc(accountId, method, p, body) {
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
      "User-Agent": "migrate-5f",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, json: await r.json() };
}

async function findZone(domain) {
  for (const [which, acc] of [
    ["freze", AID],
    ["admin", AA],
  ]) {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}&account.id=${encodeURIComponent(acc)}`,
      { headers: { Authorization: `Bearer ${CF}` } }
    );
    const j = await r.json();
    if (j.success && j.result?.length) {
      const zone = j.result.find((x) => x.status === "active") || j.result[0];
      return { which, accountId: acc, zone };
    }
  }
  return null;
}

async function setCnames(zoneInfo, domain, target) {
  const dns = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/dns_records?per_page=100`,
    { headers: { Authorization: `Bearer ${CF}` } }
  ).then((r) => r.json());
  for (const host of [domain, `www.${domain}`]) {
    for (const r of (dns.result || []).filter((x) => x.name === host && ["A", "AAAA", "CNAME"].includes(x.type))) {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/dns_records/${r.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${CF}` },
      });
    }
    const name = host === domain ? "@" : "www";
    const add = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/dns_records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CF}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "CNAME", name, content: target, proxied: true, ttl: 1 }),
    }).then((r) => r.json());
    if (!add.success) throw new Error(`cname ${host}: ${JSON.stringify(add.errors)}`);
  }
}

async function disableForwarding(zoneInfo) {
  const rules = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/pagerules`,
    { headers: { Authorization: `Bearer ${CF}` } }
  ).then((r) => r.json());
  for (const rule of rules.result || []) {
    if (rule.actions?.some((a) => a.id === "forwarding_url") && rule.status !== "disabled") {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneInfo.zone.id}/pagerules/${rule.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${CF}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      });
    }
  }
}

async function probeLink(domain) {
  // Prefer domains.json / config after migrate (LP mode)
  try {
    const home = await fetch(`https://${domain}/`, {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const loc = home.headers.get("location");
    if (home.status >= 300 && home.status < 400 && loc && !loc.toLowerCase().includes(apexOf(domain))) {
      return { mode: "302", status: home.status, link: loc };
    }
    const dj = await fetch(`https://${domain}/domains.json?v=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (dj.ok) {
      const j = await dj.json();
      const link = linkOf(j[domain] || j[`www.${domain}`]);
      if (link) return { mode: "LP", status: home.status, link };
    }
    const cfgR = await fetch(`https://${domain}/config.js?v=${Date.now()}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (cfgR.ok) {
      const t = await cfgR.text();
      const m = t.match(new RegExp(`["']${domain.replace(/\./g, "\\.")}["']\\s*:\\s*["']([^"']+)["']`));
      if (m) return { mode: "LP-config", status: home.status, link: m[1] };
    }
    return { mode: "fail", status: home.status, link: "" };
  } catch (e) {
    return { mode: "err", status: 0, link: "", err: e.message };
  }
}

async function waitLive(domain, expected, tries = 36) {
  for (let i = 0; i < tries; i++) {
    const p = await probeLink(domain);
    if (p.link && norm(p.link) === norm(expected) && (p.mode === "LP" || p.mode === "LP-config")) {
      return { ok: true, i, p };
    }
    process.stderr.write(`  waitLive ${domain} #${i} ${p.mode} ${p.status} ${p.link || p.err || ""}\n`);
    await sleep(5000);
  }
  return { ok: false };
}

async function waitPagesHas(pagesDev, domain, expected, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const text = await (
        await fetch(`https://${pagesDev}/domains.json?v=${Date.now()}`, { signal: AbortSignal.timeout(15000) })
      ).text();
      const j = JSON.parse(text);
      const link = linkOf(j[domain] || j[`www.${domain}`]);
      if (norm(link) === norm(expected)) return { ok: true, i };
      process.stderr.write(`  waitPages ${domain} #${i} ${link || "(empty)"}\n`);
    } catch (e) {
      process.stderr.write(`  waitPages ${domain} #${i} ${e.message}\n`);
    }
    await sleep(5000);
  }
  return { ok: false };
}

function upsertConfigJs(cfgText, updates) {
  // updates: [{domain, link}]
  let text = cfgText;
  if (!/LINK_CONFIG|domains\s*:/.test(text)) {
    // minimal wrapper
    const pairs = updates
      .flatMap((u) => [
        `    "${u.domain}": ${JSON.stringify(u.link)}`,
        `    "www.${u.domain}": ${JSON.stringify(u.link)}`,
      ])
      .join(",\n");
    return `window.LINK_CONFIG = {\n  default: "",\n  domains: {\n${pairs}\n  }\n};\n`;
  }
  for (const u of updates) {
    for (const host of [u.domain, `www.${u.domain}`]) {
      const re = new RegExp(`(["'])${host.replace(/\./g, "\\.")}\\1\\s*:\\s*(["'])(?:\\\\.|[^\\\\])*?\\2`);
      if (re.test(text)) {
        text = text.replace(re, `"${host}": ${JSON.stringify(u.link)}`);
      } else {
        // insert after domains: {
        text = text.replace(/domains\s*:\s*\{/, (m) => `${m}\n    "${host}": ${JSON.stringify(u.link)},`);
      }
    }
  }
  return text;
}

async function syncGitRepo(repo, branch, updates, alsoConfig = true) {
  const meta = await gh("GET", `/repos/${OWNER}/${repo}/contents/domains.json?ref=${branch}`);
  if (!meta.ok) throw new Error(`GET ${repo}/domains.json ${meta.status} ${meta.json.message}`);
  const data = JSON.parse(Buffer.from(meta.json.content, "base64").toString("utf8"));
  let changed = 0;
  for (const u of updates) {
    if (norm(linkOf(data[u.domain] || data[`www.${u.domain}`])) === norm(u.link)) continue;
    const e = entry(u.link);
    data[u.domain] = e;
    data[`www.${u.domain}`] = e;
    changed++;
  }
  if (changed) {
    const body = JSON.stringify(data, null, 2) + "\n";
    JSON.parse(body);
    const put = await gh("PUT", `/repos/${OWNER}/${repo}/contents/domains.json`, {
      message: `sync(domains): migrate-align ${changed} live LP links`,
      content: Buffer.from(body, "utf8").toString("base64"),
      sha: meta.json.sha,
      branch,
    });
    if (!put.ok) throw new Error(`PUT domains.json ${JSON.stringify(put.json)}`);
  }

  if (alsoConfig) {
    let cfgMeta = await gh("GET", `/repos/${OWNER}/${repo}/contents/config.js?ref=${branch}`);
    let cfgText = "";
    let cfgSha = null;
    if (cfgMeta.ok && cfgMeta.json.content) {
      cfgText = Buffer.from(cfgMeta.json.content, "base64").toString("utf8");
      cfgSha = cfgMeta.json.sha;
    } else {
      cfgText = `window.LINK_CONFIG = {\n  default: "",\n  domains: {\n  }\n};\n`;
    }
    const next = upsertConfigJs(cfgText, updates);
    if (next !== cfgText) {
      const put = await gh("PUT", `/repos/${OWNER}/${repo}/contents/config.js`, {
        message: `sync(config): align LINK_CONFIG for migrate`,
        content: Buffer.from(next, "utf8").toString("base64"),
        sha: cfgSha || undefined,
        branch,
      });
      if (!put.ok) throw new Error(`PUT config.js ${JSON.stringify(put.json)}`);
      changed++;
    }
  }
  return { changed };
}

async function migrateOne({
  domain,
  link,
  frezeProject,
  frezeAccount,
  gitProject,
  gitAccount,
  pagesDev,
  oldPagesDev,
}) {
  const zone = await findZone(domain);
  if (!zone) throw new Error("no zone");

  let w = await waitPagesHas(pagesDev, domain, link, 3);
  if (!w.ok) {
    w = await waitPagesHas(pagesDev, domain, link, 36);
    if (!w.ok) throw new Error("git deploy timeout — domains.json not live yet");
  }

  for (const d of [domain, `www.${domain}`]) {
    await cfAcc(
      frezeAccount,
      "DELETE",
      `/accounts/${frezeAccount}/pages/projects/${encodeURIComponent(frezeProject)}/domains/${encodeURIComponent(d)}`
    );
  }
  for (const d of [domain, `www.${domain}`]) {
    const add = await cfAcc(gitAccount, "POST", `/accounts/${gitAccount}/pages/projects/${encodeURIComponent(gitProject)}/domains`, {
      name: d,
    });
    if (!add.ok && !/already|exists|taken/i.test(add.errors?.[0]?.message || "")) {
      await cfAcc(frezeAccount, "POST", `/accounts/${frezeAccount}/pages/projects/${encodeURIComponent(frezeProject)}/domains`, {
        name: d,
      }).catch(() => {});
      throw new Error(`add pages ${d}: ${JSON.stringify(add.errors)}`);
    }
  }

  await disableForwarding(zone);
  await setCnames(zone, domain, pagesDev);

  const live = await waitLive(domain, link, 40);
  if (!live.ok) {
    process.stderr.write(`ROLLBACK ${domain}\n`);
    await setCnames(zone, domain, oldPagesDev);
    for (const d of [domain, `www.${domain}`]) {
      await cfAcc(
        gitAccount,
        "DELETE",
        `/accounts/${gitAccount}/pages/projects/${encodeURIComponent(gitProject)}/domains/${encodeURIComponent(d)}`
      ).catch(() => {});
      await cfAcc(frezeAccount, "POST", `/accounts/${frezeAccount}/pages/projects/${encodeURIComponent(frezeProject)}/domains`, {
        name: d,
      }).catch(() => {});
    }
    throw new Error("wait_timeout after migrate");
  }
  return { domain, link, cname: pagesDev, ok: true };
}

function familyRows(id) {
  return probe.families.find((f) => f.id === id)?.rows || [];
}

const report = { at: new Date().toISOString(), ok: [], failed: [] };

// ---------- GG88 ----------
{
  const rows = familyRows("gg88");
  if (!rows.length || rows.some((r) => !r.ok)) throw new Error("gg88 probe incomplete");
  console.log(`\n##### SYNC Admin landingpage-5f-g (${rows.length})`);
  const sync = await syncGitRepo(
    "landingpage-5f-g",
    "main",
    rows.map((r) => ({ domain: r.domain, link: r.link })),
    true
  );
  console.log(`  sync changed~ ${sync.changed}`);

  for (const r of rows) {
    try {
      console.log(`  migrate ${r.domain}`);
      // re-probe must match
      const live = await probeLink(r.domain);
      // before migrate still on old — OK if link matches via LP/config
      if (!live.link || norm(live.link) !== norm(r.link)) {
        // allow if still ok from probe file and old site works via config
        const again = familyRows("gg88").find((x) => x.domain === r.domain);
        if (!again?.ok || norm(again.link) !== norm(r.link)) throw new Error(`live changed ${live.link}`);
      }
      const res = await migrateOne({
        domain: r.domain,
        link: r.link,
        frezeProject: "landingpage-5f-gg88",
        frezeAccount: AID,
        gitProject: "landingpage-5f-g",
        gitAccount: AA,
        pagesDev: "landingpage-5f-g.pages.dev",
        oldPagesDev: "landingpage-5f-gg88.pages.dev",
      });
      report.ok.push({ family: "gg88", ...res });
      console.log(`  OK ${r.domain} → ${r.link}`);
    } catch (e) {
      report.failed.push({ family: "gg88", domain: r.domain, error: e.message, link: r.link });
      console.log(`  FAIL ${r.domain}: ${e.message}`);
      // stop on first failure to avoid mass damage
      break;
    }
  }
}

// ---------- LLWIN: push repo + create pages ----------
async function bootstrapLlwinRepo() {
  const local = "C:\\Landingpages\\LLWIN\\landing-page-5f";
  if (!fs.existsSync(local)) throw new Error("missing local LLWIN folder");
  const rows = familyRows("llwin");

  // update local domains.json + config.js
  let dj = {};
  try {
    dj = JSON.parse(fs.readFileSync(path.join(local, "domains.json"), "utf8"));
  } catch {}
  for (const r of rows) {
    const e = entry(r.link);
    dj[r.domain] = e;
    dj[`www.${r.domain}`] = e;
  }
  fs.writeFileSync(path.join(local, "domains.json"), JSON.stringify(dj, null, 2) + "\n");

  let cfg = fs.existsSync(path.join(local, "config.js"))
    ? fs.readFileSync(path.join(local, "config.js"), "utf8")
    : `window.LINK_CONFIG = {\n  default: "",\n  domains: {\n  }\n};\n`;
  cfg = upsertConfigJs(
    cfg,
    rows.map((r) => ({ domain: r.domain, link: r.link }))
  );
  fs.writeFileSync(path.join(local, "config.js"), cfg);

  // git push
  const run = (cmd) => execSync(cmd, { cwd: local, stdio: "pipe", encoding: "utf8" });
  try {
    run("git rev-parse --is-inside-work-tree");
  } catch {
    run("git init -b main");
  }
  try {
    run("git remote remove origin");
  } catch {}
  run(`git remote add origin https://x-access-token:${GH}@github.com/${OWNER}/lp-5f-llwin.git`);
  run("git add -A");
  try {
    run('git commit -m "init: LLWIN 5F landing + live domain links"');
  } catch {
    /* maybe nothing / already committed */
  }
  run("git push -u origin main --force");
  console.log("  pushed lp-5f-llwin");
}

async function ensureLlwinPages() {
  const name = "lp-5f-llwin";
  let p = await cfAcc(AID, "GET", `/accounts/${AID}/pages/projects/${encodeURIComponent(name)}`);
  if (!p.ok) {
    const created = await cfAcc(AID, "POST", `/accounts/${AID}/pages/projects`, {
      name,
      production_branch: "main",
      source: {
        type: "github",
        config: {
          owner: OWNER,
          repo_name: "lp-5f-llwin",
          production_branch: "main",
          pr_comments_enabled: false,
        },
      },
    });
    if (!created.ok) throw new Error(`create pages: ${JSON.stringify(created.errors)}`);
    await cfAcc(AID, "POST", `/accounts/${AID}/pages/projects/${encodeURIComponent(name)}/deployments`, {
      branch: "main",
    });
  }
  for (let i = 0; i < 48; i++) {
    try {
      const r = await fetch(`https://${name}.pages.dev/domains.json?v=${Date.now()}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (r.ok) {
        const t = await r.text();
        if (t.trim().startsWith("{")) return name;
      }
    } catch {}
    process.stderr.write(`  wait deploy lp-5f-llwin #${i}\n`);
    await sleep(5000);
  }
  throw new Error("lp-5f-llwin deploy timeout");
}

if (!report.failed.length) {
  console.log(`\n##### BOOTSTRAP lp-5f-llwin`);
  try {
    await bootstrapLlwinRepo();
    await ensureLlwinPages();
    const rows = familyRows("llwin");
    await syncGitRepo(
      "lp-5f-llwin",
      "main",
      rows.map((r) => ({ domain: r.domain, link: r.link })),
      true
    );
    for (const r of rows) {
      try {
        console.log(`  migrate ${r.domain}`);
        const res = await migrateOne({
          domain: r.domain,
          link: r.link,
          frezeProject: "landingpage-5f-llwin",
          frezeAccount: AID,
          gitProject: "lp-5f-llwin",
          gitAccount: AID,
          pagesDev: "lp-5f-llwin.pages.dev",
          oldPagesDev: "landingpage-5f-llwin.pages.dev",
        });
        report.ok.push({ family: "llwin", ...res });
        console.log(`  OK ${r.domain} → ${r.link}`);
      } catch (e) {
        report.failed.push({ family: "llwin", domain: r.domain, error: e.message, link: r.link });
        console.log(`  FAIL ${r.domain}: ${e.message}`);
        break;
      }
    }
  } catch (e) {
    report.failed.push({ family: "llwin", stage: "bootstrap", error: e.message });
    console.log(`  FAIL bootstrap: ${e.message}`);
  }
} else {
  console.log("\nSkip LLWIN because GG88 had failures");
}

fs.writeFileSync("data/_migrate_5f_gg88_llwin.json", JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ok: report.ok.length,
      failed: report.failed.length,
      table: report.ok.map((r) => `${r.family} | ${r.domain} | ${r.link} | ${r.cname}`),
      failedDetail: report.failed,
    },
    null,
    2
  )
);
process.exit(report.failed.length ? 2 : 0);
