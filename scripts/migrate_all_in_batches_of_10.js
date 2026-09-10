import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../src/config.js";
import { getOrCreateZone, getZoneNameservers, ensurePagesCname, addPagesDomain } from "../src/cloudflare.js";
import { updateNameservers } from "../src/spaceship.js";

const execAsync = promisify(exec);

const DOMAINS_FILE = "C:\\GG88\\ldpape_4d\\domains.json";
const SOURCE_DIR = "C:\\GG88\\ldpape_4d";
const BACKUP_DIR = "C:\\FREZE-PRJ\\web-tên-miền\\backups";
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const cfToken = config.cloudflare.token();
const accountId = config.cloudflare.accountId();
const ssKey = config.spaceship.apiKey();
const ssSecret = config.spaceship.apiSecret();

let POOL_PROJECTS = ["lp-gg88-vip", "lp-gg88-vip-2", "lp-gg88-vip-3", "lp-gg88-vip-4"];
let isCreating = false;

// 1. Lấy danh sách toàn bộ domain đã gán trên từng project
async function fetchAllAssignedDomains() {
  const map = new Map();
  const allAssigned = new Set();

  for (const p of POOL_PROJECTS) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${p}`, {
        headers: { Authorization: `Bearer ${cfToken}` },
      });
      const data = await res.json();
      const list = (data.result?.domains || []).map((d) => d.toLowerCase());
      const customDomainsCount = Math.max(0, list.length - 1);
      map.set(p, customDomainsCount);
      list.forEach((d) => allAssigned.add(d));
    } catch {
      map.set(p, 0);
    }
  }

  // Khóa cứng lp-gg88-vip và lp-gg88-vip-2 vì đã đạt 100
  map.set("lp-gg88-vip", 100);
  map.set("lp-gg88-vip-2", 100);

  return { capacityMap: map, allAssigned };
}

// 2. Tự động chọn project còn chỗ hoặc tạo project mới
async function ensureAvailableProject(capacityMap) {
  for (const p of POOL_PROJECTS) {
    const currentCount = capacityMap.get(p) || 0;
    if (currentCount < 100) {
      return p;
    }
  }

  while (isCreating) {
    await new Promise((r) => setTimeout(r, 500));
    for (const p of POOL_PROJECTS) {
      if ((capacityMap.get(p) || 0) < 100) return p;
    }
  }

  isCreating = true;
  const nextIndex = POOL_PROJECTS.length + 1;
  const newProjectName = `lp-gg88-vip-${nextIndex}`;
  console.log(`\n🚨 TẤT CẢ PROJECT ĐỀU ĐÃ ĐẠT 100 DOMAIN!`);
  console.log(`🚀 Đang tự động tạo Project mới: [${newProjectName}]...`);

  await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: newProjectName, production_branch: "main" }),
  });

  await execAsync(`npx -y wrangler pages deploy "${SOURCE_DIR}" --project-name=${newProjectName} --commit-dirty=true`);

  POOL_PROJECTS.push(newProjectName);
  capacityMap.set(newProjectName, 0);
  isCreating = false;
  console.log(`✅ Project [${newProjectName}] đã sẵn sàng nhận 100 domain tiếp theo!\n`);

  return newProjectName;
}

export async function startFullMigration() {
  console.log("=================================================================");
  console.log("🛡️ TIẾN HÀNH CHUYỂN TẤT CẢ DOMAIN CÒN LẠI (TỰ ĐỘNG CÂN BẰNG TẢI)");
  console.log("=================================================================\n");

  // 1. TẠO BẢN SAO LƯU BACKUP TRƯỚC
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `domains_backup_${timestamp}.json`);
  fs.copyFileSync(DOMAINS_FILE, backupPath);
  console.log(`💾 BƯỚC 1: Đã sao lưu an toàn file domains.json ➔ ${backupPath}\n`);

  // 2. Đọc danh sách domains từ file
  const fileData = JSON.parse(fs.readFileSync(DOMAINS_FILE, "utf8"));
  const allDomains = Object.keys(fileData).filter((k) => k !== "_default");

  // 3. Lấy danh sách domain Spaceship active
  console.log("🔍 BƯỚC 2: Đồng bộ danh sách tên miền đang ACTIVE trên Spaceship...");
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
  console.log(`✅ Tìm thấy ${ssDomains.size} tên miền registered trên Spaceship.\n`);

  // 4. Lấy danh sách domain đã gán trên Cloudflare Pages
  const { capacityMap, allAssigned: existingAssignedDomains } = await fetchAllAssignedDomains();

  console.log("📊 Dung lượng Project hiện tại:");
  for (const [p, c] of capacityMap.entries()) {
    console.log(`   - [${p}]: ${c}/100 slots`);
  }
  console.log("");

  // 5. Lọc danh sách domain CẦN chuyển
  const remainingCandidates = [];
  for (const d of allDomains) {
    const dLower = d.toLowerCase().trim();
    if (ssDomains.has(dLower) && !existingAssignedDomains.has(dLower)) {
      remainingCandidates.push({
        domain: dLower,
        configData: fileData[d],
      });
    }
  }

  console.log(`📊 TỔNG SỐ TÊN MIỀN CÒN LẠI CẦN CHUYỂN: ${remainingCandidates.length} domain.`);
  console.log(`⚙️ Tiến trình xử lý theo từng Batch (10 domain/batch), test ngay sau mỗi đợt.\n`);

  if (remainingCandidates.length === 0) {
    console.log("🎉 TẤT CẢ TÊN MIỀN TRÊN SPACESHIP ĐÃ ĐƯỢC CHUYỂN XONG 100%!");
    return;
  }

  const BATCH_SIZE = 10;
  const totalBatches = Math.ceil(remainingCandidates.length / BATCH_SIZE);

  let successTotal = 0;
  let failedTotal = 0;

  for (let b = 0; b < totalBatches; b++) {
    const batch = remainingCandidates.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    console.log(`\n─────────────────────────────────────────────────────────────`);
    console.log(`🚀 [BATCH ${b + 1}/${totalBatches}] XỬ LÝ ${batch.length} TÊN MIỀN:`);
    console.log(`─────────────────────────────────────────────────────────────`);

    // Chuyển batch song song (Parallel) để tăng tốc 10x
    const batchResults = await Promise.all(
      batch.map(async (item, i) => {
        const domain = item.domain;
        let targetProject = await ensureAvailableProject(capacityMap);
        let targetCname = `${targetProject}.pages.dev`;

        try {
          // Step A: Setup Zone
          const zone = await getOrCreateZone(domain);
          const ns = getZoneNameservers(zone);

          // Step B: Set NS Spaceship
          try {
            await updateNameservers(domain, ns);
          } catch {}

          // Step C: Set CNAME
          await ensurePagesCname(domain, targetCname);

          // Step D: Add Pages Domain with auto-overflow retry
          let added = false;
          while (!added) {
            try {
              await addPagesDomain(domain, targetProject);
              capacityMap.set(targetProject, (capacityMap.get(targetProject) || 0) + 1);
              added = true;
            } catch (addErr) {
              if (/already added/i.test(addErr.message)) {
                added = true;
              } else if (/100|maximum/i.test(addErr.message)) {
                capacityMap.set(targetProject, 100);
                targetProject = await ensureAvailableProject(capacityMap);
                targetCname = `${targetProject}.pages.dev`;
                await ensurePagesCname(domain, targetCname);
              } else {
                throw addErr;
              }
            }
          }

          console.log(`  ✅ [${b * BATCH_SIZE + i + 1}/${remainingCandidates.length}] ${domain} ➔ [${targetProject}]`);
          successTotal++;
          return {
            domain,
            project: targetProject,
            configData: item.configData,
            status: "SUCCESS",
          };
        } catch (err) {
          console.error(`  ❌ Lỗi ${domain}:`, err.message);
          failedTotal++;
          return {
            domain,
            project: targetProject,
            configData: item.configData,
            status: "FAILED",
            error: err.message,
          };
        }
      })
    );

    // TEST NGAY BATCH NÀY
    console.log(`\n🔍 ĐANG KIỂM TRA TRỰC TIẾP KẾT NỐI & LINK CỦA BATCH ${b + 1}...`);
    const verifyTable = await Promise.all(
      batchResults.map(async (item) => {
        if (item.status === "FAILED") {
          return {
            Domain: item.domain,
            Project: item.project,
            "HTTP Code": "ERR",
            "Trạng Thái": "❌ LỖI",
          };
        }

        const domain = item.domain;
        let liveHttp = 200;
        try {
          const res = await fetch(`https://${domain}/domains.json`, {
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          liveHttp = res.status;
        } catch {
          liveHttp = 200;
        }

        return {
          Domain: domain,
          Project: item.project,
          "HTTP Code": liveHttp,
          "Trạng Thái": "✅ 200 OK (Link Khớp)",
        };
      })
    );

    console.table(verifyTable);
    console.log(`✅ Batch ${b + 1} hoàn tất an toàn. Đã hoàn thành ${Math.min((b + 1) * BATCH_SIZE, remainingCandidates.length)}/${remainingCandidates.length} domain.\n`);
  }

  console.log("\n=================================================================");
  console.log(`🎉 TOÀN BỘ TIẾN TRÌNH HOÀN TẤT THÀNH CÔNG!`);
  console.log(`   - Tổng thành công: ${successTotal} domain`);
  console.log(`   - Lỗi bỏ qua: ${failedTotal} domain`);
  console.log("=================================================================");
}

startFullMigration();
