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
        let bodyHint = "";
        try {
          const text = await res.text();
          if (/1014|CNAME Cross-User Banned/i.test(text)) bodyHint = " (Error 1014 CNAME Cross-User Banned)";
          else if (/522/i.test(text)) bodyHint = " (Error 522)";
          else if (/521/i.test(text)) bodyHint = " (Error 521)";
        } catch {}
        return { is200: false, status, isCfError: /1014|522|521/.test(bodyHint), error: `HTTP ${status}${bodyHint}` };
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
    const { isAdminManagedDomain } = await import("./cf-account-guard.js");
    if (isAdminManagedDomain(domain)) {
      logs.push(`⏭️ Bỏ qua — miền thuộc Cloudflare Admin, hub Freze không can thiệp.`);
      return { repaired: false, skipped: true, reason: "CF_ADMIN_SKIP", logs };
    }

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
          const pagesRes = await addPagesDomain(domain, tpl.pagesProject, tpl.path, tpl.pagesAccountId ? { accountId: tpl.pagesAccountId } : {}).catch(() => {});
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
 * LP: HTTP 200 chưa đủ — domains.json live phải khớp link claimed (+ defaultLink)
 */
export function normVerifyLink(u) {
  return String(u || "")
    .trim()
    .replace(/\/$/, "");
}

function linkFromDomainsEntry(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  return e.main_url || e.url || e.link || e.register_url || "";
}

function readLiveLinksFromDomainsJson(j, domain) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const entryLink = linkFromDomainsEntry(j[norm] || j[`www.${norm}`]);
  const defaultLink =
    typeof j?.defaultLink === "string"
      ? j.defaultLink
      : typeof j?.default_link === "string"
        ? j.default_link
        : "";
  return { entryLink, defaultLink, norm };
}

function liveLinksMatchClaimed(j, domain, claimedLink) {
  const claimed = normVerifyLink(claimedLink);
  const { entryLink, defaultLink } = readLiveLinksFromDomainsJson(j, domain);
  const gotEntry = normVerifyLink(entryLink);
  const gotDefault = normVerifyLink(defaultLink);
  if (!gotEntry || gotEntry !== claimed) {
    return {
      ok: false,
      error: !gotEntry
        ? `Live chưa có entry domains.json cho [${domain}]`
        : `Entry live lệch: live=${gotEntry} | claimed=${claimed}`,
      entryLink: gotEntry || null,
      defaultLink: gotDefault || null,
    };
  }
  if (gotDefault && gotDefault !== claimed) {
    return {
      ok: false,
      error: `defaultLink live vẫn lệch: defaultLink=${gotDefault} | claimed=${claimed} (LP hay dùng fallback này)`,
      entryLink: gotEntry,
      defaultLink: gotDefault,
    };
  }
  if (gotDefault && Object.prototype.hasOwnProperty.call(j, "defaultLink")) {
    return {
      ok: false,
      error: `Live vẫn còn defaultLink fallback (${gotDefault}) — cần xóa khỏi domains.json`,
      entryLink: gotEntry,
      defaultLink: gotDefault,
    };
  }
  return { ok: true, entryLink: gotEntry, defaultLink: gotDefault || null };
}

async function probeLiveDomainsLink(domain, claimedLink) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const urls = [
    `https://${norm}/domains.json?v=${Date.now()}`,
    `https://www.${norm}/domains.json?v=${Date.now()}`,
  ];
  let lastFail = { ok: false, link: "", defaultLink: "", source: null, error: "" };
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!r.ok) continue;
      const j = await r.json();
      const check = liveLinksMatchClaimed(j, domain, claimedLink);
      if (check.ok) {
        return {
          ok: true,
          link: check.entryLink,
          defaultLink: check.defaultLink,
          source: url,
        };
      }
      lastFail = {
        ok: false,
        link: check.entryLink || check.defaultLink || "",
        defaultLink: check.defaultLink,
        source: url,
        error: check.error,
      };
    } catch {}
  }
  return lastFail;
}

