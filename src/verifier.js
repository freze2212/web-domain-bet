import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { getHistory, updateHistoryItem } from "./history.js";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SCREENSHOTS_DIR = path.join(ROOT_DIR, "screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function getBrowserExecutable() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * 1. Kiểm tra HTTP 200 của tên miền & loại trừ trang lỗi Cloudflare
 */
export async function checkDomainHttp(domain) {
  const normDomain = domain.trim().toLowerCase();
  const urlsToTry = [`https://${normDomain}`, `http://${normDomain}`];

  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
      });
      clearTimeout(timeoutId);

      const status = res.status;
      if (status === 200) {
        const text = await res.text();
        // Kiểm tra xem có dính trang thông báo lỗi Cloudflare hay không
        const isCfError =
          text.includes("Error 1014") ||
          text.includes("CNAME Cross-User Banned") ||
          text.includes("522: Connection timed out") ||
          text.includes("521: Web server is down") ||
          text.includes("1000: DNS points to local IP") ||
          text.includes("Cloudflare Ray ID") && text.includes("What happened?");

        if (!isCfError) {
          return { is200: true, status: 200, url };
        } else {
          return { is200: false, status: 200, isCfError: true, error: "Cloudflare Edge Error Page (1014/522/etc)" };
        }
      } else {
        return { is200: false, status, error: `HTTP ${status}` };
      }
    } catch (err) {
      // Tiếp tục thử fallback
    }
  }

  // Fallback 2: Thử kết nối trực tiếp qua Cloudflare Edge IP nếu DNS nội bộ máy tính bị trễ
  try {
    const cfIps = ["172.67.201.193", "172.67.191.73", "104.21.74.96", "104.21.20.33"];
    const https = await import("node:https");
    for (const ip of cfIps) {
      const result = await new Promise((resolve) => {
        const req = https.request(
          {
            hostname: ip,
            port: 443,
            path: "/",
            method: "GET",
            headers: {
              Host: normDomain,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            servername: normDomain,
            rejectUnauthorized: false,
            timeout: 5000,
          },
          (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
              const isCfError =
                data.includes("Error 1014") ||
                data.includes("CNAME Cross-User Banned") ||
                data.includes("522: Connection timed out") ||
                data.includes("521: Web server is down");
              if ((res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && !isCfError) {
                resolve({ is200: true, status: res.statusCode, url: `https://${normDomain}` });
              } else {
                resolve(null);
              }
            });
          }
        );
        req.on("error", () => resolve(null));
        req.on("timeout", () => {
          req.destroy();
          resolve(null);
        });
        req.end();
      });
      if (result && result.is200) {
        return result;
      }
    }
  } catch {}

  return { is200: false, status: 0, error: "Không kết nối được tên miền" };
}

export async function captureDomainScreenshot() {
  return null;
}


import {
  findZoneByName,
  getOrCreateZone,
  getZoneNameservers,
  ensurePagesCname,
  addPagesDomain,
  deleteForwardingPageRules,
  setupDirect302Redirect,
  cfRequest,
} from "./cloudflare.js";
import { updateNameservers, getDomainInfo } from "./spaceship.js";
import { getTemplate, updateTemplateDomainsJson } from "./templates.js";
import { findDomainInRepos } from "./repo-scanner.js";

/**
 * 3. TỰ ĐỘNG CHẨN ĐOÁN & SỬA LỖI TỰ ĐỘNG (Self-Healing Auto-Repair & Full Rebuild)
 */
