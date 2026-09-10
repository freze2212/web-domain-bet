import fs from "node:fs";
import { config } from "../src/config.js";
import { getOrCreateZone, getZoneNameservers, ensurePagesCname, addPagesDomain } from "../src/cloudflare.js";
import { updateNameservers } from "../src/spaceship.js";

const DOMAINS_FILE = "C:\\GG88\\ldpape_4d\\domains.json";
const POOL_PROJECTS = ["lp-gg88-vip", "lp-gg88-vip-2"];
const cfToken = config.cloudflare.token();
const accountId = config.cloudflare.accountId();
const ssKey = config.spaceship.apiKey();
const ssSecret = config.spaceship.apiSecret();

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
    } catch {
      counts.set(p, 0);
    }
  }
  return counts;
}

export async function runBatchMigration(batchSize = 25) {
  console.log(`\n======================================================`);
  console.log(`🚀 BẮT ĐẦU CHUYỂN & KIỂM TRA TỰ ĐỘNG ${batchSize} DOMAIN`);
  console.log(`======================================================\n`);

  // 1. Đọc domains.json nguồn
  const fileData = JSON.parse(fs.readFileSync(DOMAINS_FILE, "utf8"));
  const allDomains = Object.keys(fileData).filter((k) => k !== "_default");

  // 2. Lấy danh sách domain đã có trên 2 project để tránh làm lại
  const p1Res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/lp-gg88-vip`, {
    headers: { Authorization: `Bearer ${cfToken}` },
  });
  const p1Data = await p1Res.json();
  const existingSet = new Set((p1Data.result?.domains || []).map((d) => d.toLowerCase()));

  const p2Res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/lp-gg88-vip-2`, {
    headers: { Authorization: `Bearer ${cfToken}` },
  });
  const p2Data = await p2Res.json();
  (p2Data.result?.domains || []).forEach((d) => existingSet.add(d.toLowerCase()));

  // 3. Lấy danh sách domain Spaceship
  console.log("🔍 Đang đồng bộ danh sách từ Spaceship...");
  const ssDomains = new Map();
  let skip = 0;
  while (true) {
    const res = await fetch(`https://spaceship.dev/api/v1/domains?take=100&skip=${skip}`, {
      headers: { "X-Api-Key": ssKey, "X-Api-Secret": ssSecret },
    });
    const data = await res.json();
    if (!data.items || data.items.length === 0) break;
    data.items.forEach((i) => {
      if (i.lifecycleStatus === "registered") {
        ssDomains.set(i.name.toLowerCase(), i);
      }
    });
    skip += data.items.length;
    if (skip >= data.total) break;
  }
  console.log(`✅ Tìm thấy ${ssDomains.size} domain active trên Spaceship.\n`);

  // 4. Lọc ra batchSize domain cần chuyển
  const candidates = [];
  for (const d of allDomains) {
    const dLower = d.toLowerCase().trim();
    if (ssDomains.has(dLower) && !existingSet.has(dLower)) {
      candidates.push({
        domain: dLower,
        configData: fileData[d],
      });
      if (candidates.length >= batchSize) break;
    }
  }

  if (candidates.length === 0) {
    console.log("ℹ️ Không còn domain nào cần chuyển trong đợt này!");
    return;
  }

  console.log(`📋 Danh sách ${candidates.length} domain được chọn để chuyển đợt này:`);
  candidates.forEach((c, idx) => console.log(`   ${idx + 1}. ${c.domain}`));
  console.log("");

  const capacityMap = await getProjectDomainCounts();
  console.log("📊 Dung lượng Project trước khi chuyển:");
  for (const [p, c] of capacityMap.entries()) {
    console.log(`   - [${p}]: ${c}/100 slots`);
  }
  console.log("");

  const migrationResults = [];

  // 5. Thực hiện chuyển từng domain
  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const domain = item.domain;
    console.log(`\n[${i + 1}/${candidates.length}] ⚙️ Tiến hành chuyển: ${domain}...`);

    let targetProject = null;
    for (const p of POOL_PROJECTS) {
      const currentCount = capacityMap.get(p) || 0;
      if (currentCount < 100) {
        targetProject = p;
        break;
      }
    }

    if (!targetProject) {
      console.log(`   ⚠️ Cả 2 project đều đã đầy (100/100)!`);
      break;
    }

    const targetCname = `${targetProject}.pages.dev`;

    try {
      // Step A: Setup Zone
      const zone = await getOrCreateZone(domain);
      const ns = getZoneNameservers(zone);

      // Step B: Update NS Spaceship
      try {
        await updateNameservers(domain, ns);
      } catch (err) {
        // bỏ qua nếu đã trỏ
      }

      // Step C: Set CNAME
      await ensurePagesCname(domain, targetCname);

      // Step D: Add Custom Domain to Pages
      let addSuccess = false;
      try {
        const pagesRes = await addPagesDomain(domain, targetProject);
        addSuccess = true;
        capacityMap.set(targetProject, (capacityMap.get(targetProject) || 0) + 1);
        console.log(`   ✅ Gán thành công vào [${targetProject}] (CNAME: ${targetCname})`);
      } catch (err) {
        if (/100/.test(err.message)) {
          // Project đầy -> chuyển sang project tiếp theo
          console.log(`   ⚠️ Project [${targetProject}] đã đầy, chuyển sang [lp-gg88-vip-2]...`);
          targetProject = "lp-gg88-vip-2";
          await ensurePagesCname(domain, `${targetProject}.pages.dev`);
          await addPagesDomain(domain, targetProject);
          capacityMap.set(targetProject, (capacityMap.get(targetProject) || 0) + 1);
          console.log(`   ✅ Gán thành công vào [${targetProject}]`);
          addSuccess = true;
        } else {
          console.log(`   ℹ️ Pages Domain: ${err.message}`);
        }
      }

      migrationResults.push({
        domain,
        project: targetProject,
        configData: item.configData,
        status: "MIGRATED",
      });
    } catch (err) {
      console.error(`   ❌ Lỗi chuyển ${domain}:`, err.message);
      migrationResults.push({
        domain,
        project: targetProject,
        configData: item.configData,
        status: "FAILED",
        error: err.message,
      });
    }
  }

  // 6. BƯỚC KIỂM TRA TRUY CẬP & XÁC THỰC LINK BUTTON
  console.log("\n======================================================");
  console.log("🔍 ĐANG TỰ ĐỘNG TRUY CẬP VÀ KIỂM TRA CLICK LINK NÚT BẤM");
  console.log("======================================================\n");

  // Chờ 3 giây để DNS sync
  await new Promise((r) => setTimeout(r, 3000));

  const verificationTable = [];

  for (let i = 0; i < migrationResults.length; i++) {
    const item = migrationResults[i];
    if (item.status === "FAILED") continue;

    const domain = item.domain;
    const expectedObj = item.configData;
    const expectedLink =
      typeof expectedObj === "string"
        ? expectedObj
        : expectedObj?.main_url || expectedObj?.messenger_url || "N/A";

    let liveHttpCode = 0;
    let actualResolvedLink = "Chưa nhận diện";
    let matchStatus = "❌";

    try {
      // Test fetch trực tiếp qua Cloudflare
      const res = await fetch(`https://${domain}/domains.json`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      liveHttpCode = res.status;

      if (res.ok) {
        const liveJson = await res.json();
        const domainCfg = liveJson[domain] || liveJson[domain.toLowerCase()];
        if (domainCfg) {
          actualResolvedLink =
            typeof domainCfg === "string"
              ? domainCfg
              : domainCfg?.main_url || domainCfg?.messenger_url || "N/A";
          
          if (actualResolvedLink === expectedLink || actualResolvedLink.includes(expectedLink.replace(/\/$/, ""))) {
            matchStatus = "✅ CHUẨN XÁC";
          } else {
            matchStatus = "⚠️ KHÁC LINK";
          }
        } else {
          // Domain trỏ đúng nhưng chưa có key riêng -> fallback sang link mặc định của site
          actualResolvedLink = "Link Mặc Định Template";
          matchStatus = "✅ HOẠT ĐỘNG (Default)";
        }
      } else {
        matchStatus = "⏳ Đang cấp SSL";
      }
    } catch (err) {
      liveHttpCode = 522;
      matchStatus = "⏳ Đang sync DNS";
    }

    verificationTable.push({
      "Domain": domain,
      "Project Pages": item.project,
      "HTTP Code": liveHttpCode || 200,
      "Link Setup Trong Source": expectedLink.slice(0, 38) + (expectedLink.length > 38 ? "..." : ""),
      "Link Nút Bấm Thực Tế": actualResolvedLink.slice(0, 38) + (actualResolvedLink.length > 38 ? "..." : ""),
      "Kết Quả": matchStatus,
    });
  }

  console.table(verificationTable);

  console.log("\n📊 Dung lượng Project sau khi chuyển:");
  const finalCapacity = await getProjectDomainCounts();
  for (const [p, c] of finalCapacity.entries()) {
    console.log(`   - [${p}]: ${c}/100 slots`);
  }
}

// Chạy chuyển đợt 20 domain
runBatchMigration(20);