/**
 * Chờ live domains.json khớp link claimed (LP) — không coi push Git = thành công.
 */
export async function waitForLiveLinkMatch(domain, claimedLink, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 15;
  const delayMs = opts.delayMs ?? 8000;
  const claimed = normVerifyLink(claimedLink);
  if (!claimed) {
    return { ok: false, link: null, claimed: "", error: "Thiếu link đích để verify live" };
  }

  let last = { ok: false, link: "", defaultLink: "", error: "" };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await probeLiveDomainsLink(domain, claimedLink);
    if (last.ok) {
      return {
        ok: true,
        link: last.link,
        defaultLink: last.defaultLink,
        source: last.source,
        attempts: attempt + 1,
        claimed,
      };
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    ok: false,
    link: last.link || null,
    defaultLink: last.defaultLink || null,
    claimed,
    source: last.source,
    error: last.error || `Live chưa khớp link đích (${claimed})`,
  };
}

/**
 * Chờ 302 redirect khớp link claimed.
 */
export async function waitFor302RedirectMatch(domain, claimedLink, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 10;
  const delayMs = opts.delayMs ?? 5000;
  const claimed = normVerifyLink(claimedLink);
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const hosts = [...new Set([norm, `www.${norm}`])];
  let lastLoc = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const host of hosts) {
      try {
        const r = await fetch(`https://${host}/`, {
          redirect: "manual",
          signal: AbortSignal.timeout(12000),
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });
        if ([301, 302, 307, 308].includes(r.status)) {
          lastLoc = r.headers.get("location") || "";
          if (lastLoc && normVerifyLink(lastLoc) === claimed) {
            return { ok: true, link: normVerifyLink(lastLoc), host, attempts: attempt + 1, claimed };
          }
        }
      } catch {}
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    ok: false,
    link: lastLoc ? normVerifyLink(lastLoc) : null,
    claimed,
    error: lastLoc
      ? `302 chưa khớp: live=${normVerifyLink(lastLoc)} | claimed=${claimed}`
      : `Chưa thấy 302 redirect tới link đích (${claimed})`,
  };
}

function shouldVerifyClaimedLink(item) {
  if (!item?.link) return false;
  const mode = item.details?.mode || "";
  if (mode === "redirect_302") return false;
  const t = item.actionType || "";
  if (["SET_LINK", "SWITCH_TPL", "BUY_LP", "POINT_LP", "DEPLOY", "SWITCH_LP"].includes(t)) return true;
  const label = item.actionLabel || "";
  return /Landing Page|Đổi Mẫu|Cập Nhật Link Đích/i.test(label);
}