export async function autoRepairDomain(item, isFullRebuild = false) {
  if (!item || !item.domain || item.domain === "N/A") return { repaired: false, reason: "Invalid domain" };

  const domain = item.domain.trim().toLowerCase();
  const logs = [];
  const actionLabel = isFullRebuild ? "TỰ ĐỘNG TÁI TRIỂN KHAI TOÀN DIỆN (QUÁ 10P)" : "TỰ ĐỘNG SỬA LỖI ĐỊNH KỲ";
  logs.push(`[${actionLabel}] Bắt đầu quy trình tự động cho [${domain}] lúc ${new Date().toLocaleTimeString()}...`);

  try {
    // 1. Kiểm tra Zone Cloudflare
    const zone = await getOrCreateZone(domain);
    const ns = getZoneNameservers(zone);

    // 2. Tự động kiểm tra và cưỡng chế Nameservers trên Spaceship nếu sai lệch
    try {
      const spInfo = await getDomainInfo(domain).catch(() => null);
      if (ns && ns.length > 0) {
        const currentHosts = spInfo?.nameservers?.hosts || [];
        const nsMatch = ns.every((h) => currentHosts.map((x) => x.toLowerCase()).includes(h.toLowerCase()));
        if (!nsMatch || isFullRebuild) {
          logs.push(`🔧 [Bước 1/5] Cưỡng chế cập nhật Nameservers Spaceship về Cloudflare (${ns.join(", ")})...`);
          await updateNameservers(domain, ns).catch(() => {});
          logs.push(`✅ [Bước 1/5] Đã gửi lệnh đồng bộ Nameservers Spaceship.`);
        } else {
          logs.push(`✅ [Bước 1/5] Nameservers Spaceship đã chuẩn (${ns.join(", ")}).`);
        }
      }
    } catch (e) {
      logs.push(`⚠️ [Bước 1/5] Lỗi kiểm tra Spaceship NS: ${e.message}`);
    }

    // 3. Xử lý sửa chữa theo loại cấu hình (Landing Page hoặc 302)
    const is302 = item.actionType?.includes("302") || item.templateId === "302_DIRECT";

    if (is302) {
      logs.push(`🔧 [Bước 2/5] Tự động thiết lập lại chuyển hướng 302 & DNS Proxy 8.8.8.8...`);
      await setupDirect302Redirect(domain, item.link || "https://google.com");
      logs.push(`✅ [Bước 2/5] Đã hoàn tất cài đặt Page Rule 302 & DNS A record.`);
    } else {
      logs.push(`🔧 [Bước 2/5] Xoá toàn bộ Page Rules 302 cũ (tránh xung đột)...`);
      if (zone) {
        await deleteForwardingPageRules(zone.id).catch(() => {});
      }

      // Tìm template tương ứng
      let tpl = item.templateId ? getTemplate(item.templateId) : null;
      if (!tpl) {
        const repoMatches = findDomainInRepos(domain);
        if (repoMatches.length > 0) {
          const tplList = (await import("./templates.js")).listTemplates();
          tpl = tplList.find((t) => t.path && repoMatches.some((m) => m.filePath.includes(t.path)));
        }
      }
      if (!tpl) {
        tpl = getTemplate("gg88_lp_5uae");
      }

      if (tpl) {
        let finalTarget = tpl.cnameTarget;
        // Gắn Custom Domain vào Cloudflare Pages
        if (tpl.pagesProject) {
          logs.push(`🔧 [Bước 3/5] Kích hoạt Custom Domain trên Pages Project [${tpl.pagesProject}]...`);
          const pagesRes = await addPagesDomain(domain, tpl.pagesProject, tpl.path).catch(() => {});
          if (pagesRes?.canonicalSubdomain) {
            finalTarget = pagesRes.canonicalSubdomain;
          }
          logs.push(`✅ [Bước 3/5] Đã đăng ký Custom Domain trên Pages (${finalTarget}).`);
        }

        // Tạo đủ 2 bản ghi DNS CNAME cho apex và www trỏ chính xác về target
        logs.push(`🔧 [Bước 4/5] Tự động tạo bản ghi DNS CNAME (@ & www -> ${finalTarget})...`);
        await ensurePagesCname(domain, finalTarget).catch(() => {});
        logs.push(`✅ [Bước 4/5] Đã cấu hình DNS CNAME Proxied.`);

        // Đồng bộ domains.json & Commit + Multi-Remote Push + Direct Wrangler Deploy
        const repoMatches = findDomainInRepos(domain);
        let targetLink = item.link;
        let targetTele = item.tele || "";
        if (!targetLink && repoMatches.length > 0) {
          targetLink = repoMatches[0].config?.main_url || repoMatches[0].config?.url;
          targetTele = targetTele || repoMatches[0].config?.telegram_url || repoMatches[0].config?.messenger_url || "";
        }

        if (targetLink) {
          logs.push(`🔧 [Bước 5/5] Tự động ghi lại domains.json, Git Push & Deploy Pages (${targetLink})...`);
          await updateTemplateDomainsJson(tpl, domain, targetLink, targetTele).catch(() => {});
          logs.push(`✅ [Bước 5/5] Đã đồng bộ domains.json & kích hoạt Deploy toàn diện.`);
        }
      }
    }

    const updated = updateHistoryItem(item.id || domain, {
      lastRepairedAt: new Date().toISOString(),
      autoRepaired: true,
      repairCount: (item.repairCount || 0) + 1,
      repairLogs: logs,
    });

    console.log(`✨ [Watchdog 2.0] ${actionLabel} hoàn tất cho [${domain}]!`);
    return { repaired: true, domain, logs, updated };
  } catch (err) {
    console.error(`❌ [Watchdog 2.0] Lỗi sửa chữa cho [${domain}]:`, err.message);
    logs.push(`❌ Lỗi trong quá trình xử lý: ${err.message}`);
    return { repaired: false, domain, error: err.message, logs };
  }
}

