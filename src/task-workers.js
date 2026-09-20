import {
  updateTaskProgress,
  completeTask,
  failTask,
  getTask,
} from "./task-queue.js";
import { checkDomainAvailability, registerDomain, resolveContactId, updateNameservers } from "./spaceship.js";
import {
  setupCloudflare,
  setupDirect302Redirect,
  deleteForwardingPageRules,
  removePagesDomain,
  removeDomainFromAllPagesProjects,
  addPagesDomain,
  getOrCreateZone,
  getZoneNameservers,
} from "./cloudflare.js";
import { getTemplate, updateTemplateDomainsJson, findTemplateByDomain } from "./templates.js";
import { assignDomain, getDomainOwner } from "./ownership.js";
import { deductBalance, topupBalance } from "./wallet.js";
import { addHistoryItem, updateHistoryItem, setHistoryProgress } from "./history.js";
import { verifyHistoryItem } from "./verifier.js";
import { cloneWebsite } from "./scraper.js";
import { smartSetLink, findDomainInRepos, removeDomainFromRepo } from "./repo-scanner.js";
import { resolveInheritedLink } from "./link-resolve.js";
import { assertNotAdminCfDomain } from "./cf-account-guard.js";

/**
 * Worker: Mua tên miền & Deploy (Landing Page hoặc 302)
 */
