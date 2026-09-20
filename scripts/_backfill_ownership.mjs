/**
 * Gán miền CF chưa có trong domain_ownership.json → u_admin (legacy backfill)
 * Chạy trên VPS: node scripts/_backfill_ownership.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, "..", "data");
const OWNERSHIP_FILE = path.join(DATA, "domain_ownership.json");
const CF_CACHE = path.join(DATA, "cf_zones_cache.json");
const HISTORY_FILE = path.join(DATA, "history.json");
const DEFAULT_OWNER = process.env.BACKFILL_OWNER_ID || "u_admin";

function norm(d) {
  return String(d || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

const ownership = loadJson(OWNERSHIP_FILE, {});
const cfZones = loadJson(CF_CACHE, []);
const history = loadJson(HISTORY_FILE, []);

const candidates = new Set();

for (const z of cfZones) {
  if (z?.name) candidates.add(norm(z.name));
}

for (const h of history) {
  if (h?.domain && h.domain !== "N/A") candidates.add(norm(h.domain));
}

let added = 0;
const now = new Date().toISOString();

for (const domain of candidates) {
  if (!domain || ownership[domain]) continue;
  ownership[domain] = {
    domain,
    userId: DEFAULT_OWNER,
    username: "admin",
    assignedAt: now,
    assignedBy: "backfill_script",
    source: "legacy_cf_backfill",
  };
  added++;
  console.log("+", domain, "→", DEFAULT_OWNER);
}

if (added > 0) {
  fs.writeFileSync(OWNERSHIP_FILE, JSON.stringify(ownership, null, 2), "utf8");
}

console.log(`BACKFILL_DONE added=${added} total=${Object.keys(ownership).length}`);
