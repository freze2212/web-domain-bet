import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheFile = path.resolve(__dirname, "../data/cf_zones_cache.json");

/** Fetch zones for one CF account (account.id filter — tránh miss zone Admin). */
async function fetchZonesForAccount(token, accountId, label) {
  if (!token || !accountId) return [];
  let page = 1;
  const allZones = [];
  while (true) {
    const url = `https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}&account.id=${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success) {
      console.warn(`[sync] ${label} page ${page} fail:`, data.errors?.[0]?.message || res.status);
      break;
    }
    if (!data.result || data.result.length === 0) break;

    for (const z of data.result) {
      allZones.push({
        id: z.id,
        name: z.name.toLowerCase().trim(),
        status: z.status,
        accountName: z.account?.name,
        accountId: z.account?.id,
        createdOn: z.created_on,
      });
    }

    process.stdout.write(`\r[${label}] Fetched ${allZones.length} / ${data.result_info?.total_count || allZones.length} zones...`);
    if (page >= data.result_info?.total_pages) break;
    page++;
  }
  console.log(`\n[${label}] done: ${allZones.length}`);
  return allZones;
}

export async function syncAllCloudflareZones() {
  console.log("Fetching Cloudflare zones (Freze + Admin, filter theo account)...");
  const frezeAcc = config.cloudflare.accountId();
  const adminAcc = config.cloudflare.adminAccountId();
  const frezeTok = config.cloudflare.token();
  const adminTok = config.cloudflare.adminToken();

  const frezeZones = await fetchZonesForAccount(frezeTok, frezeAcc, "Freze");
  // Admin list: ưu tiên Admin token; fallback Freze token nếu Admin thiếu quyền list
  let adminZones = await fetchZonesForAccount(adminTok || frezeTok, adminAcc, "Admin");
  if (adminZones.length === 0 && frezeTok && adminTok && frezeTok !== adminTok) {
    adminZones = await fetchZonesForAccount(frezeTok, adminAcc, "Admin(via FrezeTok)");
  }

  const byId = new Map();
  for (const z of [...frezeZones, ...adminZones]) {
    if (z?.id) byId.set(z.id, z);
  }
  const allZones = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

  console.log(`✅ Tổng cộng ${allZones.length} zones (Freze ${frezeZones.length} + Admin ${adminZones.length}, dedupe).`);
  fs.writeFileSync(cacheFile, JSON.stringify(allZones, null, 2), "utf8");
  return allZones;
}

if (process.argv[1] && process.argv[1].endsWith("sync_all_cf_zones.js")) {
  syncAllCloudflareZones().catch(console.error);
}