export async function executeBuyAndDeploy(taskId) {
  const task = getTask(taskId);
  if (!task) return;

  const { domain, link, templateId, isBuy, mode = "LP", userId = "admin", username = null, fullName = null, deductedAmount = 0 } = task.params;
  const historyId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    updateTaskProgress(taskId, 10, "Đang kiểm tra tên miền & tài khoản...", `Bắt đầu xử lý cho ${domain}`, "info");
    assertNotAdminCfDomain(domain);

    const template = templateId ? getTemplate(templateId) : null;
    const templateName = template?.name || (mode === "302" ? "Direct 302 Redirect" : "Mặc định");
    const cnameTarget = template?.cnameTarget || (mode === "302" ? "8.8.8.8" : "web-domain.pages.dev");

    // Thêm vào bảng lịch sử ban đầu (Pending)
    addHistoryItem({
      id: historyId,
      domain,
      actionType: isBuy ? (mode === "302" ? "BUY_302" : "BUY_LP") : (mode === "302" ? "POINT_302" : "POINT_LP"),
      actionLabel: isBuy ? "Mua & Cài đặt tên miền" : "Trỏ tên miền có sẵn",
      templateName,
      templateId: templateId || null,
      cnameTarget,
      link,
      status: "in_progress",
      isBuy: !!isBuy,
      cfAccount: "Đang phát hiện...",
      error: null,
      taskId,
      userId,
      username,
      fullName,
    });

    // 1. Mua tên miền nếu isBuy = true
    if (isBuy) {
      setHistoryProgress(historyId, "Đang mua tên miền trên Spaceship...");
      updateTaskProgress(taskId, 25, "Đang mua tên miền trên Spaceship...", `Gọi Spaceship API đăng ký ${domain}`, "info");
      const contactId = await resolveContactId();
      await registerDomain(domain, contactId);
      updateTaskProgress(taskId, 40, "Đã mua tên miền thành công", `Đăng ký thành công ${domain} trên Spaceship`, "success");
    }

    // 2. Cài đặt Cloudflare
    let cfResult = null;
    if (mode === "302") {
      setHistoryProgress(historyId, "Đang thiết lập Page Rule 302...");
      updateTaskProgress(taskId, 55, "Đang thiết lập Cloudflare Page Rule 302...", "Tạo Page Rule & Proxy DNS 8.8.8.8", "info");
      // Gỡ khỏi LP source nếu trước đó từng gắn Landing Page
      const { findDomainInRepos, removeDomainFromRepo } = await import("./repo-scanner.js");
      const repoMatches = findDomainInRepos(domain);
      for (const m of repoMatches) {
        await removeDomainFromRepo(domain, m.filePath || m.folderPath).catch(() => {});
      }
      cfResult = await setupDirect302Redirect(domain, link);
    } else {
      setHistoryProgress(historyId, "Đang gắn Pages + CNAME Cloudflare...");
      updateTaskProgress(taskId, 55, "Đang thiết lập Zone Cloudflare & DNS CNAME...", "Tạo Zone & kết nối Nameservers", "info");
      cfResult = await setupCloudflare(domain, cnameTarget);
    }

    // 3. Đổi Nameserver trên Spaceship nếu cần
    if (cfResult?.nameservers && Array.isArray(cfResult.nameservers) && cfResult.nameservers.length > 0) {
      try {
        updateTaskProgress(taskId, 70, "Đang cập nhật Nameservers trên Spaceship...", `Nameservers: ${cfResult.nameservers.join(", ")}`, "info");
        await updateNameservers(domain, cfResult.nameservers);
      } catch (err) {
        console.warn(`[Worker] Cảnh báo cập nhật NS trên Spaceship cho ${domain}:`, err.message);
      }
    }

    // 4. Nếu là Landing Page, đồng bộ domains.json & deploy Cloudflare Pages
    if (mode === "LP" && template) {
      updateTaskProgress(taskId, 80, `Đang đồng bộ mã nguồn mẫu [${template.name}]...`, "Ghi domains.json & deploy Pages", "info");
      await updateTemplateDomainsJson(template, domain, link);
    }

    // 5. Gán quyền sở hữu domain cho User
    assignDomain(domain, userId, {
      templateId: templateId || null,
      mode,
      currentLink: link,
    });

    updateTaskProgress(taskId, 90, "Đang kiểm tra phản hồi trực tiếp (Verification)...", "HTTP Health check & SSL", "info");

    // 6. Cập nhật History hoàn tất
    updateHistoryItem(historyId, {
      status: "success",
      cfAccount: cfResult?.accountName || "Cloudflare",
    });

    // Chạy kiểm tra HTTP / chụp ảnh live
    setTimeout(() => {
      verifyHistoryItem(historyId).catch(() => {});
    }, 3000);

    completeTask(
      taskId,
      {
        domain,
        link,
        mode,
        templateName,
        historyId,
        nameservers: cfResult?.nameservers,
      },
      `Đã hoàn tất cài đặt thành công cho tên miền ${domain}!`
    );
  } catch (err) {
    console.error(`[Worker] Lỗi xử lý BuyAndDeploy cho ${domain}:`, err);
    if (isBuy && deductedAmount > 0 && userId !== "admin" && userId !== "u_admin") {
      try {
        topupBalance(userId, deductedAmount, `Hoàn ${deductedAmount} Xu do lỗi mua/cài đặt ${domain}: ${err.message}`, "AUTO_REFUND");
      } catch (refErr) {
        console.error("Lỗi hoàn tiền:", refErr);
      }
    }
    updateHistoryItem(historyId, {
      status: "failed",
      error: err.message,
    });
    failTask(taskId, err, `Lỗi cài đặt ${domain}`);
  }
}

/**
 * Worker: Chuyển đổi 2 chiều giữa 302 Redirect và Landing Page
 */
function buildPagesProjectHints(domain) {
  const hints = new Set();
  const tpl = findTemplateByDomain(domain);
  if (tpl?.pagesProject) hints.add(String(tpl.pagesProject).replace(/\.pages\.dev$/i, "").trim());
  if (tpl?.cnameTarget) hints.add(String(tpl.cnameTarget).replace(/\.pages\.dev$/i, "").trim());
  const owner = getDomainOwner(domain);
  if (owner?.cnameTarget) hints.add(String(owner.cnameTarget).replace(/\.pages\.dev$/i, "").trim());
  if (owner?.templateId) {
    const t = getTemplate(owner.templateId);
    if (t?.pagesProject) hints.add(String(t.pagesProject).replace(/\.pages\.dev$/i, "").trim());
    if (t?.cnameTarget) hints.add(String(t.cnameTarget).replace(/\.pages\.dev$/i, "").trim());
  }
  return [...hints].filter(Boolean);
}

