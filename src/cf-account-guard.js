/**
 * Guard: phân biệt zone Admin vs Freze.
 * Khi có CLOUDFLARE_ADMIN_API_TOKEN: hub được phép tìm domain Admin + gắn DNS → Pages Freze.
 * Khi không có admin token: vẫn block mutation zone Admin (tránh tạo zone Freze trùng / DNS fail).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(__dirname, "../data/cf_zones_cache.json");

/** Known Admin CF account (Admin@itkjc.com) */
export const CF_ADMIN_ACCOUNT_ID =
  process.env.CLOUDFLARE_ADMIN_ACCOUNT_ID?.trim() ||
  config.cloudflare.adminAccountId?.() ||
  "ddead9accc534c1eb074d2a46fffe748";

let zoneCacheMem = { mtime: -1, zones: null, byDomain: null };

export function invalidateCfZoneCacheMem() {
  zoneCacheMem = { mtime: -1, zones: null, byDomain: null };
}

function frezeAccountId() {
  return config.cloudflare.accountId() || "456da4d89821d871fac09c0e5651338a";
}

function hasAdminApiToken() {
  return Boolean(config.cloudflare.adminToken?.() || process.env.CLOUDFLARE_ADMIN_API_TOKEN?.trim());
}

function loadZoneCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      zoneCacheMem = { mtime: 0, zones: [], byDomain: new Map() };
      return zoneCacheMem.zones;
    }
    const mtime = fs.statSync(CACHE_PATH).mtimeMs;
    if (zoneCacheMem.zones && zoneCacheMem.mtime === mtime) {
      return zoneCacheMem.zones;
    }
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    const zones = Array.isArray(raw) ? raw : [];
    const byDomain = new Map();
    for (const z of zones) {
      const d = normDomain(z?.name);
      if (!d) continue;
      if (!byDomain.has(d)) byDomain.set(d, []);
      byDomain.get(d).push(z);
    }
    zoneCacheMem = { mtime, zones, byDomain };
    return zones;
  } catch {
    zoneCacheMem = { mtime: Date.now(), zones: [], byDomain: new Map() };
    return zoneCacheMem.zones;
  }
}

function zonesForDomain(domain) {
  loadZoneCache();
  const d = normDomain(domain);
  return zoneCacheMem.byDomain?.get(d) || [];
}

function normDomain(domain) {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

function isAdminAccountName(name) {
  const n = String(name || "").toLowerCase();
  return n.includes("admin@itkjc") || (n.includes("admin") && !n.includes("freze"));
}

function isFrezeAccountName(name) {
  return String(name || "")
    .toLowerCase()
    .includes("freze");
}

export function isFrezeCfZone(z) {
  if (!z) return false;
  const accId = frezeAccountId();
  if (z.accountId && accId && z.accountId === accId) return true;
  return isFrezeAccountName(z.accountName);
}

export function isAdminCfZone(z) {
  if (!z) return false;
  if (z.accountId && z.accountId === CF_ADMIN_ACCOUNT_ID) return true;
  return isAdminAccountName(z.accountName);
}

/** Zones thuộc Freze (dùng cho search / sync list UI) */
export function listFrezeZonesFromCache() {
  return loadZoneCache().filter((z) => isFrezeCfZone(z));
}

/** Zones Admin (search khi có admin token) */
export function listAdminZonesFromCache() {
  return loadZoneCache().filter((z) => isAdminCfZone(z));
}

/** Freze + Admin — search hub (Admin chỉ hiện khi đã cấu hình ADMIN token) */
export function listHubZonesFromCache({ includeAdmin = true } = {}) {
  const freze = listFrezeZonesFromCache();
  if (!includeAdmin || !hasAdminApiToken()) return freze;
  const admin = listAdminZonesFromCache();
  const byId = new Map();
  for (const z of [...freze, ...admin]) {
    if (z?.id) byId.set(z.id, z);
    else byId.set(`${z.name}:${z.accountId || z.accountName}`, z);
  }
  return [...byId.values()];
}

/**
 * @returns {{
 *   domain: string,
 *   zones: object[],
 *   adminActive: object|null,
 *   frezeActive: object|null,
 *   frezePending: object|null,
 *   managedBy: 'admin'|'freze'|'unknown'|'both_conflict',
 *   blockHubMutation: boolean,
 *   reason: string|null
 * }}
 */
export function resolveCfZoneOwnership(domain) {
  const d = normDomain(domain);
  const zones = zonesForDomain(d);
  const adminActive = zones.find((z) => z.status === "active" && isAdminCfZone(z)) || null;
  const frezeActive = zones.find((z) => z.status === "active" && isFrezeCfZone(z)) || null;
  const frezePending = zones.find((z) => z.status !== "active" && isFrezeCfZone(z)) || null;

  let managedBy = "unknown";
  let blockHubMutation = false;
  let reason = null;

  if (adminActive) {
    managedBy = frezeActive ? "both_conflict" : "admin";
    if (!hasAdminApiToken()) {
      blockHubMutation = true;
      reason = `Miền [${d}] thuộc Cloudflare Admin (zone active) — thiếu CLOUDFLARE_ADMIN_API_TOKEN nên hub Freze không sửa DNS/Pages.`;
    } else {
      // Có Admin token: cho phép gắn CNAME Admin → Pages Freze
      blockHubMutation = false;
      reason = null;
    }
  } else if (frezeActive) {
    managedBy = "freze";
  } else if (frezePending && !adminActive) {
    managedBy = "freze";
  }

  return {
    domain: d,
    zones,
    adminActive,
    frezeActive,
    frezePending,
    managedBy,
    blockHubMutation,
    reason,
  };
}

export function isAdminManagedDomain(domain) {
  const m = resolveCfZoneOwnership(domain).managedBy;
  return m === "admin" || m === "both_conflict";
}

/** Domain được phép hiện / sửa trên hub */
export function isFrezeHubDomain(domain) {
  return !resolveCfZoneOwnership(domain).blockHubMutation;
}

export function filterFrezeHubDomains(list, domainKey = "domain") {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => {
    const name = typeof item === "string" ? item : item?.[domainKey];
    return name && isFrezeHubDomain(name);
  });
}

/** Throw-friendly / API-friendly guard */
export function assertNotAdminCfDomain(domain) {
  const own = resolveCfZoneOwnership(domain);
  if (own.blockHubMutation) {
    const err = new Error(own.reason);
    err.code = "CF_ADMIN_SKIP";
    err.ownership = own;
    throw err;
  }
  return own;
}

export function adminSkipPayload(domain) {
  const own = resolveCfZoneOwnership(domain);
  if (!own.blockHubMutation) return null;
  return {
    success: false,
    skipped: true,
    code: "CF_ADMIN_SKIP",
    error: own.reason,
    cfManagedBy: own.managedBy,
    cfAccount: own.adminActive?.accountName || "Admin",
  };
}
