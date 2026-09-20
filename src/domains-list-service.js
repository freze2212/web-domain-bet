import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { listAllDomains, detectBrandFromDomain } from "./repo-scanner.js";
import { listTemplates } from "./templates.js";
import { listHubZonesFromCache, isAdminCfZone } from "./cf-account-guard.js";
import { getDomainOwner } from "./ownership.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CF_CACHE_PATH = path.resolve(__dirname, "../data/cf_zones_cache.json");

let enrichedCache = { key: "", at: 0, domains: null };
const ENRICHED_TTL_MS = 5 * 60_000;

function cfCacheMtime() {
  try {
    return fs.statSync(CF_CACHE_PATH).mtimeMs;
  } catch {
    return 0;
  }
}

function buildTemplateIndex(templates) {
  const bySub = new Map();
  const byBase = new Map();
  for (const t of templates) {
    if (!t.path) continue;
    const parts = t.path.split(/[\\/]/).filter(Boolean).map((x) => x.toLowerCase());
    const sub = parts.slice(-2).join("/");
    if (sub && !bySub.has(sub)) bySub.set(sub, t);
    const base = path.basename(t.path).toLowerCase();
    if (base && !byBase.has(base)) byBase.set(base, t);
  }
  return { bySub, byBase };
}

function matchTemplateForDomain(d, index) {
  if (!d.repos || d.repos.length === 0) return null;
  for (const r of d.repos) {
    const rParts = r.split(/[\\/]/).filter(Boolean).map((x) => x.toLowerCase());
    const rSub = rParts.slice(-2).join("/");
    const hit = index.bySub.get(rSub);
    if (hit) return hit;
  }
  for (const r of d.repos) {
    const rLower = r.toLowerCase();
    for (const [base, t] of index.byBase) {
      if (rLower.includes(base)) return t;
    }
  }
  return null;
}

function slimDomainRow(d) {
  return {
    domain: d.domain,
    mainUrl: d.mainUrl || "",
    messengerUrl: d.messengerUrl || "",
    telegramUrl: d.telegramUrl || "",
    primaryFolder: d.primaryFolder || "",
    sourceType: d.sourceType || "",
    templateId: d.templateId || null,
    templateName: d.templateName || "",
    brand: d.brand || "",
    cnameTarget: d.cnameTarget || null,
    owner: d.owner || "Chưa gán",
    cfAccount: d.cfAccount || null,
    cfZoneStatus: d.cfZoneStatus || null,
    inRepo: d.inRepo !== false,
    liveStatus: d.liveStatus || null,
  };
}

function domainMatchesQuery(d, q) {
  if (!q) return true;
  const hay = [
    d.domain,
    d.mainUrl,
    d.telegramUrl,
    d.messengerUrl,
    d.brand,
    d.templateName,
    d.primaryFolder,
    d.owner,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function invalidateEnrichedDomainsCache() {
  enrichedCache = { key: "", at: 0, domains: null };
}

export function buildEnrichedDomainsList({ isAdminUser, userAllowedDomains }) {
  const templates = listTemplates();
  const cacheKey = `${listAllDomains().length}|${templates.length}|${cfCacheMtime()}`;
  const now = Date.now();
  if (enrichedCache.domains && enrichedCache.key === cacheKey && now - enrichedCache.at < ENRICHED_TTL_MS) {
    return filterEnrichedForUser(enrichedCache.domains, { isAdminUser, userAllowedDomains });
  }

  let domains = listAllDomains();
  const index = buildTemplateIndex(templates);

  const enriched = domains.map((d) => {
    const matchingTpl = matchTemplateForDomain(d, index);
    const brand = matchingTpl ? matchingTpl.brand : detectBrandFromDomain(d.domain);
    const templateName = matchingTpl
      ? matchingTpl.name
      : d.sourceType === "redirect_302"
        ? "302 Direct Redirect"
        : d.primaryFolder;
    const owner = getDomainOwner(d.domain);
    return {
      ...d,
      templateId: matchingTpl ? matchingTpl.id : null,
      templateName,
      brand,
      cnameTarget: matchingTpl ? matchingTpl.cnameTarget : null,
      owner: owner?.userId || "Chưa gán",
      inRepo: true,
    };
  });

  const seen = new Set(enriched.map((d) => String(d.domain || "").toLowerCase().replace(/^www\./, "")));
  const cfZones = listHubZonesFromCache({ includeAdmin: true }).filter((z) => z?.status === "active");
  for (const z of cfZones) {
    const name = String(z.name || "").toLowerCase().trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const owner = getDomainOwner(name);
    const cfAccount = isAdminCfZone(z) ? "admin" : "freze";
    enriched.push({
      domain: name,
      mainUrl: "",
      telegramUrl: "",
      messengerUrl: "",
      sourceType: "cf_zone",
      primaryFolder: cfAccount === "admin" ? "Cloudflare Admin (chưa gắn LP)" : "Cloudflare Freze (chưa gắn LP)",
      repos: [],
      templateId: null,
      templateName: "Chưa gắn Landing Page / 302",
      brand: detectBrandFromDomain(name),
      cnameTarget: null,
      owner: owner?.userId || "Chưa gán",
      cfAccount,
      cfZoneStatus: z.status,
      inRepo: false,
    });
  }

  enriched.sort((a, b) => String(a.domain).localeCompare(String(b.domain)));
  enrichedCache = { key: cacheKey, at: now, domains: enriched };
  return filterEnrichedForUser(enriched, { isAdminUser, userAllowedDomains });
}

function filterEnrichedForUser(domains, { isAdminUser, userAllowedDomains }) {
  if (isAdminUser) return domains;
  if (!userAllowedDomains || !Array.isArray(userAllowedDomains)) return domains;
  const allowedSet = new Set(userAllowedDomains.map((d) => d.toLowerCase()));
  return domains.filter(
    (d) =>
      allowedSet.has(d.domain.toLowerCase()) ||
      allowedSet.has(d.domain.replace(/^www\./, "").toLowerCase()),
  );
}

export function queryEnrichedDomainsList(ctx, { page = 1, limit = 50, q = "", all = false, fields = "" } = {}) {
  const full = buildEnrichedDomainsList(ctx);
  const query = String(q || "")
    .trim()
    .toLowerCase();
  const filtered = query ? full.filter((d) => domainMatchesQuery(d, query)) : full;

  if (all) {
    if (fields === "names") {
      return {
        success: true,
        count: filtered.length,
        domains: filtered.map((d) => d.domain),
        total: filtered.length,
      };
    }
    return {
      success: true,
      count: filtered.length,
      total: filtered.length,
      domains: filtered.map(slimDomainRow),
      cfZonesMerged: true,
    };
  }

  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const safePage = Math.max(1, Number(page) || 1);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const offset = (safePage - 1) * safeLimit;
  const slice = filtered.slice(offset, offset + safeLimit).map(slimDomainRow);

  return {
    success: true,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
    count: slice.length,
    domains: slice,
    cfZonesMerged: true,
    paginated: true,
  };
}