export async function executeSwitchMode(taskId) {
  const task = getTask(taskId);
  if (!task) return;

  const { domain, toMode, templateId, targetUrl, userId = "admin", username = null, fullName = null } = task.params;
  const historyId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const historyBase = {
    id: historyId,
    domain,
    link: targetUrl || "",
    status: "in_progress",
    progress: "Đang khởi tạo...",
    isBuy: false,
    taskId,
    userId,
    username,
    fullName,
  };

  try {
    updateTaskProgress(taskId, 15, `Bắt đầu chuyển đổi ${domain} sang chế độ [${toMode}]...`, `Yêu cầu chuyển đổi sang ${toMode}`, "info");
    addHistoryItem({
      ...historyBase,
      actionType: toMode === "302" ? "SWITCH_302" : "SWITCH_LP",
      actionLabel: toMode === "302" ? "Chuyển sang 302 Redirect" : "Chuyển sang Landing Page",
      templateName: toMode === "302" ? "Direct 302 Redirect" : null,
      templateId: toMode === "302" ? null : templateId,
    });
    // Cho phép zone Admin khi có CLOUDFLARE_ADMIN_API_TOKEN (assert chỉ chặn khi thiếu token)
    assertNotAdminCfDomain(domain);

    if (toMode === "302") {
      // Chuyển sang 302 Direct Redirect
      updateTaskProgress(taskId, 35, "Đang gỡ domain khỏi Cloudflare Pages & domains.json...", "Xóa Custom Domains + LP source", "info");
      const pageHints = buildPagesProjectHints(domain);
      const repoMatches = findDomainInRepos(domain);
      for (const m of repoMatches) {
        await removeDomainFromRepo(domain, m.filePath || m.folderPath).catch(() => {});
      }

      updateTaskProgress(taskId, 65, "Đang cấu hình Page Rule 302 & DNS (tự chọn token Admin/Freze)...", `Đích đến: ${targetUrl}`, "info");
      const cfRes = await setupDirect302Redirect(domain, targetUrl, { hintProjects: pageHints });

      assignDomain(domain, userId, { mode: "302", currentLink: targetUrl, templateId: null });

      updateTaskProgress(taskId, 90, "Đang kiểm tra phản hồi 302...", "Xác thực chuyển hướng Cloudflare", "info");

      updateHistoryItem(historyId, {
        actionType: "SWITCH_302",
        actionLabel: "Chuyển sang 302 Redirect",
        templateName: "Direct 302 Redirect",
        templateId: null,
        cnameTarget: "8.8.8.8",
        link: targetUrl,
        status: "success",
        progress: null,
        cfAccount: cfRes?.accountName || cfRes?.cfAccountType || "Cloudflare",
        error: null,
        details: { cfAccountType: cfRes?.cfAccountType || null },
      });

      setTimeout(() => verifyHistoryItem(historyId).catch(() => {}), 2000);
      completeTask(taskId, { domain, toMode: "302", targetUrl }, `Đã chuyển ${domain} sang 302 Redirect thành công!`);
    } else {
      // Chuyển sang Landing Page
      const template = getTemplate(templateId);
      if (!template) throw new Error("Vui lòng chọn mẫu Landing Page hợp lệ");

      const inherited = await resolveInheritedLink(domain, { providedLink: targetUrl || "" });
      const finalLink = inherited.link;
      if (!finalLink) throw new Error("Thiếu link đích — không tìm được link cũ để kế thừa");

      const owner = getDomainOwner(domain);
      const currentTpl =
        findTemplateByDomain(domain) ||
        (owner?.templateId ? getTemplate(owner.templateId) : null);
      const sameTemplate =
        !!currentTpl &&
        (currentTpl.id === template.id ||
          currentTpl.folder === template.folder ||
          currentTpl.cnameTarget === template.cnameTarget) &&
        (owner?.mode === "LP" || !owner?.mode || owner?.mode === "lp");

      let finalTarget = template.cnameTarget;

      if (sameTemplate) {
        // Đã LP đúng mẫu → chỉ cập nhật domains.json (tránh gỡ Pages → live trống vài phút)
        updateTaskProgress(taskId, 40, `Đã đúng mẫu ${template.name} — chỉ đồng bộ link...`, "Fast path SWITCH_LP", "info");
        await updateTemplateDomainsJson(template, domain, finalLink, inherited.tele || "");
        finalTarget = owner?.cnameTarget || template.cnameTarget;
      } else {
        updateTaskProgress(taskId, 30, "Đang gỡ domain khỏi LP cũ & Page Rules 302...", "Dọn hybrid state", "info");
        const repoMatches = findDomainInRepos(domain);
        for (const m of repoMatches) {
          await removeDomainFromRepo(domain, m.filePath || m.folderPath).catch(() => {});
        }
        await removeDomainFromAllPagesProjects(domain, null, {
          hintProjects: buildPagesProjectHints(domain),
        }).catch(() => {});

        const zone = await getOrCreateZone(domain);
        await deleteForwardingPageRules(zone.id).catch(() => {});

        updateTaskProgress(taskId, 55, `Đang gắn Pages + CNAME tới ${template.cnameTarget}...`, "Cloudflare Pages", "info");
        const cfRes = await setupCloudflare(domain, template.cnameTarget, template.path);
        finalTarget = cfRes?.target || template.cnameTarget;

        updateTaskProgress(taskId, 80, `Đang đồng bộ domains.json vào mẫu ${template.name}...`, "Deploy Cloudflare Pages", "info");
        await updateTemplateDomainsJson(template, domain, finalLink, inherited.tele || "");
      }

      assignDomain(domain, userId, {
        mode: "LP",
        currentLink: finalLink,
        templateId: template.id,
        cnameTarget: finalTarget,
      });

      updateHistoryItem(historyId, {
        actionType: "SWITCH_LP",
        actionLabel: sameTemplate ? "Cập nhật LP (cùng mẫu)" : "Chuyển sang Landing Page",
        templateName: template.name,
        templateId: template.id,
        cnameTarget: finalTarget,
        link: finalLink,
        tele: inherited.tele || "",
        status: "success",
        progress: null,
        cfAccount: "Cloudflare",
        error: null,
        details: { inheritSource: inherited.source, fastPath: sameTemplate },
      });

      setTimeout(() => verifyHistoryItem(historyId).catch(() => {}), 2000);
      completeTask(
        taskId,
        { domain, toMode: "LP", templateName: template.name, targetUrl: finalLink, cnameTarget: finalTarget, fastPath: sameTemplate },
        `Đã chuyển ${domain} sang Landing Page [${template.name}] thành công!`
      );
    }
  } catch (err) {
    console.error(`[Worker] Lỗi SwitchMode cho ${domain}:`, err);
    const msg = String(err.message || "");
    const friendly =
      msg.includes("429") || /rate limit|throttl/i.test(msg)
        ? new Error(
            `Cloudflare đang giới hạn API (quá nhiều thao tác liên tiếp). Chờ 3–5 phút rồi thử chuyển lại — hệ thống sẽ tự retry khi gọi API.`
          )
        : err;
    updateHistoryItem(historyId, {
      status: "failed",
      progress: null,
      error: friendly.message || msg,
    }).catch(() => {});
    failTask(taskId, friendly, `Lỗi chuyển đổi chế độ cho ${domain}`);
  }
}

