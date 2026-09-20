/**
 * Browser-faithful link probe for LP pages.
 * Mimics: fetch config + domains.json → resolve by hostname → final CTA URL.
 * READ ONLY.
 */
const DOMAINS = [
  "gg86.us",
  "gg88bet.cc",
  "gametong.net",
  "gg881.us",
  "gg88ov.com",
  "gg88us.net",
];

async function getJson(url) {
  try {
    const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
      signal: AbortSignal.timeout(15000),
      headers: { "Cache-Control": "no-cache", Accept: "application/json,text/plain,*/*" },
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, http: r.status, text: text.slice(0, 80) };
    if (text.trim().startsWith("<")) return { ok: false, http: r.status, html: true };
    try {
      return { ok: true, http: r.status, data: JSON.parse(text) };
    } catch {
      return { ok: false, http: r.status, badJson: true, text: text.slice(0, 80) };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function pickLink(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry.main_url || entry.url || entry.link || entry.href || "";
}

/** Same resolution order many GG88 LPs use */
function resolveLikeBrowser(hostname, cfg, domains) {
  const h = (hostname || "").toLowerCase();
  const nh = h.replace(/^www\./, "");
  const d = domains && typeof domains === "object" ? domains : {};
  const domainCfg = d[h] || d[nh] || d[`www.${nh}`] || null;

  let main =
    (typeof domainCfg === "string" ? domainCfg : domainCfg && pickLink(domainCfg)) ||
    (cfg && (cfg.main_url || cfg.url || cfg.link || cfg.DEFAULT_URL || cfg.defaultUrl)) ||
    "";

  // some templates embed DEFAULT_URL as string in html — handled separately
  return {
    domainCfgFound: !!domainCfg,
    domainCfgKeys: domainCfg && typeof domainCfg === "object" ? Object.keys(domainCfg) : null,
    mainUrl: main || "",
    source: domainCfg
      ? "domains.json[hostname]"
      : cfg && (cfg.main_url || cfg.url || cfg.link)
        ? "config.main_url"
        : main
          ? "config.other"
          : "none",
  };
}

async function probe(domain) {
  const base = `https://${domain}`;
  const htmlRes = await fetch(base + "/?t=" + Date.now(), {
    headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000),
  });
  const html = await htmlRes.text();

  // Discover config paths from HTML
  const configPaths = new Set(["/config.json", "/data/config.json", "/js/config.json", "/assets/config.json"]);
  for (const m of html.matchAll(/fetch\(\s*['"]([^'"]*config[^'"]*)['"]/gi)) configPaths.add(m[1].startsWith("http") ? m[1] : new URL(m[1], base).pathname);
  for (const m of html.matchAll(/src=["']([^"']*config[^"']*\.js)["']/gi)) configPaths.add(m[1]);

  const defaultUrlMatch =
    html.match(/DEFAULT_URL\s*=\s*["']([^"']+)["']/) ||
    html.match(/defaultUrl\s*[:=]\s*["']([^"']+)["']/) ||
    html.match(/fallbackUrl\s*[:=]\s*["']([^"']+)["']/);

  const hrefHttps = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((u) => !/blob\.kcam|fonts\.|google|gstatic|facebook|tiktok/i.test(u));

  const domainsJson = await getJson(base + "/domains.json");
  let cfg = null;
  let cfgPath = null;
  for (const p of configPaths) {
    if (p.endsWith(".js")) {
      // try to extract object from js
      try {
        const r = await fetch(base + p + "?t=" + Date.now(), { signal: AbortSignal.timeout(10000) });
        const t = await r.text();
        const urlInJs = t.match(/main_url\s*[:=]\s*["'](https?:\/\/[^"']+)["']/);
        const def = t.match(/DEFAULT_URL\s*=\s*["'](https?:\/\/[^"']+)["']/);
        if (urlInJs || def) {
          cfg = { main_url: (urlInJs || def)[1], from: p };
          cfgPath = p;
          break;
        }
        // SITE_CONFIG = {...}
        const m = t.match(/SITE_CONFIG\s*=\s*(\{[\s\S]*?\})\s*;/);
        if (m) {
          try {
            cfg = Function("return (" + m[1] + ")")();
            cfgPath = p;
            break;
          } catch {}
        }
      } catch {}
      continue;
    }
    const j = await getJson(p.startsWith("http") ? p : base + p);
    if (j.ok && j.data && typeof j.data === "object") {
      cfg = j.data;
      cfgPath = p;
      break;
    }
  }

  const resolved = resolveLikeBrowser(domain, cfg, domainsJson.ok ? domainsJson.data : {});
  if (!resolved.mainUrl && defaultUrlMatch) {
    resolved.mainUrl = defaultUrlMatch[1];
    resolved.source = "html.DEFAULT_URL";
  }
  if (!resolved.mainUrl && hrefHttps[0]) {
    resolved.mainUrl = hrefHttps[0];
    resolved.source = "html.href";
  }

  // Also check www hostname key specifically in domains.json
  const dj = domainsJson.ok ? domainsJson.data : {};
  const keyHits = {
    apex: !!dj[domain],
    www: !!dj[`www.${domain}`],
    // fuzzy: any key containing domain bare
    fuzzy: Object.keys(dj || {}).filter((k) => k.includes(domain.replace(/\./g, "")) || k.endsWith(domain)).slice(0, 5),
  };

  return {
    domain,
    homeHttp: htmlRes.status,
    title: (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || null,
    domainsJsonOk: !!domainsJson.ok,
    domainsJsonKeys: domainsJson.ok ? Object.keys(dj).length : 0,
    keyHits,
    cfgPath,
    cfgMain: cfg ? pickLink(cfg) || cfg.main_url || null : null,
    defaultUrlInHtml: defaultUrlMatch?.[1] || null,
    hrefCandidates: [...new Set(hrefHttps)].slice(0, 5),
    browserResolvedLink: resolved.mainUrl || null,
    browserResolvedSource: resolved.source,
    worksForUser: !!(resolved.mainUrl && resolved.mainUrl !== "#" && /^https?:\/\//i.test(resolved.mainUrl)),
  };
}

const rows = [];
for (const d of DOMAINS) {
  process.stdout.write("probe " + d + "\n");
  rows.push(await probe(d));
}

console.log("\n=== Browser-faithful result ===\n");
for (const r of rows) {
  console.log(
    `${r.domain.padEnd(14)} WORKS=${r.worksForUser ? "YES" : "NO "} via=${String(r.browserResolvedSource).padEnd(22)} link=${r.browserResolvedLink || "-"}`
  );
  console.log(
    `               dj.keys=${r.domainsJsonKeys} apexKey=${r.keyHits.apex} wwwKey=${r.keyHits.www} cfg=${r.cfgPath || "-"} cfgMain=${r.cfgMain || "-"} htmlDefault=${r.defaultUrlInHtml || "-"} hrefs=${JSON.stringify(r.hrefCandidates)}`
  );
}

import fs from "fs";
fs.writeFileSync(
  "data/_PROBE_LP_BROWSER_FAITHFUL.json",
  JSON.stringify({ at: new Date().toISOString(), note: "READ ONLY — resolve like LP JS", rows }, null, 2)
);
console.log("\nWrote data/_PROBE_LP_BROWSER_FAITHFUL.json");
