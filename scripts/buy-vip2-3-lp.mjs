/**
 * Buy 3 GG88 domains → mẫu lp_gg88_vip_2 (uae-vip-2).
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
const REPO = "lp-gg88-vip";
const BRANCH = "main";
const PROJECT = "lp-gg88-vip-2";
const CNAME = "lp-gg88-vip-2.pages.dev";
const TPL_ID = "lp_gg88_vip_2";

const JOBS = [
  { domain: "ggnew.uk", link: "https://gg8859.com/?id=960767615" },
  { domain: "congtongg8.com", link: "https://www.gg8846.com/?id=909954333" },
  { domain: "g88tong.xyz", link: "https://www.gg8853.com/?id=482086186" },
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
    register_url: link,
    app_url: link,
    cskh_url: link,
    messenger_url: link,
  };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
      "User-Agent": "buy-vip2-3",
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
    message: `feat(domains): add ${domains.map((d) => d.domain).join(", ")} (vip-2)`,
    content,
    sha: meta.json.sha,
    branch: BRANCH,
  });
  if (!put.ok) throw new Error(`PUT ${put.status} ${JSON.stringify(put.json)}`);
  return put.json.commit?.sha;
}

async function forceAddPages(domain) {
  // Prefer exact vip-2; remove from freze pages first then add vip-2
  await cf(
    "DELETE",
    `/accounts/${AID}/pages/projects/${encodeURIComponent(PROJECT)}/domains/${encodeURIComponent(domain)}`
  ).catch(() => {});
  const add = await cf("POST", `/accounts/${AID}/pages/projects/${encodeURIComponent(PROJECT)}/domains`, {
    name: domain,
  });
  const addWww = await cf("POST", `/accounts/${AID}/pages/projects/${encodeURIComponent(PROJECT)}/domains`, {
    name: `www.${domain}`,
  });
  return { add, addWww };
}

async function waitLive(domain, expected, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const home = await fetch(`https://${domain}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache" },
      });
      // ignore same-site www hop for truth
      if (home.status >= 300 && home.status < 400) {
        const loc = home.headers.get("location") || "";
        try {
          const h = new URL(loc, `https://${domain}/`).hostname.replace(/^www\./, "");
          if (h !== domain.replace(/^www\./, "")) {
            process.stderr.write(`  wait ${domain} #${i} offsite 302 ${loc}\n`);
          }
        } catch {}
      }
      const r = await fetch(`https://${domain}/domains.json?v=${Date.now()}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache" },
      });
      if (r.ok) {
        const j = await r.json();
        const link = linkOf(j[domain] || j[`www.${domain}`]);
        if (norm(link) === norm(expected) && (home.status === 200 || home.status === 301 || home.status === 302)) {
          // accept 200 LP; if 301 to www still ok if dj matches via follow
          if (home.status === 200 || norm(link) === norm(expected)) {
            return { ok: true, i, link, home: home.status };
          }
        }
        process.stderr.write(`  wait ${domain} #${i} home=${home.status} link=${link}\n`);
      } else {
        process.stderr.write(`  wait ${domain} #${i} dj=${r.status} home=${home.status}\n`);
      }
    } catch (e) {
      process.stderr.write(`  wait ${domain} #${i} ${e.message}\n`);
    }
    await sleep(10000);
  }
  return { ok: false };
}

async function waitPagesDj(expectedDomain, expectedLink, tries = 36) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`https://${CNAME}/domains.json?v=${Date.now()}`, {
        signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache" },
      });
      if (r.ok) {
        const j = await r.json();
        const link = linkOf(j[expectedDomain] || j[`www.${expectedDomain}`]);
        if (norm(link) === norm(expectedLink)) return { ok: true, i };
        process.stderr.write(`  waitPages #${i} got ${link}\n`);
      } else process.stderr.write(`  waitPages #${i} ${r.status}\n`);
    } catch (e) {
      process.stderr.write(`  waitPages #${i} ${e.message}\n`);
    }
    await sleep(5000);
  }
  return { ok: false };
}

const template = getTemplate(TPL_ID);
console.error("template", template?.id, template?.path, "exists", template?.path && fs.existsSync(template.path));

const report = { at: new Date().toISOString(), project: PROJECT, jobs: [] };

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
        throw new Error(`not available: ${avail.result}`);
      }
    }

    const zone = await getOrCreateZone(domain);
    const ns = getZoneNameservers(zone);
    if (ns?.length) await updateNameservers(domain, ns).catch((e) => row.steps.push({ nsWarn: e.message }));
    await deleteForwardingPageRules(zone.id).catch(() => {});
    row.steps.push({ zone: zone.status, ns });

    // Prefer exact vip-2 via helper (may pick sibling) then force vip-2
    let pages;
    try {
      pages = await addPagesDomain(domain, PROJECT, template.path);
    } catch (e) {
      row.steps.push({ addPagesWarn: e.message });
    }
    const forced = await forceAddPages(domain);
    row.steps.push({ pages, forced });

    await ensurePagesCname(domain, CNAME);
    row.steps.push({ cname: CNAME });

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
      templateName: template?.name || "vip-2",
      templateId: TPL_ID,
      cnameTarget: CNAME,
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

const okJobs = report.jobs.filter((j) => j.ok);
try {
  const commit = await syncGithub(okJobs.map((j) => ({ domain: j.domain, link: j.link })));
  report.githubCommit = commit;
  console.error("github", commit);
} catch (e) {
  report.githubError = e.message;
}

if (okJobs[0]) {
  report.pagesDeploy = await waitPagesDj(okJobs[0].domain, okJobs[0].link);
}

report.verify = [];
for (const j of okJobs) {
  const v = await waitLive(j.domain, j.link);
  report.verify.push({ domain: j.domain, expected: j.link, ...v });
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/_buy_vip2_3_DONE.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.jobs.some((j) => !j.ok) || report.verify.some((v) => !v.ok)) process.exitCode = 2;
