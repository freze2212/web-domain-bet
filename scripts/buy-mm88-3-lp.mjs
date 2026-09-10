/**
 * Buy 3 MM88 domains + attach same LP as mm88.online (lp-mm88-5uae).
 * Live truth for links = user-provided affiliate URLs.
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

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
// allow one-shot wrangler so DIRECT project gets domains.json
process.env.ALLOW_WRANGLER_DEPLOY = "true";

const {
  checkDomainAvailability,
  registerDomain,
  resolveContactId,
  updateNameservers,
  getDomainInfo,
} = await import("../src/spaceship.js");
const {
  getOrCreateZone,
  getZoneNameservers,
  deleteForwardingPageRules,
  addPagesDomain,
  ensurePagesCname,
} = await import("../src/cloudflare.js");
const { getTemplate, updateTemplateDomainsJson } = await import("../src/templates.js");
const { addHistoryItem } = await import("../src/history.js");
const { normalizeDomain, normalizeUrl } = await import("../src/utils.js");

const CF = process.env.CLOUDFLARE_API_TOKEN;
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const GH = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER || "freze2212";
const REPO = "lp-mm88-5uae";
const BRANCH = "main";
const PROJECT = "lp-mm88-5uae";
const CNAME = "lp-mm88-5uae.pages.dev";
const TPL_ID = "mm88_lp_5uae";

const JOBS = [
  { domain: "mm880.top", link: "https://mm88d10d04qc.mm88.email/register.html" },
  { domain: "mm88c.co", link: "https://ddchx.mm2311.com/register.html" },
  { domain: "m88tong.vip", link: "https://www.mm6022.com/" },
];

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
function entry(link) {
  return {
    main_url: link,
    messenger_url: link,
    telegram_url: link,
    updated_at: new Date().toISOString(),
  };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gh(method, p, body) {
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "buy-mm88-3",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

async function syncGithub(domains) {
  const meta = await gh("GET", `/repos/${OWNER}/${REPO}/contents/domains.json?ref=${BRANCH}`);
  if (!meta.ok) throw new Error(`GET domains.json ${meta.status} ${meta.json.message}`);
  const data = JSON.parse(Buffer.from(meta.json.content, "base64").toString("utf8"));
  for (const { domain, link } of domains) {
    const e = entry(link);
    data[domain] = e;
    data[`www.${domain}`] = e;
  }
  const content = Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64");
  const put = await gh("PUT", `/repos/${OWNER}/${REPO}/contents/domains.json`, {
    message: `feat(domains): add ${domains.map((d) => d.domain).join(", ")}`,
    content,
    sha: meta.json.sha,
    branch: BRANCH,
  });
  if (!put.ok) throw new Error(`PUT domains.json ${put.status} ${JSON.stringify(put.json)}`);
  return put.json.commit?.sha;
}

async function wranglerDeploy(templatePath) {
  return new Promise((resolve) => {
    const args = [
      "wrangler",
      "pages",
      "deploy",
      templatePath,
      `--project-name=${PROJECT}`,
      "--commit-dirty=true",
    ];
    console.error("wrangler", args.join(" "));
    const p = spawn("npx", args, {
      cwd: templatePath,
      shell: true,
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: CF,
        CLOUDFLARE_ACCOUNT_ID: AID,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => {
      out += d;
      process.stderr.write(d);
    });
    p.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(d);
    });
    p.on("exit", (code) => resolve({ code, out }));
  });
}

async function waitLive(domain, expected, tries = 36) {
  for (let i = 0; i < tries; i++) {
    try {
      const home = await fetch(`https://${domain}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
        headers: { "Cache-Control": "no-cache" },
      });
      const r = await fetch(`https://${domain}/domains.json?v=${Date.now()}`, {
        signal: AbortSignal.timeout(12000),
        headers: { "Cache-Control": "no-cache" },
      });
      if (r.ok) {
        const j = await r.json();
        const link = linkOf(j[domain] || j[`www.${domain}`]);
        if (home.status === 200 && norm(link) === norm(expected)) {
          return { ok: true, i, link, home: home.status };
        }
        process.stderr.write(`  wait ${domain} #${i} home=${home.status} link=${link}\n`);
      } else {
        process.stderr.write(`  wait ${domain} #${i} dj=${r.status} home=${home.status}\n`);
      }
    } catch (e) {
      process.stderr.write(`  wait ${domain} #${i} ${e.message}\n`);
    }
    await sleep(8000);
  }
  return { ok: false };
}

const template = getTemplate(TPL_ID);
if (!template) throw new Error("template mm88_lp_5uae missing");
console.error("template path", template.path, "exists", fs.existsSync(template.path));

const report = { at: new Date().toISOString(), jobs: [] };

// 1) availability + buy
for (const job of JOBS) {
  const domain = normalizeDomain(job.domain);
  const link = normalizeUrl(job.link);
  const row = { domain, link, steps: [] };
  try {
    const avail = await checkDomainAvailability(domain);
    row.steps.push({ avail: avail.result });
    if (avail.result === "available") {
      const contactId = await resolveContactId();
      await registerDomain(domain, contactId);
      row.steps.push({ bought: true });
    } else {
      try {
        await getDomainInfo(domain);
        row.steps.push({ bought: false, owned: true });
      } catch {
        throw new Error(`Domain not available: ${avail.result}`);
      }
    }

    const zone = await getOrCreateZone(domain);
    const ns = getZoneNameservers(zone);
    if (ns?.length) {
      await updateNameservers(domain, ns).catch((e) => row.steps.push({ nsWarn: e.message }));
    }
    await deleteForwardingPageRules(zone.id).catch(() => {});
    row.steps.push({ zone: zone.status, ns });

    const pages = await addPagesDomain(domain, PROJECT, template.path);
    const target = pages?.canonicalSubdomain || CNAME;
    await ensurePagesCname(domain, target);
    row.steps.push({ pages, cname: target });

    // local domains.json + optional git/wrangler via template helper
    try {
      await updateTemplateDomainsJson(template, domain, link, "");
      row.steps.push({ localTpl: true });
    } catch (e) {
      row.steps.push({ localTplError: e.message });
    }

    addHistoryItem({
      domain,
      actionType: "BUY_LP",
      actionLabel: "Mua & Gán Landing Page",
      templateName: template.name,
      templateId: template.id,
      cnameTarget: target,
      link,
      isBuy: true,
      status: "success",
    });

    row.ok = true;
  } catch (e) {
    row.ok = false;
    row.error = e.message;
    addHistoryItem({
      domain,
      actionType: "BUY_LP",
      actionLabel: "Mua & Gán Landing Page",
      link,
      isBuy: true,
      status: "failed",
      error: e.message,
    });
  }
  report.jobs.push(row);
  console.error(JSON.stringify(row, null, 2));
}

// 2) force GitHub sync for all successful
const okJobs = report.jobs.filter((j) => j.ok);
try {
  const commit = await syncGithub(okJobs.map((j) => ({ domain: j.domain, link: j.link })));
  report.githubCommit = commit;
  console.error("github commit", commit);
} catch (e) {
  report.githubError = e.message;
  console.error("github sync fail", e.message);
}

// 3) wrangler deploy DIRECT so mm88.online project serves new domains.json
if (fs.existsSync(template.path)) {
  // also ensure local file has all 3
  const djPath = path.join(template.path, "domains.json");
  let dj = {};
  try {
    dj = JSON.parse(fs.readFileSync(djPath, "utf8"));
  } catch {}
  for (const j of okJobs) {
    const e = entry(j.link);
    dj[j.domain] = e;
    dj[`www.${j.domain}`] = e;
  }
  fs.writeFileSync(djPath, JSON.stringify(dj, null, 2) + "\n");
  const w = await wranglerDeploy(template.path);
  report.wrangler = { code: w.code };
}

// 4) wait live
report.verify = [];
for (const j of okJobs) {
  const v = await waitLive(j.domain, j.link);
  report.verify.push({ domain: j.domain, link: j.link, ...v });
}

fs.writeFileSync("data/_buy_mm88_3_DONE.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.verify.some((v) => !v.ok) || report.jobs.some((j) => !j.ok)) process.exitCode = 2;
