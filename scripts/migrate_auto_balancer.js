import fs from "node:fs";
import { config } from "../src/config.js";
import { setupCloudflare, getOrCreateZone, ensurePagesCname, addPagesDomain, getZoneNameservers } from "../src/cloudflare.js";
import { updateNameservers } from "../src/spaceship.js";

const POOL_PROJECTS = ["lp-gg88-vip", "lp-gg88-vip-2"];
const cfToken = config.cloudflare.token();
const accountId = config.cloudflare.accountId();

async function getProjectDomainCounts() {
  const counts = new Map();
  for (const p of POOL_PROJECTS) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${p}`, {
        headers: { Authorization: `Bearer ${cfToken}` },
      });
      const data = await res.json();
      const count = data.result?.domains ? data.result.domains.length - 1 : 0;
      counts.set(p, count);
    } catch (e) {
      counts.set(p, 0);
    }
  }
  return counts;
}

export async function migrateDomains(domainList) {
  console.log(`\n🚀 BẮT ĐẦU CHUYỂN ${domainList.length} DOMAIN THEO CƠ CHẾ AUTO-BALANCE (MAX 100/PROJECT)\n`);
  
  const capacityMap = await getProjectDomainCounts();
  console.log("📊 Dung lượng hiện tại:");
  for (const [p, c] of capacityMap.entries()) {
    console.log(`   - [${p}]: ${c}/100 slots`);
  }
  console.log("");

  const results = [];

  for (let i = 0; i < domainList.length; i++) {
    const domain = domainList[i].toLowerCase().trim();
    console.log(`\n[${i + 1}/${domainList.length}] ⚙️ Xử lý: ${domain}...`);

    // 1. Tìm project còn slot (< 100)
    let targetProject = null;
    for (const p of POOL_PROJECTS) {
      const currentCount = capacityMap.get(p) || 0;
      if (currentCount < 100) {
        targetProject = p;
        break;
      }
    }

    if (!targetProject) {
      console.log(`   ⚠️ Tất cả project trong pool đều đã đạt 100! Cần tạo project mới.`);
      // Có thể mở rộng tự động tạo lp-gg88-vip-3
      break;
    }

    const targetCname = `${targetProject}.pages.dev`;
    console.log(`   🎯 Gán vào project: [${targetProject}] (Dung lượng: ${capacityMap.get(targetProject)}/100) ➔ CNAME: ${targetCname}`);

    try {
      // 2. Setup Zone & Lấy Nameservers
      const zone = await getOrCreateZone(domain);
      const ns = getZoneNameservers(zone);
      console.log(`   ✅ Zone CF: ${zone.name} (${zone.status})`);

      // 3. Đổi Nameservers trên Spaceship nếu cần
      try {
        await updateNameservers(domain, ns);
        console.log(`   ✅ Đã trỏ NS Spaceship ➔ ${ns.join(", ")}`);
      } catch (err) {
        console.log(`   ℹ️ NS Spaceship: ${err.message}`);
      }

      // 4. Tạo CNAME DNS
      await ensurePagesCname(domain, targetCname);
      console.log(`   ✅ Đã tạo bản ghi CNAME: ${domain} ➔ ${targetCname} (Proxy ON)`);

      // 5. Gắn Custom Domain vào Pages Project
      try {
        await addPagesDomain(domain, targetProject);
        console.log(`   ✅ Đã add Custom Domain vào Cloudflare Pages: [${targetProject}]`);
      } catch (err) {
        console.log(`   ℹ️ Pages Domain: ${err.message}`);
      }

      // 6. Cập nhật dung lượng bộ đếm
      capacityMap.set(targetProject, (capacityMap.get(targetProject) || 0) + 1);

      results.push({
        domain,
        project: targetProject,
        cname: targetCname,
        status: "SUCCESS",
      });
    } catch (err) {
      console.error(`   ❌ Lỗi xử lý ${domain}:`, err.message);
      results.push({
        domain,
        project: targetProject,
        status: "FAILED",
        error: err.message,
      });
    }
  }

  console.log("\n========================================");
  console.log("🎉 TỔNG KẾT QUÁ TRÌNH CHUYỂN 5 DOMAIN MẪU:");
  console.table(results);

  const finalCapacity = await getProjectDomainCounts();
  console.log("📊 Dung lượng sau khi chuyển:");
  for (const [p, c] of finalCapacity.entries()) {
    console.log(`   - [${p}]: ${c}/100 slots`);
  }
}

// Chạy thử với 5 domain mẫu
const test5 = [
  "gg88news.com",
  "gg8881.vip",
  "gg8882.vip",
  "gg8883.vip",
  "gg8686.cc"
];

migrateDomains(test5);
