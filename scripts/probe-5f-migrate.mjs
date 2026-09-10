/**
 * Probe live links for 5f-gg88 + 5f-llwin (302 Location first, else domains.json/config.js).
 * Write data/_probe_5f_migrate.json — no DNS changes.
 */
import fs from "fs";

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

function linkOf(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || e.register_url || "";
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

function parseConfigDomains(jsText) {
  const m = jsText.match(/domains\s*:\s*\{/);
  if (!m) return {};
  let i = m.index + m[0].length - 1;
  let depth = 0;
  let end = -1;
  for (; i < jsText.length; i++) {
    if (jsText[i] === "{") depth++;
    else if (jsText[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return {};
  const objText = jsText.slice(m.index + m[0].length - 1, end + 1);
  const map = {};
  const re = /["']([^"']+)["']\s*:\s*["']([^"']*)["']/g;
  let mm;
  while ((mm = re.exec(objText))) map[mm[1]] = mm[2];
  return map;
}

async function getApex(project) {
  const j = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${AID}/pages/projects/${encodeURIComponent(project)}`,
    { headers: { Authorization: `Bearer ${CF}` } }
  ).then((r) => r.json());
  if (!j.success) throw new Error(JSON.stringify(j.errors));
  return (j.result.domains || [])
    .filter((d) => !String(d).endsWith(".pages.dev") && !String(d).startsWith("www."))
    .map((d) => String(d).toLowerCase())
    .sort();
}

async function probeLive(domain) {
  const out = { domain, mode: "unknown", link: "", ok: false, homeStatus: 0, sources: {} };
  let hop = domain;
  try {
    for (let i = 0; i < 5; i++) {
      const home = await fetch(`https://${hop}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
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
        out.ok = !!loc;
        out.sources["302"] = loc;
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
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const link = linkOf(j[domain] || j[`www.${apexOf(domain)}`] || j[apexOf(domain)] || j._default || j.defaultLink);
      out.sources.domainsJson = link || "(empty)";
      if (link) {
        out.mode = "LP";
        out.link = link;
        out.ok = true;
      }
    } catch (e) {
      out.sources.djErr = e.message;
    }
    try {
      const r = await fetch(`https://${host}/config.js?v=${Date.now()}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) continue;
      const cfg = parseConfigDomains(await r.text());
      const link =
        cfg[domain] || cfg[`www.${apexOf(domain)}`] || cfg[apexOf(domain)] || cfg.default || "";
      out.sources.configJs = link || "(empty)";
      if (!out.ok && link) {
        out.mode = "LP-config";
        out.link = link;
        out.ok = true;
      }
    } catch (e) {
      out.sources.cfgErr = e.message;
    }
    if (out.ok) return out;
  }
  return out;
}

const families = [
  { id: "gg88", project: "landingpage-5f-gg88", brand: "GG88", target: "landingpage-5f-g" },
  { id: "llwin", project: "landingpage-5f-llwin", brand: "LLWIN", target: "lp-5f-llwin" },
];

const report = { at: new Date().toISOString(), families: [] };

for (const fam of families) {
  const apex = await getApex(fam.project);
  console.log(`\n##### ${fam.id} ${fam.project} apex=${apex.length}`);
  const rows = [];
  for (const d of apex) {
    const p = await probeLive(d);
    rows.push(p);
    console.log(`  ${p.ok ? "OK" : "FAIL"} ${d} [${p.mode}] ${p.link || p.homeError || p.homeStatus}`);
  }
  report.families.push({ ...fam, apexCount: apex.length, rows });
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/_probe_5f_migrate.json", JSON.stringify(report, null, 2));
const bad = report.families.flatMap((f) => f.rows.filter((r) => !r.ok));
console.log(
  JSON.stringify(
    {
      ok: report.families.flatMap((f) => f.rows).filter((r) => r.ok).length,
      fail: bad.length,
      failDomains: bad.map((b) => b.domain),
      table: report.families.flatMap((f) =>
        f.rows.map((r) => `${f.id} | ${r.domain} | ${r.mode} | ${r.link}`)
      ),
    },
    null,
    2
  )
);
if (bad.length) process.exit(2);
