import { getDomainInfo } from "./spaceship.js";
import { findZoneByName, getZoneNameservers, cfRequest, pagesTokenForAccount } from "./cloudflare.js";
import { findServingTemplate, findServingRepoMatch } from "./repo-scanner.js";
import { getServingPagesProject } from "./pages-domain-map.js";
import { checkDomainHttp, captureDomainScreenshot } from "./verifier.js";
import { normalizeDomain } from "./utils.js";

/**
 * Kiểm tra sức khỏe toàn diện 7 cấp độ cho 1 tên miền
 */
export async function inspectDomainHealth(rawDomain) {
  const domain = normalizeDomain(rawDomain);
  const result = {
    domain,
    timestamp: new Date().toISOString(),
    overallStatus: "UNKNOWN", // HEALTHY | DEGRADED | CRITICAL
    healthScore: 0,
    maxScore: 8,
    healthPercent: 0,
    issues: [],
    checklist: [],
    detectedTemplate: null,
    detectedLink: null,
    detectedTele: null,
    liveScreenshot: null,
    rawDetails: {},
  };

  try {
    // 1. Kiểm tra Spaceship
    let spInfo = null;
    let spError = null;
    try {
      spInfo = await getDomainInfo(domain);
    } catch (e) {
      spError = e.message;
    }

    const isRateLimited = spError && spError.includes("429");
    const isSpRegistered = (!!spInfo && spInfo.lifecycleStatus === "registered") || isRateLimited;
    const spHosts = spInfo?.nameservers?.hosts || [];

    // 2. Kiểm tra Cloudflare Zone
    let cfZone = null;
    try {
      cfZone = await findZoneByName(domain);
    } catch {}

    const zoneNs = cfZone ? getZoneNameservers(cfZone) || [] : [];
    const isZoneActive = cfZone && cfZone.status === "active";

    // 3. So khớp Nameservers
    let nsMatch = false;
    if (zoneNs.length > 0 && spHosts.length > 0) {
      nsMatch = zoneNs.every((h) => spHosts.map((x) => x.toLowerCase()).includes(h.toLowerCase()));
    } else if (isZoneActive && isRateLimited) {
      nsMatch = true; // Zone đã active trên Cloudflare
    }

    // 4. Kiểm tra DNS Records trên Cloudflare
    let dnsRecords = [];
    if (cfZone?.id) {
      try {
        const dnsRes = await cfRequest(`/zones/${cfZone.id}/dns_records`);
        dnsRecords = Array.isArray(dnsRes) ? dnsRes : dnsRes?.result || [];
      } catch {}
    }

    const apexCname = dnsRecords.find(
      (r) => (r.name === domain || r.name === `${domain}.`) && r.type === "CNAME"
    );
    const hasCorrectDns = !!apexCname;

    // 5. Kiểm tra vị trí mã nguồn Repo / Template
    const matchedTpl = findServingTemplate(domain)?.template || null;
    const servingRepo = findServingRepoMatch(domain);
    if (servingRepo) {
      const c = servingRepo.config;
      result.detectedLink = (typeof c === "string" ? c : c?.main_url || c?.url) || null;
      result.detectedTele = (typeof c === "object" && (c?.telegram_url || c?.messenger_url)) || null;
    }
    result.detectedTemplate = matchedTpl ? { id: matchedTpl.id, name: matchedTpl.name, project: matchedTpl.pagesProject, target: matchedTpl.cnameTarget } : null;

    // 6. Kiểm tra Pages Custom Domain Binding across all projects
    let isBoundToPages = false;
    let pagesDomainStatus = "Chưa gắn vào Pages";
    let boundProjectName = null;

    try {
      const serving = getServingPagesProject(domain);
      if (serving?.project) {
        const pagesRes = await cfRequest(
          `/accounts/${serving.accountId}/pages/projects/${encodeURIComponent(serving.project)}/domains/${encodeURIComponent(domain)}`,
          { token: pagesTokenForAccount(serving.accountId) }
        ).catch(() => null);
        boundProjectName = serving.project;
        pagesDomainStatus = pagesRes?.status || "active";
        isBoundToPages = ["active", "pending", "active_redeploying"].includes(pagesDomainStatus);
      }
    } catch {}

    // Kiểm tra tính tương thích giữa DNS CNAME và Pages Project đã gắn
    let isCnameProjectMatched = true;
    if (boundProjectName && apexCname?.content) {
      const cnameHost = apexCname.content.toLowerCase().replace(/\.pages\.dev$/, "").trim();
      const boundHost = boundProjectName.toLowerCase().trim();
      // Nếu CNAME và Project khác nhau hoàn toàn (ví dụ gg88-lp-5uae vs lp-gg88-vip)
      if (cnameHost !== boundHost && !cnameHost.startsWith(boundHost) && !boundHost.startsWith(cnameHost)) {
        isCnameProjectMatched = false;
      }
    }

    // 7. Kiểm tra HTTP 200 & Cloudflare Edge Status
    const httpCheck = await checkDomainHttp(domain);

    // ── TỔNG HỢP CHECKLIST 7 ĐIỂM ──────────────────────────────────────────

    // Điểm 1: Spaceship
    result.checklist.push({
      id: "spaceship_registration",
      title: "1. Đăng Ký Trên Spaceship",
      passed: isSpRegistered,
      statusText: isSpRegistered ? `Đã đăng ký (Hạn: ${spInfo?.expirationDate?.slice(0, 10) || "1 năm"})` : "Chưa đăng ký hoặc lỗi tài khoản",
      detail: isSpRegistered ? `Tên miền đang hoạt động bình thường trên Spaceship.` : `Không tìm thấy thông tin đăng ký: ${spError || "Chưa mua"}`,
      actionGuide: isSpRegistered ? null : "Kiểm tra số dư Spaceship hoặc vào mục Mua Miền để đăng ký mới.",
      severity: isSpRegistered ? "success" : "critical",
    });

    // Điểm 2: Nameservers Spaceship vs Cloudflare
    result.checklist.push({
      id: "nameservers_sync",
      title: "2. Đồng Bộ Nameservers",
      passed: nsMatch,
      statusText: nsMatch ? "Đã trỏ đúng NS Cloudflare" : "NS Spaceship chưa trỏ về Cloudflare",
      detail: `NS Spaceship: [${spHosts.join(", ") || "Chưa có"}] | NS Chuẩn Cloudflare: [${zoneNs.join(", ") || "Chưa tạo Zone"}]`,
      actionGuide: nsMatch ? null : "Hệ thống cần cập nhật 2 Nameservers của Cloudflare vào Spaceship (thường mất 1-3 phút để đồng bộ toàn cầu).",
      severity: nsMatch ? "success" : "critical",
    });

    // Điểm 3: Cloudflare Zone
    result.checklist.push({
      id: "cloudflare_zone",
      title: "3. Cloudflare Zone & Tài Khoản",
      passed: isZoneActive,
      statusText: isZoneActive ? `Zone Hoạt Động (${cfZone.account?.name || "Freze"})` : "Zone chưa kích hoạt hoặc thiếu",
      detail: cfZone ? `Zone ID: ${cfZone.id} (Status: ${cfZone.status})` : "Chưa có Zone trên Cloudflare.",
      actionGuide: isZoneActive ? null : "Cần tạo Zone trên Cloudflare để quản lý bản ghi DNS và chứng chỉ SSL.",
      severity: isZoneActive ? "success" : "warning",
    });

    // Điểm 4: DNS CNAME Records
    const isDnsOk = hasCorrectDns && isCnameProjectMatched;
    result.checklist.push({
      id: "dns_cname",
      title: "4. Bản Ghi DNS CNAME (@)",
      passed: isDnsOk,
      statusText: isDnsOk
        ? `Đã có CNAME Proxied (@ ➔ ${apexCname.content})`
        : (!hasCorrectDns ? "Thiếu bản ghi CNAME @" : `⚠️ Lệch CNAME so với Pages Project [${boundProjectName || "N/A"}]`),
      detail: `Apex (@): ${apexCname ? `CNAME -> ${apexCname.content} (Proxy: ${apexCname.proxied})` : "❌ Thiếu"}`,
      actionGuide: isDnsOk ? null : (hasCorrectDns ? `Đổi CNAME trỏ về [${boundProjectName}.pages.dev] để khớp với dự án Pages.` : "Cần tạo bản ghi CNAME cho @ trỏ về subdomain Pages."),
      severity: isDnsOk ? "success" : "critical",
    });

    // Điểm 5: Cloudflare Pages Custom Domain
    const isPagesOk = isBoundToPages && isCnameProjectMatched;
    result.checklist.push({
      id: "pages_binding",
      title: "5. Gắn Tên Miền Vào Cloudflare Pages",
      passed: isPagesOk,
      statusText: isPagesOk
        ? (pagesDomainStatus === "pending"
            ? `Đã gắn vào [${boundProjectName}] (Đang cấp phát SSL)`
            : `Đã gắn & kích hoạt trên [${boundProjectName}]`)
        : (boundProjectName ? `Trạng thái: [${boundProjectName}] (${pagesDomainStatus})` : "Chưa gắn vào project Pages nào"),
      detail: isPagesOk
        ? (pagesDomainStatus === "pending"
            ? "Cloudflare Pages đã nhận diện tên miền và đang hoàn tất kích hoạt định tuyến chứng chỉ SSL."
            : "Cloudflare Pages đã nhận diện tên miền và đang định tuyến lưu lượng trực tiếp.")
        : "Cần gỡ liên kết cũ bị kẹt và gắn lại vào Pages Project còn dung lượng trống.",
      actionGuide: isPagesOk ? null : "Gỡ tên miền khỏi project cũ và đăng ký mới vào project Pages đang chạy.",
      severity: isPagesOk ? "success" : "critical",
    });

    // Điểm 6: Mã nguồn & domains.json
    const hasRepoConfig = !!servingRepo && !!result.detectedLink;
    result.checklist.push({
      id: "source_config",
      title: "6. Cấu Hình Mã Nguồn & domains.json",
      passed: hasRepoConfig,
      statusText: hasRepoConfig ? `Đã cấu hình trong [${matchedTpl?.name || "?"}]` : "Chưa có link đích trong domains.json",
      detail: hasRepoConfig ? `Link đích: ${result.detectedLink} (Thư mục: ${servingRepo.folderPath})` : "Cần ghi link đích vào file domains.json và deploy.",
      actionGuide: hasRepoConfig ? null : "Vào mục Quản Lý Domain hoặc Đổi Mẫu để chọn giao diện và link đích.",
      severity: hasRepoConfig ? "success" : "warning",
    });

    // Điểm 7: Kiểm tra HTTP thực tế
    result.checklist.push({
      id: "http_live",
      title: "7. Kết Nối Mạng Thực Tế (HTTP 200)",
      passed: httpCheck.is200,
      statusText: httpCheck.is200 ? "HTTP 200 OK - Trang web phản hồi tốt" : `Chưa kết nối (${httpCheck.error || `HTTP ${httpCheck.status}`})`,
      detail: httpCheck.is200
        ? "Trang web phản hồi tốt, kết nối SSL mã hoá an toàn và phân phối tốc độ cao."
        : (httpCheck.status === 522
            ? "Lỗi 522 (Origin Connection Timeout): Xảy ra do CNAME và Pages Custom Domain bị lệch nhau hoặc SSL đang khởi tạo."
            : `Lỗi hiện tại: ${httpCheck.error || `HTTP ${httpCheck.status}`}`),
      actionGuide: httpCheck.is200 ? null : "Chạy 1-Click Auto Fix để tự động căn chỉnh lại toàn bộ CNAME, Pages Binding và triển khai mã nguồn.",
      severity: httpCheck.is200 ? "success" : "critical",
    });

    // Điểm 8: Kiểm tra Link Đích Thực Tế Trên Server (Live Target URL Sync)
    let isLiveLinkMatched = false;
    let liveDetectedUrl = null;
    let liveLinkDetail = "";
    let liveLinkStatusText = "";
    let liveLinkGuide = null;

    if (httpCheck.is200) {
      try {
        const liveDjRes = await fetch(`https://${domain}/domains.json`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
        if (liveDjRes && liveDjRes.ok) {
          const liveDj = await liveDjRes.json().catch(() => null);
          if (liveDj) {
            const rawEntry = liveDj[domain] || liveDj[domain.replace(/^www\./, "")];
            if (rawEntry) {
              liveDetectedUrl = rawEntry.main_url || rawEntry.url || "";
            }
          }
        }
      } catch {}

      const normExpected = (result.detectedLink || "").trim().toLowerCase().replace(/\/$/, "");

      if (liveDetectedUrl) {
        const normLive = liveDetectedUrl.trim().toLowerCase().replace(/\/$/, "");
        if (!normExpected || normLive === normExpected) {
          isLiveLinkMatched = true;
          liveLinkStatusText = `Đã nạp đúng link đích (${liveDetectedUrl})`;
          liveLinkDetail = `Cloudflare Pages đã nhận diện tên miền và nạp chính xác URL đích: ${liveDetectedUrl}`;
        } else {
          isLiveLinkMatched = false;
          liveLinkStatusText = `⚠️ Lệch link đích trên server: ${liveDetectedUrl}`;
          liveLinkDetail = `Cấu hình mong muốn là [${result.detectedLink}] nhưng Cloudflare Pages đang phục vụ [${liveDetectedUrl}]`;
          liveLinkGuide = "Bấm '1-Click Auto Fix' để đồng bộ lại link đích vào file domains.json và Deploy lại lên Cloudflare Pages.";
        }
      } else {
        // Kiểm tra xem có phải 302 rule không
        const is302Rule = !servingRepo;
        if (is302Rule && result.detectedLink) {
          isLiveLinkMatched = true;
          liveLinkStatusText = `Chuyển hướng trực tiếp 302: ${result.detectedLink}`;
          liveLinkDetail = `Tên miền được cấu hình chuyển hướng trực tiếp qua Cloudflare Page Rule 302.`;
        } else {
          isLiveLinkMatched = false;
          liveLinkStatusText = `❌ Chưa nạp link đích vào Pages (Khách bị rơi vào link mặc định)`;
          liveLinkDetail = `Tên miền đã 200 OK nhưng chưa có trong file domains.json của dự án Pages đang chạy. Khách truy cập sẽ bị chuyển hướng sang link mặc định dự phòng thay vì: ${result.detectedLink || "N/A"}`;
          liveLinkGuide = "Bấm '1-Click Auto Fix' để tự động nạp link đích vào đúng dự án Pages và kích hoạt Deploy.";
        }
      }
    } else {
      liveLinkStatusText = "Chưa thể kiểm tra do chưa kết nối được HTTP 200";
      liveLinkDetail = "Cần khắc phục kết nối HTTP 200 trước khi kiểm tra chuyển hướng thực tế.";
      liveLinkGuide = "Chạy 1-Click Auto Fix để xử lý DNS và liên kết Pages.";
    }

    result.checklist.push({
      id: "live_link_sync",
      title: "8. Kiểm Tra Link Đích Thực Tế (Live Target URL)",
      passed: isLiveLinkMatched,
      statusText: liveLinkStatusText,
      detail: liveLinkDetail,
      actionGuide: isLiveLinkMatched ? null : liveLinkGuide,
      severity: isLiveLinkMatched ? "success" : "critical",
    });

    // Tính điểm
    const passedCount = result.checklist.filter((c) => c.passed).length;
    result.healthScore = passedCount;
    result.healthPercent = Math.round((passedCount / result.maxScore) * 100);

    if (passedCount === result.maxScore) {
      result.overallStatus = "HEALTHY";
    } else if (passedCount >= 4) {
      result.overallStatus = "DEGRADED";
    } else {
      result.overallStatus = "CRITICAL";
    }

    // Tổng hợp danh sách lỗi cụ thể
    result.checklist.forEach((c) => {
      if (!c.passed) {
        result.issues.push({
          title: c.title,
          statusText: c.statusText,
          detail: c.detail,
          actionGuide: c.actionGuide,
          severity: c.severity,
        });
      }
    });

    return result;
  } catch (err) {
    result.overallStatus = "ERROR";
    result.error = err.message;
    return result;
  }
}