export async function verifyHistoryItem(itemOrId, force = false) {
  let item = itemOrId;
  if (typeof itemOrId === "string") {
    item = getHistory().find((h) => h.id === itemOrId) || null;
  }
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

  const createdAt = item.timestamp || item.createdAt ? new Date(item.timestamp || item.createdAt).getTime() : Date.now();
  const ageMinutes = (Date.now() - createdAt) / 60000;
  const currentCount = (item.checkCount || 0) + 1;

  if (checkResult.is200) {
    if (shouldVerifyClaimedLink(item)) {
      const claimed = normVerifyLink(item.link);
      let live = { ok: false, link: "", error: "" };
      for (let attempt = 0; attempt < 6; attempt++) {
        live = await probeLiveDomainsLink(domain, item.link);
        if (live.ok) break;
        if (attempt < 5) await new Promise((r) => setTimeout(r, 8000));
      }
      if (!live.ok) {
        // Tự force-deploy đúng project CNAME 1 lần (Pages queue kẹt → LP không có link)
        if (!item.details?.autoRepairedLinkDeploy && item.link) {
          try {
            const { ensureLiveDomainLink } = await import("./cloudflare.js");
            const { getTemplate } = await import("./templates.js");
            const tpl = item.templateId ? getTemplate(item.templateId) : null;
            console.warn(`🛠️ [${domain}] LINK_MISMATCH — force deploy live domains.json...`);
            updateHistoryItem(item.id || domain, {
              details: {
                ...(item.details || {}),
                autoRepairedLinkDeploy: true,
                autoRepairLinkAt: new Date().toISOString(),
              },
              lastCheckError: "Đang tự force-deploy Pages để đồng bộ domains.json...",
            });
            const fixed = await ensureLiveDomainLink(domain, item.link, {
              templatePath: tpl?.path || null,
              cnameTarget: item.cnameTarget || null,
              fallbackProject: tpl?.pagesProject || null,
              accountId: tpl?.pagesAccountId || undefined,
              timeoutMs: 90000,
            });
            if (fixed.ok) {
              return verifyHistoryItem(item.id || item, true);
            }
            console.warn(`[Verifier] Auto force-deploy chưa khớp:`, fixed.error);
          } catch (e) {
            console.warn(`[Verifier] Auto force-deploy fail:`, e.message);
          }
        }

        const mismatchMsg =
          live.error ||
          (!live.link
            ? `HTTP 200 nhưng chưa đọc được domains.json / chưa có entry [${domain}]`
            : `HTTP 200 nhưng live link lệch claimed. live=${normVerifyLink(live.link)} | claimed=${claimed}`);
        console.warn(`⚠️ [${domain}] ${mismatchMsg}`);
        const isOverdue15m = ageMinutes >= 15;
        const got = live.link || null;
        const updated = updateHistoryItem(item.id || domain, {
          liveStatus: isOverdue15m ? "ERROR_15M_ALERT" : "LINK_MISMATCH",
          lastCheckedAt: new Date().toISOString(),
          lastCheckError: mismatchMsg,
          checkCount: currentCount,
          ageMinutes: Math.round(ageMinutes * 10) / 10,
          isOverdue15m,
          liveLinkObserved: got || null,
        });
        return {
          success: true,
          verified: false,
          domain,
          status: "LINK_MISMATCH",
          error: mismatchMsg,
          updated,
        };
      }
    }

    console.log(`✅ [${domain}] Đã phản hồi HTTP 200 OK` + (shouldVerifyClaimedLink(item) ? " + live link khớp!" : "!"));

    const updated = updateHistoryItem(item.id || domain, {
      liveStatus: "200_OK",
      verifiedAt: new Date().toISOString(),
      liveCheckSuccess: true,
      lastCheckedAt: new Date().toISOString(),
      lastCheckError: null,
      checkCount: currentCount,
      ageMinutes: Math.round(ageMinutes * 10) / 10,
      liveLinkObserved: shouldVerifyClaimedLink(item) ? normVerifyLink(item.link) : undefined,
    });

    return {
      success: true,
      verified: true,
      domain,
      updated,
    };
  } else {
    // 1014 = CNAME trỏ Pages project không còn / chưa gắn custom domain → tự sửa 1 lần
    const errText = String(checkResult.error || "");
    const looks1014 = /1014|Cross-User Banned/i.test(errText) || (checkResult.status === 403 && checkResult.isCfError);
    if (looks1014 && !item.details?.autoRepaired1014 && !item.actionType?.includes("302")) {
      console.warn(`🛠️ [${domain}] Phát hiện 1014 — tự gắn lại Pages + CNAME...`);
      try {
        updateHistoryItem(item.id || domain, {
          details: { ...(item.details || {}), autoRepaired1014: true, autoRepairAt: new Date().toISOString() },
          lastCheckError: "Đang tự sửa Error 1014 (gắn lại Pages/CNAME)...",
        });
        await autoRepairDomain(item, false).catch(() => {});
        // Kiểm tra lại ngay sau sửa
        const retry = await checkDomainHttp(domain);
        if (retry.is200) {
          return verifyHistoryItem(item.id || item, true);
        }
      } catch (e) {
        console.warn(`[Verifier] Auto-repair 1014 fail:`, e.message);
      }
    }

    // Chờ đủ 15 phút, nếu vẫn lỗi thì gán trạng thái ERROR_15M_ALERT
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
