import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheFile = path.resolve(__dirname, "../data/cf_zones_cache.json");

export async function syncAllCloudflareZones() {
  const token = config.cloudflare.token();
  let page = 1;
  let allZones = [];
  console.log("Fetching all Cloudflare zones...");

  while (true) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.result || data.result.length === 0) break;

    for (const z of data.result) {
      allZones.push({
        id: z.id,
        name: z.name.toLowerCase().trim(),
        status: z.status,
        accountName: z.account?.name,
        accountId: z.account?.id,
        createdOn: z.created_on
      });
    }

    process.stdout.write(`\rFetched ${allZones.length} / ${data.result_info?.total_count || allZones.length} zones...`);
    if (page >= data.result_info?.total_pages) break;
    page++;
  }

  console.log(`\n✅ Tổng cộng đã nạp ${allZones.length} zones từ Cloudflare.`);
  fs.writeFileSync(cacheFile, JSON.stringify(allZones, null, 2), "utf8");
  return allZones;
}

if (process.argv[1] && process.argv[1].endsWith("sync_all_cf_zones.js")) {
  syncAllCloudflareZones().catch(console.error);
}
