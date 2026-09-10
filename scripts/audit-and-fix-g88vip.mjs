/**
 * 1) Fix g88vip.vip → LP + link from latest 302 (NOT pure 302)
 * 2) Audit all migrate/buy domains: flag disabled-302≠LP (g88vip pattern)
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

const {
  getOrCreateZone,
  deleteForwardingPageRules,
  addPagesDomain,
  ensurePagesCname,
  disableForwardingPageRules,
} = await import("../src/cloudflare.js");
const { getTemplate, updateTemplateDomainsJson } = await import("../src/templates.js");
const { addHistoryItem } = await import("../src/history.js");
const { normalizeDomain, normalizeUrl } = await import("../src/utils.js");

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
    return s.toLowerCase();
  } catch {
    return String(u || "")
      .trim()
      .replace(/\/$/, "")
      .toLowerCase();
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
  return hostOf(loc) && hostOf(loc) === apexOf(domain);
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
  return { ok: !!j.success, result: j.result, errors: j.errors || [] };
}

async function findZone(domain) {
  for (const [which, token, acc] of [
    ["freze", CF, AID],
    ["admin", CF, AA],
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

async function probeLive(domain) {
  const out = {
    domain,
    mode: "unknown",
    liveLink: "",
    homeStatus: 0,
    location: "",
    djLink: "",
    ok: false,
  };
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
        out.location = loc;
        if (sameSite(domain, loc)) {
          hop = new URL(loc).hostname;
          continue;
        }
        out.mode = "302";
        out.liveLink = loc;
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
      if (r.ok) {
        const j = await r.json();
        const link = linkOf(j[domain] || j[`www.${apexOf(domain)}`] || j[apexOf(domain)]);
        out.djLink = link;
        out.mode = "LP";
        out.liveLink = link;
        out.ok = !!norm(link);
        return out;
      }
    } catch (e) {
      out.djError = e.message;
    }
  }
  return out;
}

async function pageRuleInfo(zoneInfo) {
  const rules = await cf(zoneInfo.token, "GET", `/zones/${zoneInfo.zone.id}/pagerules`);
  const fwd = (rules.result || []).filter((r) => r.actions?.some((a) => a.id === "forwarding_url"));
  return fwd.map((r) => {
    const a = r.actions.find((x) => x.id === "forwarding_url");
    return {
      status: r.status,
      url: a?.value?.url || "",
      code: a?.value?.status_code || 302,
    };
  });
}

async function dnsCname(zoneInfo, domain) {
  const dns = await cf(zoneInfo.token, "GET", `/zones/${zoneInfo.zone.id}/dns_records?per_page=100`);
  const recs = (dns.result || []).filter((r) => r.name === domain || r.name === `www.${domain}`);
  return recs.map((r) => `${r.type}:${r.content}`).join("|");
}

function collectDomains() {
  const set = new Set(["g88vip.vip"]);
  const add = (d) => {
    if (!d) return;
    set.add(String(d).toLowerCase().replace(/^www\./, ""));
  };
  for (const f of fs.readdirSync("data")) {
    if (!/\.json$/i.test(f)) continue;
    if (!/(migrate|mig_|buy_|link_tables)/i.test(f)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join("data", f), "utf8"));
      const walk = (o) => {
        if (!o) return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (typeof o === "object") {
          if (o.domain) add(o.domain);
          Object.values(o).forEach(walk);
        }
      };
      walk(j);
    } catch {}
  }
  return [...set].sort();
}

async function ghUpsert(repo, branch, domain, link) {
  const metaR = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/domains.json?ref=${branch}`, {
    headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "audit" },
  });
  const meta = await metaR.json();
  if (!metaR.ok) throw new Error(`GET ${repo} ${meta.message}`);
  const data = JSON.parse(Buffer.from(meta.content, "base64").toString("utf8"));
  const entry = {
    main_url: link,
    register_url: link,
    app_url: link,
    cskh_url: link,
    messenger_url: link,
    telegram_url: link,
  };
  data[domain] = entry;
  data[`www.${domain}`] = entry;
  const put = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/domains.json`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GH}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "audit",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `fix(domains): ${domain} use latest 302 link on LP`,
      content: Buffer.from(JSON.stringify(data, null, 2) + "\n").toString("base64"),
      sha: meta.sha,
      branch,
    }),
  });
  const pj = await put.json();
  if (!put.ok) throw new Error(JSON.stringify(pj));
  return pj.commit?.sha;
}

// ── Fix g88vip.vip ──
async function fixG88vip() {
  const domain = "g88vip.vip";
  const link = normalizeUrl("https://www.gg8846.com/?id=446417516");
  const project = "gg88-lp-5uae-5"; // Freze Git sibling (same mẫu 5uae)
  const cname = "gg88-lp-5uae-5.pages.dev";
  const tpl = getTemplate("gg88_lp_5uae");

  console.error("FIX g88vip.vip → LP", project, link);

  const zone = await getOrCreateZone(domain);
  await deleteForwardingPageRules(zone.id).catch(() => {});
  await disableForwardingPageRules(zone.id).catch(() => {});

  // remove any leftover pages then add
  const pages = await addPagesDomain(domain, project, tpl?.path || "");
  const target = pages?.canonicalSubdomain || cname;
  await ensurePagesCname(domain, target);

  try {
    if (tpl) await updateTemplateDomainsJson(tpl, domain, link, "");
  } catch (e) {
    console.error("local tpl warn", e.message);
  }
  const commit = await ghUpsert("gg88-lp-5uae", "main", domain, link);

  addHistoryItem({
    domain,
    actionType: "POINT_LP",
    actionLabel: "Trỏ Miền Có Sẵn ➔ LP (restore link từ 302)",
    templateId: "gg88_lp_5uae",
    templateName: tpl?.name,
    cnameTarget: target,
    link,
    isBuy: false,
    status: "success",
  });

  let verify = null;
  for (let i = 0; i < 24; i++) {
    const p = await probeLive(domain);
    if (p.mode === "LP" && norm(p.liveLink) === norm(link)) {
      verify = { ok: true, i, ...p };
      break;
    }
    console.error("wait fix", i, p.mode, p.homeStatus, p.liveLink);
    await sleep(5000);
  }
  return { domain, link, project: target, commit, verify };
}

const cmd = process.argv[2] || "all";

if (cmd === "fix" || cmd === "all") {
  const fix = await fixG88vip();
  console.log(JSON.stringify({ fix }, null, 2));
  fs.writeFileSync("data/_fix_g88vip_lp.json", JSON.stringify(fix, null, 2));
}

if (cmd === "audit" || cmd === "all") {
  const domains = collectDomains();
  console.error("Auditing", domains.length, "domains...");
  const rows = [];
  const suspicious = [];

  // concurrency 8
  let idx = 0;
  async function worker() {
    while (idx < domains.length) {
      const i = idx++;
      const domain = domains[i];
      const row = { domain };
      try {
        const live = await probeLive(domain);
        row.mode = live.mode;
        row.liveLink = live.liveLink;
        row.homeStatus = live.homeStatus;
        row.ok = live.ok;

        const zone = await findZone(domain);
        row.zoneAcc = zone?.which || null;
        if (zone) {
          row.dns = await dnsCname(zone, domain);
          row.pageRules = await pageRuleInfo(zone);
          const active302 = row.pageRules.find((r) => r.status === "active");
          const disabled302 = row.pageRules.filter((r) => r.status === "disabled" && r.url);
          row.active302 = active302?.url || "";
          // g88vip pattern: disabled 302 URL differs from current live LP link
          const mismatchedDisabled = disabled302.filter(
            (r) => norm(r.url) && live.mode === "LP" && norm(r.url) !== norm(live.liveLink) && !sameSite(domain, r.url)
          );
          if (mismatchedDisabled.length) {
            row.flag = "disabled_302_newer_than_LP";
            row.disabled302Links = mismatchedDisabled.map((r) => r.url);
            row.suggestedFix = mismatchedDisabled[mismatchedDisabled.length - 1].url; // latest-ish
            suspicious.push(row);
          }
          // also: live is 302 but domains.json different (if we can read dj)
          if (live.mode === "302" && live.djLink && norm(live.djLink) !== norm(live.liveLink)) {
            row.flag = row.flag || "live_302_differs_from_dj";
            row.djLink = live.djLink;
          }
          // live LP but active 302 also present (conflict)
          if (live.mode === "LP" && active302 && !sameSite(domain, active302.url)) {
            // shouldn't happen if 302 active - probe would see 302. unless rule not matching
            row.note = "active_302_rule_but_live_LP";
          }
        } else {
          row.flag = live.ok ? null : "no_zone";
        }
      } catch (e) {
        row.error = e.message;
        row.flag = "error";
      }
      rows.push(row);
      process.stderr.write(
        `${domain} ${row.mode || "?"} ${row.flag || "ok"} ${row.flag === "disabled_302_newer_than_LP" ? "<<" + row.suggestedFix : ""}\n`
      );
    }
  }
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  rows.sort((a, b) => a.domain.localeCompare(b.domain));

  const report = {
    at: new Date().toISOString(),
    total: rows.length,
    suspiciousCount: suspicious.length,
    flags: {
      disabled_302_newer_than_LP: rows.filter((r) => r.flag === "disabled_302_newer_than_LP").length,
      live_fail: rows.filter((r) => !r.ok).length,
      mode_302: rows.filter((r) => r.mode === "302").length,
      mode_LP: rows.filter((r) => r.mode === "LP").length,
    },
    suspicious: suspicious.map((r) => ({
      domain: r.domain,
      lpLink: r.liveLink,
      disabled302: r.disabled302Links,
      suggested: r.suggestedFix,
    })),
    rows: rows.map((r) => ({
      domain: r.domain,
      mode: r.mode,
      liveLink: r.liveLink,
      dns: r.dns,
      active302: r.active302 || "",
      disabled302: (r.pageRules || []).filter((x) => x.status === "disabled").map((x) => x.url),
      flag: r.flag || "",
      zoneAcc: r.zoneAcc,
    })),
  };
  fs.writeFileSync("data/_audit_migrate_302_vs_lp.json", JSON.stringify(report, null, 2));
  // also csv-like summary
  const lines = ["domain|mode|liveLink|active302|disabled302|flag"];
  for (const r of report.rows) {
    lines.push(
      [r.domain, r.mode, r.liveLink, r.active302, (r.disabled302 || []).join(";"), r.flag].join("|")
    );
  }
  fs.writeFileSync("data/_audit_migrate_302_vs_lp.txt", lines.join("\n"));
  console.log(
    JSON.stringify(
      {
        file: "data/_audit_migrate_302_vs_lp.json",
        total: report.total,
        flags: report.flags,
        suspicious: report.suspicious,
      },
      null,
      2
    )
  );
}