/**
 * Worker: VIP Web Cloner
 */
export async function executeCloneWebsite(taskId) {
  const task = getTask(taskId);
  if (!task) return;

  const {
    url,
    templateName,
    domain,
    targetUrl,
    isDeploy = false,
    userId = "admin",
    logoData = null,
    faviconData = null,
    pageTitle = "",
    textReplacements = [],
  } = task.params;

  try {
    updateTaskProgress(taskId, 10, `Bắt đầu phân tích và cào mã nguồn từ ${url}...`, "Kết nối máy chủ nguồn", "info");

    const cloneRes = await cloneWebsite({
      url,
      templateName,
      domain,
      targetUrl,
      logoData,
      faviconData,
      pageTitle,
      textReplacements,
      onProgress: (pct, msg) => {
        updateTaskProgress(taskId, pct, msg, msg, "info");
      },
    });

    // Nếu người dùng chọn gán tên miền và deploy ngay
    const isValidDomain = domain && domain.includes(".") && domain.length >= 4;
    if (isValidDomain && isDeploy && cloneRes.template) {
      try {
        updateTaskProgress(taskId, 85, `Đang gán tên miền ${domain} vào mẫu clone mới...`, "Cập nhật domains.json & DNS", "info");
        await setupCloudflare(domain, cloneRes.template.cnameTarget);
        await updateTemplateDomainsJson(cloneRes.template, domain, targetUrl || url);
        assignDomain(domain, userId, { mode: "LP", currentLink: targetUrl || url, templateId: cloneRes.template.id });
      } catch (domErr) {
        updateTaskProgress(taskId, 90, `⚠️ Cảnh báo gán tên miền ${domain}: ${domErr.message}. Mẫu clone vẫn được lưu vào Kho Mẫu.`, "Gán domain thủ công sau", "warning");
      }
    } else if (domain && !isValidDomain) {
      updateTaskProgress(taskId, 85, `⚠️ Tên miền [${domain}] không hợp lệ (cần có đuôi như .com, .top). Bỏ qua bước trỏ DNS. Mẫu clone đã được lưu vào Kho Mẫu.`, "Bỏ qua DNS", "warning");
    }

    completeTask(
      taskId,
      {
        template: cloneRes.template,
        domain: isValidDomain ? domain : null,
        targetUrl,
      },
      `Đã sao chép và đóng gói Landing Page [${cloneRes.template.name}] vào Kho Mẫu thành công!`
    );
  } catch (err) {
    console.error(`[Worker] Lỗi CloneWebsite từ ${url}:`, err);
    // Tự động hoàn lại Xu cho User nếu tác vụ lỗi
    if (task.params.deductedAmount && userId !== "admin" && userId !== "u_admin") {
      try {
        topupBalance(userId, task.params.deductedAmount, `Hoàn ${task.params.deductedAmount} Xu do lỗi sao chép website: ${err.message}`, "AUTO_REFUND");
      } catch (refErr) {
        console.warn(`[Worker] Lỗi hoàn tiền:`, refErr.message);
      }
    }
    failTask(taskId, err, `Lỗi clone website (Đã hoàn lại Xu vào ví)`);
  }
}

/**
 * Worker: Đổi link đích nhanh
 */
export async function executeUpdateLink(taskId) {
  const task = getTask(taskId);
  if (!task) return;

  const { domain, newLink, teleLink, userId = "admin", username = null, fullName = null } = task.params;

  try {
    updateTaskProgress(taskId, 20, `Đang tìm vị trí cấu hình cho ${domain}...`, "Quét Cloudflare Page Rules & Landing Pages", "info");

    const res = await smartSetLink(domain, newLink, teleLink, { userId, username, fullName });

    if (!res?.success) {
      failTask(taskId, new Error(res?.error || "Đổi link thất bại"), res?.error || "Đổi link thất bại");
      return;
    }

    assignDomain(domain, userId, { currentLink: newLink });

    completeTask(
      taskId,
      { domain, newLink, details: res, verified: res.verified, liveLink: res.liveLink },
      res.message || `Live đã khớp link cho ${domain}!`
    );
  } catch (err) {
    console.error(`[Worker] Lỗi UpdateLink cho ${domain}:`, err);
    failTask(taskId, err, `Lỗi đổi link cho ${domain}`);
  }
}
