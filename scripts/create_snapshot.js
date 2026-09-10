import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";

const BACKUP_DIR = "C:\\FREZE-PRJ\\web-tên-miền\\backups";
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const ssKey = config.spaceship.apiKey();
const ssSecret = config.spaceship.apiSecret();
const cfToken = config.cloudflare.token();
const accountId = config.cloudflare.accountId();

export async function createFullSnapshot(domainList) {
  console.log(`📸 Đang tạo Full Snapshot cho ${domainList.length} domain...`);
  const snapshot = {
    createdAt: new Date().toISOString(),
    totalDomains: domainList.length,
    domains: {},
  };

  for (const domain of domainList) {
    const itemSnapshot = { domain, spaceship: null, cloudflare: null };

    // 1. Spaceship state
    try {
      const ssRes = await fetch(`https://spaceship.dev/api/v1/domains/${domain}`, {
        headers: { "X-Api-Key": ssKey, "X-Api-Secret": ssSecret },
      });
      if (ssRes.ok) {
        const ssData = await ssRes.json();
        itemSnapshot.spaceship = {
          status: ssData.lifecycleStatus,
          verification: ssData.verificationStatus,
          nameservers: ssData.nameservers?.hosts || [],
        };
      }
    } catch {}

    // 2. Cloudflare state
    try {
      const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${domain}`, {
        headers: { Authorization: `Bearer ${cfToken}` },
      });
      const cfData = await cfRes.json();
      if (cfData.result?.length > 0) {
        const z = cfData.result[0];
        const dnsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${z.id}/dns_records`, {
          headers: { Authorization: `Bearer ${cfToken}` },
        });
        const dnsData = await dnsRes.json();
        itemSnapshot.cloudflare = {
          zoneId: z.id,
          zoneStatus: z.status,
          dnsRecords: dnsData.result || [],
        };
      }
    } catch {}

    snapshot.domains[domain] = itemSnapshot;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const savePath = path.join(BACKUP_DIR, `snapshot_state_${timestamp}.json`);
  fs.writeFileSync(savePath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(`✅ Đã lưu Snapshot toàn bộ cấu hình vào: ${savePath}`);
  return savePath;
}