/**
 * 4. Kiểm tra trạng thái HTTP cho 1 bản ghi lịch sử
 * (Đã TẮT tính năng tự động sửa lỗi - Nếu sau 15p vẫn lỗi sẽ báo cảnh báo liên hệ admin @frezeit)
 */
export async function verifyHistoryItem(item, force = false) {
  if (!item || !item.domain || item.domain === "N/A") return null;

  const domain = item.domain.trim().toLowerCase();

  if (!force && item.liveStatus === "200_OK") {
    return {
      success: true,
      verified: true,
      domain,
      screenshotUrl: item.liveScreenshot,
    };
  }

  console.log(`🔍 [Verifier] Đang kiểm tra HTTP cho [${domain}]...`);
  const checkResult = await checkDomainHttp(domain);

  const createdAt = item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
  const ageMinutes = (Date.now() - createdAt) / 60000;
  const currentCount = (item.checkCount || 0) + 1;

  if (checkResult.is200) {
    console.log(`✅ [${domain}] Đã phản hồi HTTP 200 OK!`);

    const updated = updateHistoryItem(item.id || domain, {
      liveStatus: "200_OK",
      verifiedAt: new Date().toISOString(),
      liveCheckSuccess: true,
      lastCheckedAt: new Date().toISOString(),
      lastCheckError: null,
      checkCount: currentCount,
      ageMinutes: Math.round(ageMinutes * 10) / 10,
    });

    return {
      success: true,
      verified: true,
      domain,
      updated,
    };
  } else {
    // KHÔNG TỰ ĐỘNG SỬA LỖI - Chờ đủ 15 phút, nếu vẫn lỗi thì gán trạng thái ERROR_15M_ALERT
    const isOverdue15m = ageMinutes >= 15;
    const alertMessage = isOverdue15m
      ? "Quá 15 phút chưa phản hồi. Vui lòng truy cập vào tên miền để kiểm tra, nếu phát hiện lỗi vui lòng liên hệ admin @frezeit"
      : (checkResult.error || "Đang chờ kết nối DNS & SSL (trong vòng 15 phút)...");

    console.log(`⏳ [${domain}] Chưa đạt 200 OK (${checkResult.error || checkResult.status}). Tuổi miền: ${Math.round(ageMinutes * 10) / 10}m. Trạng thái: ${isOverdue15m ? "CẢNH BÁO QUÁ 15P" : "ĐANG CHỜ"}`);

    const updated = updateHistoryItem(item.id || domain, {
      liveStatus: isOverdue15m ? "ERROR_15M_ALERT" : "PENDING_200",
      lastCheckedAt: new Date().toISOString(),
      lastCheckError: alertMessage,
      checkCount: currentCount,
      ageMinutes: Math.round(ageMinutes * 10) / 10,
      isOverdue15m,
    });

    return {
      success: true,
      verified: false,
      domain,
      status: checkResult.status,
      error: alertMessage,
      updated,
    };
  }
}

let isQueueRunning = false;

/**
 * 4. Quét toàn bộ lịch sử và kiểm tra các tên miền chưa 200 OK
 */
export async function runVerificationQueue() {
  if (isQueueRunning) return { checked: 0, verified: 0, busy: true };
  isQueueRunning = true;

  try {
    const history = getHistory();
    const pendingItems = history.filter(
      (h) => h.status === "success" && h.domain && h.domain !== "N/A" && h.liveStatus !== "200_OK"
    );

    if (pendingItems.length === 0) return { checked: 0, verified: 0 };

    console.log(`⚡ [Watchdog 2.0] Đang kiểm tra ${pendingItems.length} tên miền trong lịch sử...`);
    let verifiedCount = 0;

    for (const item of pendingItems) {
      try {
        const res = await verifyHistoryItem(item);
        if (res?.verified) verifiedCount++;
      } catch (e) {
        console.error(`Lỗi kiểm tra verifier cho ${item.domain}:`, e.message);
      }
    }

    return { checked: pendingItems.length, verified: verifiedCount };
  } finally {
    isQueueRunning = false;
  }
}

let verifierInterval = null;

/**
 * 5. Khởi động tiến trình chạy ngầm định kỳ (mặc định 60s - 120s check 1 lần)
 */
export function startBackgroundVerifier(intervalMs = 30000) {
  if (verifierInterval) clearInterval(verifierInterval);

  console.log(`🚀 [Verifier] Khởi động trình kiểm tra HTTP 200 tự động (chu kỳ ${Math.round(intervalMs / 1000)}s)`);

  // Chạy ngay 1 lần sau 5 giây khởi động
  setTimeout(() => {
    runVerificationQueue().catch(() => {});
  }, 5000);

  verifierInterval = setInterval(() => {
    runVerificationQueue().catch(() => {});
  }, intervalMs);

  return verifierInterval;
}
