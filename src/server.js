import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTemplates, getTemplate, findTemplateByDomain, updateTemplateDomainsJson } from "./templates.js";
import { checkDomainAvailability, registerDomain, resolveContactId, updateNameservers, getDomainInfo, quoteSpaceshipPurchase, assertSpaceshipBuyConfirmed } from "./spaceship.js";
import {
  setupCloudflare,
  setupDirect302Redirect,
  updateOrCreatePageRule,
  findZoneByName,
  getOrCreateZone,
  getZoneNameservers,
  ensurePagesCname,
  addPagesDomain,
  deleteForwardingPageRules,
  findActiveForwardingRule,
  removePagesDomain,
  removeDomainFromAllPagesProjects,
  waitForPagesDomainActive,
  tokenForZone,
  cfRequest,
  resolvePagesAccountIdForDomain,
} from "./cloudflare.js";
import { resolveInheritedLink } from "./link-resolve.js";
import { normalizeDomain, normalizeUrl, extractDomainsFromText } from "./utils.js";
import { findDomainInRepos, checkDomainCfAccount, updateDomainInExactRepos, listAllDomains, removeDomainFromRepo, smartSetLink, detectBrandFromDomain, invalidateDomainListCache } from "./repo-scanner.js";
import { adminSkipPayload, listHubZonesFromCache, isAdminCfZone, invalidateCfZoneCacheMem } from "./cf-account-guard.js";
import { invalidateOwnershipCache } from "./ownership.js";
import { invalidateEnrichedDomainsCache, queryEnrichedDomainsList } from "./domains-list-service.js";
import { logAdminAction, listAdminAudit } from "./admin-audit.js";
import { getHistory, addHistoryItem, updateHistoryItem, clearHistory, setHistoryProgress, reconcileStaleHistory } from "./history.js";
import { verifyHistoryItem, runVerificationQueue, startBackgroundVerifier, autoRepairDomain } from "./verifier.js";
import { inspectDomainHealth } from "./health-checker.js";

// Khóa chống trùng lặp tiến trình mua/cài đặt đồng thời cho cùng 1 tên miền
const activeDeployLocks = new Set();

/** opts Pages: template.pagesAccountId hoặc suy ra theo zone (Admin→Admin Pages nếu có project) */
async function pagesOptsForTemplate(domain, template) {
  const accountId = await resolvePagesAccountIdForDomain(
    domain,
    template?.pagesProject || template?.cnameTarget || "",
    template?.pagesAccountId || null
  );
  return { accountId };
}

/** Đổi lỗi Spaceship (thiếu tiền / payment) thành message rõ cho UI */
function friendlySpaceshipBuyError(raw) {
  const msg = String(raw || "");
  const low = msg.toLowerCase();
  if (
    low.includes("payment method is not available") ||
    low.includes("enough funds") ||
    low.includes("insufficient") ||
    (low.includes("balance") && low.includes("spaceship"))
  ) {
    return `❌ MUA THẤT BẠI — Spaceship hết tiền / không thanh toán được. Nạp balance Spaceship rồi mua lại. Chi tiết: ${msg}`;
  }
  if (low.includes("zone.create") || low.includes("create zones")) {
    return `❌ Tên miền có thể đã mua xong, nhưng Cloudflare token thiếu quyền tạo Zone (zone.create). Tạo Zone trong CF Dashboard hoặc cấp token Freze đủ quyền Zone:Edit rồi chạy lại Trỏ LP (không cần mua lại). Chi tiết: ${msg}`;
  }
  if (low.includes("spaceship operation failed") || low.includes("spaceship api")) {
    return `❌ MUA THẤT BẠI — ${msg}`;
  }
  return msg;
}





import {
  createTask,
  updateTaskProgress,
  completeTask,
  failTask,
  getTask,
  listTasks,
} from "./task-queue.js";
import {
  executeBuyAndDeploy,
  executeSwitchMode,
  executeCloneWebsite,
  executeUpdateLink,
} from "./task-workers.js";
import {
  login,
  register,
  verifyToken,
  listUsers,
  getUserById,
  createUserByAdmin,
  updateUserByAdmin,
  deleteUserByAdmin,
} from "./auth.js";
import {
  getBalance,
  getPricing,
  updatePricing,
  topupBalance,
  deductBalance,
  getTransactions,
  calculateDomainPrice,
  calculateDomainPriceDetail,
  generateVietQrInfo,
  getBankConfig,
  updateBankConfig,
  processBankWebhook,
  calculateDomainPriceRule,
} from "./wallet.js";
import {
  assignDomain,
  unassignDomain,
  getDomainOwner,
  listUserDomainNames,
  listAllAssignments,
  canUserManageDomain,
  getUserDomainsDetails,
  syncDeployOwnership,
  resolveDeployOwnerUserId,
  syncDeployOwnershipPreserve,
} from "./ownership.js";
import {
  createDomainRequest,
  listDomainRequests,
  getDomainRequestById,
  approveDomainRequest,
  rejectDomainRequest,
} from "./domain-requests.js";
import {
  createDomainOrder,
  listDomainOrders,
  getDomainOrderById,
  approveDomainOrder,
  rejectDomainOrder,
  markDomainOrderFulfilled,
} from "./domain-orders.js";
import { cloneWebsite } from "./scraper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const FRONTEND_DIST_DIR = path.join(ROOT_DIR, "frontend", "dist");
const SCREENSHOTS_DIR = path.join(ROOT_DIR, "screenshots");
const DATA_DIR = path.join(ROOT_DIR, "data");

function resolveWebRoot() {
  // Local/production UX: serve polished public/ UI by default.
  // React (frontend/dist) only when explicitly enabled.
  if (process.env.SERVE_REACT === "1" && fs.existsSync(path.join(FRONTEND_DIST_DIR, "index.html"))) {
    return FRONTEND_DIST_DIR;
  }
  return PUBLIC_DIR;
}

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  res.end(JSON.stringify(data));
}

function serveStaticFile(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  fs.createReadStream(filePath).pipe(res);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Dữ liệu JSON không hợp lệ"));
      }
    });
    req.on("error", reject);
  });
}

function requireAdmin(res, currentUser) {
  if (!currentUser || currentUser.role !== "admin") {
    sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền thực hiện thao tác này" });
    return false;
  }
  return true;
}

/** User thường không được mua miền trực tiếp — phải qua domain-orders + admin duyệt */
function rejectNonAdminDirectBuy(res, currentUser, isBuy) {
  if (isBuy && currentUser?.role !== "admin") {
    sendJson(res, 403, {
      success: false,
      error: "User thường phải tạo đơn mua qua /api/domain-orders và chờ Admin duyệt. Không mua trực tiếp.",
      requireOrder: true,
    });
    return true;
  }
  return false;
}

function getAuthUser(req) {
  const authHeader = req.headers["authorization"] || "";
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const queryToken = parsedUrl.searchParams.get("token");
  const token = (authHeader.replace(/^Bearer\s+/i, "") || queryToken || "").trim();
  if (!token) return null;
  const session = verifyToken(token);
  return session || null;
}

function invalidateHubDomainCaches() {
  invalidateDomainListCache();
  invalidateEnrichedDomainsCache();
  invalidateCfZoneCacheMem();
  invalidateOwnershipCache();
}

function filterHistoryForUser(history, user) {
  if (user.role === "admin") return history;
  const allowedDomains = new Set(listUserDomainNames(user.userId) || []);
  return history.filter((h) => h.userId === user.userId || allowedDomains.has(h.domain));
}

function historyMatchesQuery(h, q) {
  if (!q) return true;
  const query = q.toLowerCase();
  return (
    (h.domain && h.domain.toLowerCase().includes(query)) ||
    (h.actionLabel && h.actionLabel.toLowerCase().includes(query)) ||
    (h.actionType && h.actionType.toLowerCase().includes(query)) ||
    (h.templateName && h.templateName.toLowerCase().includes(query)) ||
    (h.link && h.link.toLowerCase().includes(query)) ||
    (h.username && h.username.toLowerCase().includes(query)) ||
    (h.userId && String(h.userId).toLowerCase().includes(query)) ||
    (h.fullName && h.fullName.toLowerCase().includes(query)) ||
    (h.id && String(h.id).toLowerCase().includes(query))
  );
}

function computeHistoryStats(history) {
  const completed = history.filter((h) => h.status !== "in_progress" && h.status !== "pending");
  return {
    total: completed.length,
    live: completed.filter((h) => h.liveStatus === "200_OK").length,
    buy: completed.filter((h) => h.actionType && h.actionType.startsWith("BUY")).length,
    lp: completed.filter((h) => h.actionType && (h.actionType.includes("LP") || h.actionType.includes("TPL"))).length,
  };
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const currentUser = getAuthUser(req);

  // Gating protected API routes: All /api/* except public auth/webhook endpoints require a valid token
  const publicApiPaths = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/templates",
    "/api/wallet/webhook-pay",
    "/api/check-domain",
    "/api/check-domains-batch",
  ];
  // simulate-pay KHÔNG còn public — chỉ admin + ALLOW_SIMULATE_PAY=true
  if (pathname.startsWith("/api/") && !publicApiPaths.includes(pathname)) {
    if (!currentUser) {
      sendJson(res, 401, { success: false, error: "Yêu cầu đăng nhập hoặc phiên làm việc đã hết hạn" });
      return;
    }
  }

  // ── 1. AUTHENTICATION & USER RBAC ──────────────────────────────────────────
  // POST /api/auth/login
  if (req.method === "POST" && pathname === "/api/auth/login") {
    try {
      const body = await parseBody(req);
      const result = login(body.username || "", body.password || "");
      const balance = getBalance(result.user.id);
      sendJson(res, 200, { success: true, ...result, balance });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/auth/register
  if (req.method === "POST" && pathname === "/api/auth/register") {
    try {
      const body = await parseBody(req);
      const registerRes = register({
        username: body.username,
        password: body.password,
        fullName: body.fullName,
        role: "user",
      });
      sendJson(res, 200, { success: true, ...registerRes, balance: 0 });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/auth/me
  if (req.method === "GET" && pathname === "/api/auth/me") {
    const balance = getBalance(currentUser.userId);
    sendJson(res, 200, {
      success: true,
      user: {
        id: currentUser.userId,
        username: currentUser.username,
        fullName: currentUser.fullName,
        role: currentUser.role,
      },
      balance,
    });
    return;
  }

  // GET /api/admin/users
  if (req.method === "GET" && pathname === "/api/admin/users") {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền xem danh sách người dùng" });
      return;
    }
    const users = listUsers().map((u) => ({
      ...u,
      balance: getBalance(u.id),
      domainCount: (listUserDomainNames(u.id) || []).length,
    }));
    sendJson(res, 200, { success: true, users });
    return;
  }

  // POST /api/admin/users/create (Admin tạo tài khoản mới)
  if (req.method === "POST" && pathname === "/api/admin/users/create") {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền tạo người dùng" });
      return;
    }
    try {
      const body = await parseBody(req);
      const newUser = createUserByAdmin(body);
      if (body.initialBalance && body.initialBalance > 0) {
        topupBalance(newUser.id, body.initialBalance, "Cấp vốn ban đầu từ Admin", currentUser.username);
      }
      logAdminAction({
        action: "USER_CREATE",
        actor: currentUser,
        target: { userId: newUser.id, username: newUser.username },
        summary: `Tạo thành viên @${newUser.username} (role=${newUser.role})`,
        details: {
          role: newUser.role,
          fullName: newUser.fullName,
          initialBalance: body.initialBalance || 0,
          passwordSet: true,
        },
      });
      sendJson(res, 200, { success: true, user: newUser });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/admin/users/update (Admin sửa thông tin người dùng)
  if (req.method === "POST" && pathname === "/api/admin/users/update") {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền sửa người dùng" });
      return;
    }
    try {
      const body = await parseBody(req);
      const before = getUserById(body.userId);
      const updated = updateUserByAdmin(body.userId, body);
      const details = {};
      if (body.fullName !== undefined) details.fullName = { from: before?.fullName, to: updated.fullName };
      if (body.role !== undefined) details.role = { from: before?.role, to: updated.role };
      if (body.status !== undefined) details.status = { from: before?.status, to: updated.status };
      if (body.password) details.passwordChanged = true;
      let action = "USER_UPDATE";
      if (body.password && Object.keys(details).length === 1) action = "PASSWORD_RESET";
      else if (body.role !== undefined && before?.role !== updated.role) action = "ROLE_CHANGE";
      else if (body.status !== undefined && before?.status !== updated.status) action = "STATUS_CHANGE";
      logAdminAction({
        action,
        actor: currentUser,
        target: { userId: updated.id, username: updated.username },
        summary: `Sửa thành viên @${updated.username} (${action})`,
        details,
      });
      sendJson(res, 200, { success: true, user: updated });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/admin/users/delete (Admin xóa người dùng)
  if (req.method === "POST" && pathname === "/api/admin/users/delete") {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền xóa người dùng" });
      return;
    }
    try {
      const body = await parseBody(req);
      const before = getUserById(body.userId);
      deleteUserByAdmin(body.userId);
      logAdminAction({
        action: "USER_DELETE",
        actor: currentUser,
        target: { userId: body.userId, username: before?.username || null },
        summary: `Xóa thành viên @${before?.username || body.userId}`,
        details: { role: before?.role, status: before?.status },
      });
      sendJson(res, 200, { success: true, message: "Đã xóa người dùng thành công" });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // ── 2. WALLET, VIETQR & BANK WEBHOOKS ─────────────────────────────────────
  // GET /api/wallet/balance
  if (req.method === "GET" && pathname === "/api/wallet/balance") {
    const balance = getBalance(currentUser.userId);
    const pricing = getPricing();
    sendJson(res, 200, { success: true, balance, pricing });
    return;
  }

  // GET /api/wallet/qr-code (Tạo mã VietQR động cho người dùng theo Xu: 100k = 100 Xu)
  if (req.method === "GET" && pathname === "/api/wallet/qr-code") {
    const amountXu = parseFloat(parsedUrl.searchParams.get("amount") || parsedUrl.searchParams.get("xu") || "100");
    let targetUsername = parsedUrl.searchParams.get("username") || currentUser.username || "admin";
    // User thường không được tạo QR nạp hộ người khác
    if (currentUser.role !== "admin") {
      targetUsername = currentUser.username;
    }
    const qrData = generateVietQrInfo(targetUsername, amountXu);
    sendJson(res, 200, { success: true, ...qrData });
    return;
  }

  // POST /api/wallet/webhook-pay (Tự động nhận tiền từ Ngân Hàng qua Webhook)
  if (req.method === "POST" && pathname === "/api/wallet/webhook-pay") {
    try {
      const secret = (process.env.WALLET_WEBHOOK_SECRET || "").trim();
      if (!secret) {
        sendJson(res, 503, { success: false, error: "Webhook chưa cấu hình WALLET_WEBHOOK_SECRET" });
        return;
      }
      const provided =
        (req.headers["x-webhook-secret"] || "").toString().trim() ||
        (req.headers["authorization"] || "").toString().replace(/^Bearer\s+/i, "").trim();
      if (!provided || provided !== secret) {
        sendJson(res, 401, { success: false, error: "Webhook secret không hợp lệ" });
        return;
      }
      const body = await parseBody(req);
      const result = processBankWebhook(body);
      sendJson(res, 200, { success: true, message: "Đã tự động nạp Xu thành công", result });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/wallet/simulate-pay — chỉ Admin + bật ALLOW_SIMULATE_PAY=true
  if (req.method === "POST" && pathname === "/api/wallet/simulate-pay") {
    if (!requireAdmin(res, currentUser)) return;
    if (process.env.ALLOW_SIMULATE_PAY !== "true") {
      sendJson(res, 403, { success: false, error: "Simulate-pay đã tắt trên môi trường này (ALLOW_SIMULATE_PAY≠true)" });
      return;
    }
    try {
      const body = await parseBody(req);
      const targetUser = body.username || currentUser.username;
      const amountXu = parseFloat(body.amount || body.xu || 100);
      const bank = getBankConfig();
      const result = processBankWebhook({
        description: `${bank.prefix} ${targetUser} TEST`,
        amount: amountXu * 1000,
        referenceCode: `SIM_${Date.now()}`,
      });
      sendJson(res, 200, { success: true, message: "Mô phỏng nạp Xu thành công", result });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/admin/bank-config
  if (req.method === "GET" && pathname === "/api/admin/bank-config") {
    if (!requireAdmin(res, currentUser)) return;
    sendJson(res, 200, { success: true, bank: getBankConfig() });
    return;
  }

  // POST /api/admin/bank-config
  if (req.method === "POST" && pathname === "/api/admin/bank-config") {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền đổi cấu hình ngân hàng" });
      return;
    }
    try {
      const body = await parseBody(req);
      const updated = updateBankConfig(body);
      sendJson(res, 200, { success: true, bank: updated });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }
  // GET /api/wallet/balance
  if (req.method === "GET" && pathname === "/api/wallet/balance") {
    const balance = getBalance(currentUser.userId);
    const pricing = getPricing();
    sendJson(res, 200, { success: true, balance, pricing });
    return;
  }

  // GET /api/wallet/pricing
  if (req.method === "GET" && pathname === "/api/wallet/pricing") {
    sendJson(res, 200, { success: true, pricing: getPricing() });
    return;
  }

  // POST /api/wallet/pricing (Admin cập nhật giá)
  if (req.method === "POST" && pathname === "/api/wallet/pricing") {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền đổi bảng giá" });
      return;
    }
    try {
      const body = await parseBody(req);
      const updated = updatePricing(body);
      sendJson(res, 200, { success: true, pricing: updated });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/admin/wallet/topup (Admin nạp tiền cho User)
  if (req.method === "POST" && pathname === "/api/admin/wallet/topup") {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền nạp tiền" });
      return;
    }
    try {
      const body = await parseBody(req);
      const target = getUserById(body.userId);
      const resTopup = topupBalance(body.userId, body.amount, body.note || "Nạp tiền từ Admin", currentUser.username);
      logAdminAction({
        action: "USER_TOPUP",
        actor: currentUser,
        target: { userId: body.userId, username: target?.username || null },
        summary: `Nạp ${body.amount} Xu cho @${target?.username || body.userId}`,
        details: { amount: body.amount, note: body.note || "Nạp tiền từ Admin", balance: resTopup.balance },
      });
      sendJson(res, 200, { success: true, ...resTopup });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/wallet/transactions
  if (req.method === "GET" && pathname === "/api/wallet/transactions") {
    const targetUser = currentUser.role === "admin" ? null : currentUser.userId;
    const list = getTransactions(targetUser);
    sendJson(res, 200, { success: true, transactions: list });
    return;
  }

  // ── 3. DOMAIN OWNERSHIP & PERMISSION REQUESTS ──────────────────────────────
  // GET /api/resolve-link — kế thừa link hiện tại (UI prefill / để trống form)
  if (req.method === "GET" && pathname === "/api/resolve-link") {
    try {
      const domain = normalizeDomain(parsedUrl.searchParams.get("domain") || "");
      if (!domain) {
        sendJson(res, 400, { success: false, error: "Thiếu domain" });
        return;
      }
      if (!canUserManageDomain(currentUser, domain)) {
        sendJson(res, 403, { success: false, error: "Không có quyền xem domain này" });
        return;
      }
      const inherited = await resolveInheritedLink(domain);
      sendJson(res, 200, {
        success: true,
        domain,
        link: inherited.link,
        tele: inherited.tele || "",
        source: inherited.source,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/domains/search — Freze + Admin (khi có CLOUDFLARE_ADMIN_API_TOKEN)
  if (req.method === "GET" && pathname === "/api/domains/search") {
    try {
      const q = (parsedUrl.searchParams.get("q") || "").trim().toLowerCase();
      const isAdmin = currentUser.role === "admin";
      // Hub admin: search cả Admin zones; user thường: Freze + domain mình được gán (kể cả Admin nếu đã assign)
      const zones = listHubZonesFromCache({ includeAdmin: true });

      const userRequests = listDomainRequests({ userId: currentUser.userId, role: currentUser.role });
      const pendingReqMap = new Map();
      userRequests.forEach((r) => {
        if (r.status === "pending") {
          pendingReqMap.set(r.domain.toLowerCase(), r);
        }
      });

      const ownershipMap = listAllAssignments();

      let filteredZones = zones;
      if (q) {
        filteredZones = zones.filter((z) => z.name.toLowerCase().includes(q));
      }

      const results = filteredZones
        .map((z) => {
          const normName = z.name.toLowerCase().replace(/^www\./, "");
          const owner = ownershipMap[normName] || ownershipMap[z.name.toLowerCase()] || null;
          let permission = "none";

          if (isAdmin || (owner && owner.userId === currentUser.userId)) {
            permission = "owned";
          } else if (pendingReqMap.has(normName) || pendingReqMap.has(z.name.toLowerCase())) {
            permission = "pending";
          }

          const cfAccount = isAdminCfZone(z) ? "admin" : "freze";

          return {
            id: z.id,
            domain: z.name,
            status: z.status,
            accountName: z.accountName,
            cfAccount,
            permission,
            owner:
              isAdmin && owner
                ? { userId: owner.userId, username: owner.username || owner.userId, assignedAt: owner.assignedAt }
                : owner && owner.userId === currentUser.userId
                  ? "Bạn"
                  : null,
            pendingRequest: pendingReqMap.get(normName) || pendingReqMap.get(z.name.toLowerCase()) || null,
          };
        })
        .filter((r) => {
          if (isAdmin) return true;
          return r.permission === "owned" || r.permission === "pending";
        })
        .slice(0, 50);

      sendJson(res, 200, {
        success: true,
        count: results.length,
        totalInSystem: isAdmin ? zones.length : results.length,
        cfScope: "freze_and_admin",
        results,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/user/my-domains (Danh sách tên miền user có full quyền quản lý)
  if (req.method === "GET" && pathname === "/api/user/my-domains") {
    try {
      if (currentUser.role === "admin") {
        // Admin có toàn quyền với tất cả các tên miền
        const allDomains = listAllDomains();
        sendJson(res, 200, {
          success: true,
          count: allDomains.length,
          isAdminAll: true,
          domains: allDomains,
        });
        return;
      }

      const userAllowed = listUserDomainNames(currentUser.userId) || [];
      const allowedSet = new Set(userAllowed.map((d) => d.toLowerCase()));
      const allDomains = listAllDomains();
      const userDomains = allDomains.filter((d) => allowedSet.has(d.domain.toLowerCase()) || allowedSet.has(d.domain.replace(/^www\./, "").toLowerCase()));

      sendJson(res, 200, {
        success: true,
        count: userDomains.length,
        isAdminAll: false,
        domains: userDomains,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/domain-requests (User gửi yêu cầu xin cấp quyền quản lý tên miền)
  if (req.method === "POST" && pathname === "/api/domain-requests") {
    try {
      const body = await parseBody(req);
      const { domain, note } = body;
      if (!domain) {
        sendJson(res, 400, { success: false, error: "Vui lòng nhập tên miền muốn xin cấp quyền" });
        return;
      }

      const newReq = createDomainRequest({
        userId: currentUser.userId,
        username: currentUser.username,
        fullName: currentUser.fullName,
        domain,
        note: note || "",
      });

      sendJson(res, 200, {
        success: true,
        message: `Đã gửi yêu cầu cấp quyền tên miền [${newReq.domain}] tới Admin thành công! Vui lòng chờ phê duyệt.`,
        request: newReq,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/domain-requests (Danh sách yêu cầu cấp quyền: Admin xem tất cả, User xem của mình)
  if (req.method === "GET" && pathname === "/api/domain-requests") {
    try {
      const status = parsedUrl.searchParams.get("status") || null;
      const list = listDomainRequests({
        userId: currentUser.userId,
        role: currentUser.role,
        status,
      });
      const pendingCount = listDomainRequests({
        userId: currentUser.role === "admin" ? null : currentUser.userId,
        role: currentUser.role,
        status: "pending",
      }).length;

      sendJson(res, 200, {
        success: true,
        count: list.length,
        pendingCount,
        requests: list,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/admin/domain-requests/:id/approve (Admin duyệt cấp quyền)
  if (req.method === "POST" && pathname.match(/^\/api\/admin\/domain-requests\/([^\/]+)\/approve$/)) {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền phê duyệt yêu cầu cấp quyền" });
      return;
    }
    try {
      const match = pathname.match(/^\/api\/admin\/domain-requests\/([^\/]+)\/approve$/);
      const requestId = match[1];
      const approved = approveDomainRequest(requestId, currentUser);
      logAdminAction({
        action: "DOMAIN_REQUEST_APPROVE",
        actor: currentUser,
        target: { userId: approved.userId, username: approved.username, domain: approved.domain },
        summary: `Duyệt quyền miền ${approved.domain} → @${approved.username}`,
        details: { requestId },
      });
      sendJson(res, 200, {
        success: true,
        message: `Đã phê duyệt và cấp full quyền quản lý tên miền [${approved.domain}] cho user [${approved.username}]!`,
        request: approved,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/admin/domain-requests/:id/reject (Admin từ chối yêu cầu)
  if (req.method === "POST" && pathname.match(/^\/api\/admin\/domain-requests\/([^\/]+)\/reject$/)) {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền từ chối yêu cầu cấp quyền" });
      return;
    }
    try {
      const match = pathname.match(/^\/api\/admin\/domain-requests\/([^\/]+)\/reject$/);
      const requestId = match[1];
      const body = await parseBody(req);
      const rejected = rejectDomainRequest(requestId, currentUser, body.reason || "Admin từ chối yêu cầu");
      logAdminAction({
        action: "DOMAIN_REQUEST_REJECT",
        actor: currentUser,
        target: { userId: rejected.userId, username: rejected.username, domain: rejected.domain },
        summary: `Từ chối quyền miền ${rejected.domain} (@${rejected.username})`,
        details: { requestId, reason: body.reason || "Admin từ chối yêu cầu" },
      });
      sendJson(res, 200, {
        success: true,
        message: `Đã từ chối yêu cầu cấp quyền tên miền [${rejected.domain}] của user [${rejected.username}].`,
        request: rejected,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // ── 4. DOMAIN PURCHASE ORDERS (ĐẶT MUA TÊN MIỀN & DUYỆT TRỪ XU) ───────────
  // POST /api/domain-orders (User tạo đơn đặt mua tên miền - Chờ Admin duyệt)
  if (req.method === "POST" && pathname === "/api/domain-orders") {
    try {
      const body = await parseBody(req);
      const { domain, note } = body;
      if (!domain) {
        sendJson(res, 400, { success: false, error: "Vui lòng nhập tên miền muốn mua" });
        return;
      }

      const normDomain = normalizeDomain(domain);
      const info = await checkDomainAvailability(normDomain).catch(() => ({ result: "unknown" }));
      const hasPremium = info.premiumPricing && Array.isArray(info.premiumPricing) && info.premiumPricing.length > 0;
      if (info.result !== "available" || hasPremium) {
        sendJson(res, 400, {
          success: false,
          error: "Tên miền đã được đăng ký hoặc thuộc danh mục Premium/Aftermarket (Không hỗ trợ đặt mua)!",
        });
        return;
      }

      const orderResult = createDomainOrder({
        userId: currentUser.userId,
        username: currentUser.username,
        fullName: currentUser.fullName,
        domain: normDomain,
        note: note || "",
        link: body.link || "",
        tele: body.tele || "",
        templateId: body.templateId || "",
        deployMode: body.deployMode || "LP",
      });

      sendJson(res, 200, {
        success: true,
        message: "Yêu cầu của bạn đã gửi đi thành công! Vui lòng theo dõi lịch sử để theo dõi tiến độ tên miền.",
        ...orderResult,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/domain-orders (Lịch sử đơn mua: Admin xem tất cả, User xem của mình)
  if (req.method === "GET" && pathname === "/api/domain-orders") {
    try {
      const status = parsedUrl.searchParams.get("status") || null;
      const orders = listDomainOrders({
        userId: currentUser.userId,
        role: currentUser.role,
        status,
      });
      const pendingCount = listDomainOrders({
        userId: currentUser.role === "admin" ? null : currentUser.userId,
        role: currentUser.role,
        status: "pending",
      }).length;

      sendJson(res, 200, {
        success: true,
        count: orders.length,
        pendingCount,
        orders,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/admin/domain-orders/:id/approve (Admin duyệt đơn mua -> kiểm tra số dư -> trừ xu -> cấp quyền)
  if (req.method === "POST" && pathname.match(/^\/api\/admin\/domain-orders\/([^\/]+)\/approve$/)) {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền phê duyệt đơn mua tên miền" });
      return;
    }
    try {
      const match = pathname.match(/^\/api\/admin\/domain-orders\/([^\/]+)\/approve$/);
      const orderId = match[1];
      const approveRes = approveDomainOrder(orderId, currentUser);
      logAdminAction({
        action: "DOMAIN_ORDER_APPROVE",
        actor: currentUser,
        target: {
          userId: approveRes.order?.userId,
          username: approveRes.order?.username,
          domain: approveRes.order?.domain,
        },
        summary: `Duyệt đơn mua ${approveRes.order?.domain} (−${approveRes.deductedAmount} Xu)`,
        details: { orderId, deductedAmount: approveRes.deductedAmount },
      });
      sendJson(res, 200, {
        success: true,
        message: `Đã duyệt đơn mua tên miền [${approveRes.order.domain}] thành công! Đã trừ ${approveRes.deductedAmount} Xu của user [${approveRes.order.username}].`,
        ...approveRes,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/admin/domain-orders/:id/reject (Admin từ chối đơn mua -> Không trừ xu)
  if (req.method === "POST" && pathname.match(/^\/api\/admin\/domain-orders\/([^\/]+)\/reject$/)) {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền từ chối đơn mua" });
      return;
    }
    try {
      const match = pathname.match(/^\/api\/admin\/domain-orders\/([^\/]+)\/reject$/);
      const orderId = match[1];
      const body = await parseBody(req);
      const rejectRes = rejectDomainOrder(orderId, currentUser, body.reason || "Admin từ chối đơn đặt mua");
      logAdminAction({
        action: "DOMAIN_ORDER_REJECT",
        actor: currentUser,
        target: {
          userId: rejectRes.order?.userId,
          username: rejectRes.order?.username,
          domain: rejectRes.order?.domain,
        },
        summary: `Từ chối đơn mua ${rejectRes.order?.domain}`,
        details: { orderId, reason: body.reason || "Admin từ chối đơn đặt mua" },
      });
      sendJson(res, 200, {
        success: true,
        message: `Đã từ chối đơn mua tên miền [${rejectRes.order.domain}] của user [${rejectRes.order.username}]. Không trừ Xu.`,
        ...rejectRes,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/admin/audit-log — nhật ký quản trị user / quyền / Xu
  if (req.method === "GET" && pathname === "/api/admin/audit-log") {
    if (!requireAdmin(res, currentUser)) return;
    try {
      const limit = parsedUrl.searchParams.get("limit") || "100";
      const action = parsedUrl.searchParams.get("action") || "";
      const q = parsedUrl.searchParams.get("q") || "";
      const targetUserId = parsedUrl.searchParams.get("userId") || "";
      const data = listAdminAudit({ limit, action, q, targetUserId });
      sendJson(res, 200, { success: true, ...data });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/admin/ownership
  if (req.method === "GET" && pathname === "/api/admin/ownership") {
    if (!requireAdmin(res, currentUser)) return;
    sendJson(res, 200, { success: true, assignments: listAllAssignments() });
    return;
  }

  // POST /api/admin/assign-domain (Admin gán trực tiếp domain cho user — hỗ trợ 1 hoặc list)
  if (req.method === "POST" && (pathname === "/api/admin/assign-domain" || pathname === "/api/admin/domain-permissions/assign")) {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền gán domain" });
      return;
    }
    try {
      const body = await parseBody(req);
      const { domain, userId } = body;
      const listRaw = Array.isArray(body.domains)
        ? body.domains
        : domain
          ? [domain]
          : String(body.domainList || "")
              .split(/[\n\r,;\t]+/)
              .map((s) => s.trim())
              .filter(Boolean);
      const domains = [
        ...new Set(
          listRaw
            .map((d) =>
              String(d || "")
                .trim()
                .toLowerCase()
                .replace(/^https?:\/\//, "")
                .replace(/\/.*$/, "")
                .replace(/^www\./, "")
            )
            .filter(Boolean)
        ),
      ];
      if (!domains.length || !userId) throw new Error("Vui lòng cung cấp domain/domains và userId");
      const target = getUserById(userId);
      if (!target) throw new Error("Không tìm thấy thành viên");

      const assignments = [];
      const failed = [];
      for (const d of domains) {
        try {
          assignments.push(assignDomain(d, userId, body.meta || {}));
        } catch (err) {
          failed.push({ domain: d, error: err.message });
        }
      }

      logAdminAction({
        action: "DOMAIN_ASSIGN",
        actor: currentUser,
        target: {
          userId,
          username: target?.username || null,
          domain: domains.length === 1 ? domains[0] : undefined,
          domains,
        },
        summary:
          domains.length === 1
            ? `Gán miền ${domains[0]} → @${target?.username || userId}`
            : `Gán ${assignments.length}/${domains.length} miền → @${target?.username || userId}`,
        details: { meta: body.meta || {}, failed },
      });

      sendJson(res, 200, {
        success: true,
        assignment: assignments[0] || null,
        assignments,
        assignedCount: assignments.length,
        failed,
        message:
          domains.length === 1
            ? `Đã gán tên miền ${domains[0]} cho user ${userId}`
            : `Đã gán ${assignments.length}/${domains.length} tên miền cho user ${userId}`,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/admin/unassign-domain (Admin thu hồi domain)
  if (req.method === "POST" && (pathname === "/api/admin/unassign-domain" || pathname === "/api/admin/domain-permissions/revoke")) {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền thu hồi domain" });
      return;
    }
    try {
      const body = await parseBody(req);
      unassignDomain(body.domain);
      logAdminAction({
        action: "DOMAIN_UNASSIGN",
        actor: currentUser,
        target: { domain: body.domain },
        summary: `Thu hồi quyền miền ${body.domain}`,
        details: {},
      });
      sendJson(res, 200, { success: true, message: `Đã thu hồi quyền quản lý tên miền ${body.domain}` });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // ── 4. BACKGROUND TASK QUEUE APIS ──────────────────────────────────────────
  // GET /api/tasks
  if (req.method === "GET" && pathname === "/api/tasks") {
    try {
      reconcileStaleHistory();
    } catch {}
    const tasks = listTasks({ userId: currentUser.role === "admin" ? null : currentUser.userId });
    const active = tasks.filter((t) => t.status === "RUNNING" || t.status === "PENDING").length;
    sendJson(res, 200, { success: true, count: tasks.length, active, tasks });
    return;
  }

  // GET /api/tasks/:id
  if (req.method === "GET" && pathname.startsWith("/api/tasks/")) {
    const taskId = pathname.replace("/api/tasks/", "").trim();
    const task = getTask(taskId);
    if (!task) {
      sendJson(res, 404, { success: false, error: "Tác vụ không tồn tại" });
      return;
    }
    sendJson(res, 200, { success: true, task });
    return;
  }

  // POST /api/tasks/buy-and-deploy (ASYNC WORKER - Phản hồi < 100ms)
  if (req.method === "POST" && pathname === "/api/tasks/buy-and-deploy") {
    try {
      const body = await parseBody(req);
      const domain = normalizeDomain(body.domain || "");
      const link = normalizeUrl(body.link || "");
      const isBuy = Boolean(body.isBuy);
      const mode = body.mode === "302" ? "302" : "LP";
      const templateId = body.templateId || (mode === "LP" ? "lp_gg88_vip_2" : null);

      if (!domain) {
        sendJson(res, 400, { success: false, error: "Vui lòng nhập tên miền hợp lệ" });
        return;
      }
      if (!link) {
        sendJson(res, 400, { success: false, error: "Vui lòng nhập đường link đích" });
        return;
      }

      // Trỏ miền có sẵn thuộc Admin CF → không can thiệp
      if (!isBuy) {
        const adminSkip = adminSkipPayload(domain);
        if (adminSkip) {
          sendJson(res, 403, adminSkip);
          return;
        }
      }

      // User thường không mua trực tiếp — phải domain-orders + admin duyệt
      if (rejectNonAdminDirectBuy(res, currentUser, isBuy)) return;

      // Kiểm tra quyền đối với tên miền có sẵn (nếu không phải mua mới)
      if (!isBuy && !canUserManageDomain(currentUser, domain)) {
        sendJson(res, 403, {
          success: false,
          error: `⛔ Bạn chưa được cấp quyền quản lý tên miền [${domain}]. Vui lòng gửi yêu cầu cấp quyền tới Admin!`,
          unauthorizedDomain: domain,
        });
        return;
      }

      // Kiểm tra hạn mức giá tối đa nếu là mua mới (isBuy = true)
      if (isBuy) {
        const priceDetail = calculateDomainPriceDetail(domain);
        const pricing = getPricing();
        const maxLimit = typeof pricing.maxAutoBuyPriceUsd === "number" ? pricing.maxAutoBuyPriceUsd : 12.00;

        if (priceDetail.regPrice > maxLimit && currentUser.role !== "admin") {
          sendJson(res, 403, {
            success: false,
            error: `⚠️ Tên miền [${domain}] có giá $${priceDetail.regPrice.toFixed(2)} USD vượt quá hạn mức tối đa tự động mua ($${maxLimit.toFixed(2)} USD). Vui lòng liên hệ Admin phê duyệt.`,
            requiredApproval: true,
            priceUsd: priceDetail.regPrice,
            maxLimitUsd: maxLimit,
          });
          return;
        }
      }

      // Nếu là User thường và isBuy = true -> Trừ tiền ví trước
      let price = 0;
      if (isBuy && currentUser.role !== "admin") {
        price = calculateDomainPrice(domain);
        deductBalance(currentUser.userId, price, `Mua tên miền ${domain}`, { domain, mode });
      }

      // Tạo Job trong Background Task Queue
      const task = createTask({
        type: isBuy ? "BUY_DOMAIN" : "DEPLOY_DOMAIN",
        domain,
        userId: currentUser.userId,
        title: `${isBuy ? "Mua & Cài đặt" : "Trỏ cấu hình"}: ${domain} (${mode})`,
        params: {
          domain,
          link,
          templateId,
          isBuy,
          mode,
          userId: currentUser.userId,
          username: currentUser.username,
          fullName: currentUser.fullName,
          deductedAmount: price,
        },
      });

      // Kích hoạt worker chạy ngầm ngay lập tức (không block HTTP response)
      setImmediate(() => {
        executeBuyAndDeploy(task.id);
      });

      sendJson(res, 200, {
        success: true,
        message: `Tác vụ [${domain}] đã được đưa vào hàng đợi xử lý ngầm.`,
        jobId: task.id,
        task,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/tasks/switch-mode (ASYNC WORKER - Chuyển đổi 302 <-> LP)
  if (req.method === "POST" && pathname === "/api/tasks/switch-mode") {
    try {
      const body = await parseBody(req);
      const domain = normalizeDomain(body.domain || "");
      const toMode = body.toMode === "302" ? "302" : "LP";
      let targetUrl = (body.targetUrl || body.link || "").trim();
      const templateId = body.templateId || null;

      if (!domain) {
        sendJson(res, 400, { success: false, error: "Vui lòng cung cấp tên miền" });
        return;
      }

      const adminSkip = adminSkipPayload(domain);
      if (adminSkip) {
        sendJson(res, 403, adminSkip);
        return;
      }

      // Cho phép để trống → worker kế thừa link cũ (302 Location / history / ownership)
      if (!targetUrl || targetUrl === "https://" || targetUrl === "http://") {
        const inherited = await resolveInheritedLink(domain, { providedLink: "" });
        if (!inherited.link) {
          sendJson(res, 400, { success: false, error: "Vui lòng cung cấp link đích (không tìm được link cũ để kế thừa)" });
          return;
        }
        targetUrl = inherited.link;
      } else {
        targetUrl = normalizeUrl(targetUrl);
      }

      // Kiểm tra quyền quản trị tên miền
      if (!canUserManageDomain(currentUser, domain)) {
        sendJson(res, 403, {
          success: false,
          error: `⛔ Bạn chưa được cấp quyền quản lý tên miền [${domain}]. Vui lòng gửi yêu cầu cấp quyền tới Admin!`,
          unauthorizedDomain: domain,
        });
        return;
      }

      const task = createTask({
        type: toMode === "302" ? "SWITCH_TO_302" : "SWITCH_TO_LP",
        domain,
        userId: currentUser.userId,
        title: `Chuyển đổi ${domain} ➡️ ${toMode}`,
        params: {
          domain,
          toMode,
          templateId,
          targetUrl,
          userId: currentUser.userId,
          username: currentUser.username,
          fullName: currentUser.fullName,
        },
      });

      setImmediate(() => {
        executeSwitchMode(task.id);
      });

      sendJson(res, 200, {
        success: true,
        message: `Đang chuyển đổi ${domain} sang ${toMode}...`,
        jobId: task.id,
        task,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/tasks/clone-web (ASYNC WORKER - VIP Web Cloner: 100 Xu / lượt)
  if (req.method === "POST" && pathname === "/api/tasks/clone-web") {
    try {
      const body = await parseBody(req);
      const url = body.url ? body.url.trim() : "";
      if (!url) {
        sendJson(res, 400, { success: false, error: "Vui lòng nhập URL trang web cần sao chép" });
        return;
      }

      // Trừ 100 Xu nếu là User thường (100k = 100 Xu)
      const CLONE_FEE_XU = 100;
      if (currentUser.role !== "admin") {
        deductBalance(
          currentUser.userId,
          CLONE_FEE_XU,
          `Sao chép Website VIP: ${url} (100 Xu)`,
          { url, templateName: body.templateName, domain: body.domain }
        );
      }

      const task = createTask({
        type: "CLONE_WEBSITE",
        domain: body.domain || "",
        userId: currentUser.userId,
        title: `VIP Clone (100 Xu): ${url}`,
        params: {
          url,
          templateName: body.templateName || "",
          domain: body.domain || "",
          targetUrl: body.targetUrl || "",
          isDeploy: Boolean(body.domain),
          logoData: body.logoData || null,
          faviconData: body.faviconData || null,
          pageTitle: body.pageTitle || "",
          textReplacements: Array.isArray(body.textReplacements) ? body.textReplacements : [],
          userId: currentUser.userId,
          deductedAmount: currentUser.role === "admin" ? 0 : CLONE_FEE_XU,
        },
      });

      setImmediate(() => {
        executeCloneWebsite(task.id);
      });

      sendJson(res, 200, {
        success: true,
        message: `Đã trừ 100 Xu và khởi động tiến trình sao chép website [${url}]!`,
        jobId: task.id,
        task,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/tasks/update-link (ASYNC WORKER - Đổi link nhanh)
  if (req.method === "POST" && pathname === "/api/tasks/update-link") {
    try {
      const body = await parseBody(req);
      const domain = normalizeDomain(body.domain || "");
      const newLink = normalizeUrl(body.newLink || body.link || "");
      const teleLink = body.teleLink || "";

      if (!domain || !newLink) {
        sendJson(res, 400, { success: false, error: "Vui lòng cung cấp domain và link đích" });
        return;
      }

      const adminSkip = adminSkipPayload(domain);
      if (adminSkip) {
        sendJson(res, 403, adminSkip);
        return;
      }

      // Kiểm tra quyền quản trị tên miền
      if (!canUserManageDomain(currentUser, domain)) {
        sendJson(res, 403, {
          success: false,
          error: `⛔ Bạn chưa được cấp quyền quản lý tên miền [${domain}]. Vui lòng gửi yêu cầu cấp quyền tới Admin!`,
          unauthorizedDomain: domain,
        });
        return;
      }

      const task = createTask({
        type: "UPDATE_LINK",
        domain,
        userId: currentUser.userId,
        title: `Cập nhật link đích: ${domain}`,
        params: {
          domain,
          newLink,
          teleLink,
          userId: currentUser.userId,
          username: currentUser.username,
          fullName: currentUser.fullName,
        },
      });

      setImmediate(() => {
        executeUpdateLink(task.id);
      });

      sendJson(res, 200, {
        success: true,
        message: `Đang cập nhật link đích cho ${domain}...`,
        jobId: task.id,
        task,
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/templates/:id/download (Tải trọn bộ Source Code dạng ZIP)
  if (req.method === "GET" && pathname.match(/^\/api\/templates\/([^\/]+)\/download$/)) {
    const match = pathname.match(/^\/api\/templates\/([^\/]+)\/download$/);
    const templateId = match[1];
    const template = getTemplate(templateId);
    if (!template || !template.path || !fs.existsSync(template.path)) {
      sendJson(res, 404, { success: false, error: "Thư mục mã nguồn không tồn tại trên máy chủ" });
      return;
    }

    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addLocalFolder(template.path);
      const zipBuffer = zip.toBuffer();

      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${templateId}.zip"`,
        "Content-Length": zipBuffer.length,
      });
      res.end(zipBuffer);
    } catch (err) {
      sendJson(res, 500, { success: false, error: "Lỗi đóng gói zip: " + err.message });
    }
    return;
  }

  // GET /api/templates/:id/files (Danh sách file mã nguồn có thể sửa)
  if (req.method === "GET" && pathname.match(/^\/api\/templates\/([^\/]+)\/files$/)) {
    const match = pathname.match(/^\/api\/templates\/([^\/]+)\/files$/);
    const templateId = match[1];
    const template = getTemplate(templateId);
    if (!template || !template.path || !fs.existsSync(template.path)) {
      sendJson(res, 404, { success: false, error: "Thư mục mã nguồn không tồn tại" });
      return;
    }

    const allowedExts = [".html", ".htm", ".js", ".json", ".css", ".txt", ".md", ".env", ".svg", ".xml"];
    function scanDir(dir, base = dir) {
      const out = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.name.startsWith(".") || ent.name === "node_modules" || ent.name === "dist" || ent.name.endsWith(".zip")) continue;
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            out.push(...scanDir(full, base));
          } else {
            const ext = path.extname(ent.name).toLowerCase();
            if (allowedExts.includes(ext)) {
              const rel = path.relative(base, full).replace(/\\/g, "/");
              const stat = fs.statSync(full);
              out.push({
                name: ent.name,
                path: rel,
                size: stat.size,
                ext,
                modifiedAt: stat.mtime.toISOString(),
              });
            }
          }
        }
      } catch {}
      return out;
    }

    const files = scanDir(template.path);
    sendJson(res, 200, { success: true, templateId, templateName: template.name, files });
    return;
  }

  // GET /api/templates/:id/file (Đọc nội dung file cụ thể)
  if (req.method === "GET" && pathname.match(/^\/api\/templates\/([^\/]+)\/file$/)) {
    const match = pathname.match(/^\/api\/templates\/([^\/]+)\/file$/);
    const templateId = match[1];
    const template = getTemplate(templateId);
    if (!template || !template.path || !fs.existsSync(template.path)) {
      sendJson(res, 404, { success: false, error: "Mẫu không tồn tại" });
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const relFile = (parsedUrl.searchParams.get("file") || parsedUrl.searchParams.get("path") || "index.html").trim();
    const fullPath = path.resolve(template.path, relFile);

    if (!fullPath.startsWith(path.resolve(template.path))) {
      sendJson(res, 403, { success: false, error: "Đường dẫn file không hợp lệ" });
      return;
    }

    if (!fs.existsSync(fullPath)) {
      sendJson(res, 404, { success: false, error: `File [${relFile}] không tồn tại` });
      return;
    }

    try {
      const content = fs.readFileSync(fullPath, "utf8");
      sendJson(res, 200, { success: true, templateId, file: relFile, content });
    } catch (err) {
      sendJson(res, 500, { success: false, error: `Không thể đọc file: ${err.message}` });
    }
    return;
  }

  // POST /api/templates/:id/file (Lưu nội dung file & Tự động Deploy lại Pages)
  if (req.method === "POST" && pathname.match(/^\/api\/templates\/([^\/]+)\/file$/)) {
    const match = pathname.match(/^\/api\/templates\/([^\/]+)\/file$/);
    const templateId = match[1];
    const template = getTemplate(templateId);
    if (!template || !template.path || !fs.existsSync(template.path)) {
      sendJson(res, 404, { success: false, error: "Mẫu không tồn tại" });
      return;
    }

    try {
      const body = await parseBody(req);
      const { file: relFile, content, isDeploy = true } = body;
      if (!relFile || content === undefined) {
        sendJson(res, 400, { success: false, error: "Thiếu thông tin file hoặc content" });
        return;
      }

      const fullPath = path.resolve(template.path, relFile);
      if (!fullPath.startsWith(path.resolve(template.path))) {
        sendJson(res, 403, { success: false, error: "Đường dẫn file không hợp lệ" });
        return;
      }

      fs.writeFileSync(fullPath, String(content), "utf8");

      // Cập nhật lại file ZIP mã nguồn nếu có
      try {
        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip();
        zip.addLocalFolder(template.path);
        zip.writeZip(path.join(template.path, `${templateId}.zip`));
      } catch {}

      // Tự động deploy lại lên Cloudflare Pages nếu được yêu cầu
      let deployed = false;
      let deployError = null;
      if (isDeploy && template.pagesProject) {
        try {
          await deployToAllPagesInstances(template.pagesProject, template.path);
          deployed = true;
        } catch (dErr) {
          deployError = dErr.message;
        }
      }

      sendJson(res, 200, {
        success: true,
        message: `Đã lưu file [${relFile}] thành công!${deployed ? " Đã deploy cập nhật lên Cloudflare Pages." : ""}`,
        file: relFile,
        deployed,
        deployError,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: `Lỗi lưu file: ${err.message}` });
    }
    return;
  }

  // ── 5. TEMPLATES & DOMAIN MANAGEMENT ──────────────────────────────────────
  // GET /api/templates
  if (req.method === "GET" && pathname === "/api/templates") {
    const templates = listTemplates();
    const result = templates.map((t) => {
      const screenshotFilename = `${t.id}.png`;
      const screenshotExists =
        fs.existsSync(path.join(PUBLIC_DIR, "screenshots", screenshotFilename)) ||
        fs.existsSync(path.join(SCREENSHOTS_DIR, screenshotFilename));
      return {
        ...t,
        screenshotUrl: screenshotExists ? `/screenshots/${screenshotFilename}` : `/screenshots/${screenshotFilename}`,
      };
    });
    sendJson(res, 200, { success: true, count: result.length, templates: result });
    return;
  }

  // GET /api/templates/:id
  if (req.method === "GET" && pathname.startsWith("/api/templates/")) {
    const id = pathname.replace("/api/templates/", "").trim();
    const t = getTemplate(id);
    if (!t) {
      sendJson(res, 404, { success: false, error: "Template không tồn tại" });
      return;
    }
    const screenshotFilename = `${t.id}.png`;
    const screenshotExists =
      fs.existsSync(path.join(PUBLIC_DIR, "screenshots", screenshotFilename)) ||
      fs.existsSync(path.join(SCREENSHOTS_DIR, screenshotFilename));
    sendJson(res, 200, {
      success: true,
      template: {
        ...t,
        screenshotUrl: screenshotExists ? `/screenshots/${screenshotFilename}` : `/screenshots/${screenshotFilename}`,
      },
    });
    return;
  }

  // GET /api/domains hoặc /api/domains-list
  // Nguồn: domains.json trong repo + zone CF (Freze+Admin) từ cache sau Đồng bộ CF
  if (req.method === "GET" && (pathname === "/api/domains" || pathname === "/api/domains-list")) {
    try {
      const page = parsedUrl.searchParams.get("page") || "1";
      const limit = parsedUrl.searchParams.get("limit") || "50";
      const q = parsedUrl.searchParams.get("q") || "";
      const all = parsedUrl.searchParams.get("all") === "1";
      const fields = parsedUrl.searchParams.get("fields") || "";
      const userAllowedDomains = listUserDomainNames(currentUser.userId);
      const isAdminUser = currentUser.role === "admin";

      const payload = queryEnrichedDomainsList(
        { isAdminUser, userAllowedDomains },
        { page, limit, q, all, fields },
      );
      sendJson(res, 200, payload);
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/sync-cloudflare
  if (req.method === "POST" && pathname === "/api/sync-cloudflare") {
    if (!requireAdmin(res, currentUser)) return;
    try {
      const { syncAllCloudflareZones } = await import("../scripts/sync_all_cf_zones.js");
      const zones = await syncAllCloudflareZones();
      invalidateHubDomainCaches();
      sendJson(res, 200, { success: true, count: zones.length, message: `Đã đồng bộ ${zones.length} tên miền từ Cloudflare` });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/history/watch — nhẹ cho polling popup 200 / tiến độ
  if (req.method === "GET" && pathname === "/api/history/watch") {
    try {
      let history = filterHistoryForUser(getHistory(), currentUser);
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const watch = history
        .filter((h) => {
          if (h.status === "in_progress" || h.status === "pending") return true;
          const ts = h.timestamp ? new Date(h.timestamp).getTime() : 0;
          return ts >= cutoff;
        })
        .slice(0, 120);
      sendJson(res, 200, { success: true, count: watch.length, history: watch });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // GET /api/history
  if (req.method === "GET" && pathname === "/api/history") {
    try {
      const page = Math.max(1, parseInt(parsedUrl.searchParams.get("page") || "1", 10));
      const limit = Math.min(200, Math.max(1, parseInt(parsedUrl.searchParams.get("limit") || "50", 10)));
      const q = (parsedUrl.searchParams.get("q") || "").trim();
      const all = parsedUrl.searchParams.get("all") === "1";

      let history = filterHistoryForUser(getHistory(), currentUser);
      if (q) history = history.filter((h) => historyMatchesQuery(h, q));

      const stats = computeHistoryStats(history);
      const tableRows = history.filter((h) => h.status !== "in_progress" && h.status !== "pending");

      if (all) {
        sendJson(res, 200, { success: true, count: tableRows.length, history: tableRows, stats });
        return;
      }

      const total = tableRows.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const offset = (page - 1) * limit;
      const slice = tableRows.slice(offset, offset + limit);

      sendJson(res, 200, {
        success: true,
        total,
        page,
        limit,
        totalPages,
        count: slice.length,
        history: slice,
        stats,
        paginated: true,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/history/clear
  if (req.method === "POST" && pathname === "/api/history/clear") {
    if (currentUser.role !== "admin") {
      sendJson(res, 403, { success: false, error: "Chỉ Admin mới có quyền xóa lịch sử" });
      return;
    }
    clearHistory();
    sendJson(res, 200, { success: true, message: "Đã xóa toàn bộ lịch sử" });
    return;
  }

  // GET /api/cf-token (Lấy thông tin token hiện tại)
  if (req.method === "GET" && pathname === "/api/cf-token") {
    if (!requireAdmin(res, currentUser)) return;
    const rawToken = process.env.CLOUDFLARE_API_TOKEN || "";
    const masked = rawToken.length > 10 ? `${rawToken.slice(0, 8)}...${rawToken.slice(-6)}` : "Chưa cấu hình";
    sendJson(res, 200, {
      success: true,
      maskedToken: masked,
      hasToken: Boolean(rawToken),
    });
    return;
  }

  // POST /api/cf-token/verify (Kiểm tra token trực tiếp)
  if (req.method === "POST" && pathname === "/api/cf-token/verify") {
    try {
      const body = await parseBody(req);
      const token = (body.token || process.env.CLOUDFLARE_API_TOKEN || "").trim();

      if (!token) {
        sendJson(res, 400, { success: false, error: "Vui lòng cung cấp mã API Token" });
        return;
      }

      // 1. Verify token
      const verifyRes = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        sendJson(res, 200, {
          success: false,
          valid: false,
          error: verifyData.errors?.map((e) => e.message).join("; ") || "Token không hợp lệ",
        });
        return;
      }

      // 2. Kiểm tra quyền Pages Projects
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "456da4d89821d871fac09c0e5651338a";
      let pagesCount = 0;
      let pagesProjects = [];
      let canEditPages = true;

      try {
        const pagesRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const pagesData = await pagesRes.json();
        if (pagesData.success && Array.isArray(pagesData.result)) {
          pagesCount = pagesData.result.length;
          pagesProjects = pagesData.result.map((p) => p.name);
        }
      } catch (e) {
        canEditPages = false;
      }

      // 3. Kiểm tra quyền Zone DNS
      let zonesCount = 0;
      try {
        const zonesRes = await fetch("https://api.cloudflare.com/client/v4/zones?per_page=5", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const zonesData = await zonesRes.json();
        if (zonesData.success && Array.isArray(zonesData.result)) {
          zonesCount = zonesData.result_info?.total_count || zonesData.result.length;
        }
      } catch {}

      sendJson(res, 200, {
        success: true,
        valid: true,
        tokenId: verifyData.result?.id,
        status: verifyData.result?.status || "active",
        canEditPages,
        pagesCount,
        pagesProjects,
        zonesCount,
        message: `Token hợp lệ! Quản lý ${zonesCount} Zones và ${pagesCount} Pages projects.`,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/cf-token/save (Lưu token mới vào .env và memory)
  if (req.method === "POST" && pathname === "/api/cf-token/save") {
    if (!requireAdmin(res, currentUser)) return;
    try {
      const body = await parseBody(req);
      const token = (body.token || "").trim();

      if (!token) {
        sendJson(res, 400, { success: false, error: "Vui lòng cung cấp mã API Token để lưu" });
        return;
      }

      process.env.CLOUDFLARE_API_TOKEN = token;

      // Cập nhật file .env
      const envPath = path.resolve(__dirname, "..", ".env");
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, "utf8");
        if (envContent.includes("CLOUDFLARE_API_TOKEN=")) {
          envContent = envContent.replace(/CLOUDFLARE_API_TOKEN=.*/g, `CLOUDFLARE_API_TOKEN=${token}`);
        } else {
          envContent += `\nCLOUDFLARE_API_TOKEN=${token}\n`;
        }
        fs.writeFileSync(envPath, envContent, "utf8");
      }

      sendJson(res, 200, {
        success: true,
        message: "Đã lưu và kích hoạt mã API Token Cloudflare mới thành công!",
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/check-domain
  if (req.method === "POST" && pathname === "/api/check-domain") {
    try {
      const body = await parseBody(req);
      if (!body.domain) {
        sendJson(res, 400, { success: false, error: "Vui lòng cung cấp tên miền cần kiểm tra" });
        return;
      }

      const domain = normalizeDomain(body.domain);
      const [info, cfInfo, zone] = await Promise.all([
        checkDomainAvailability(domain).catch(() => ({ result: "unknown" })),
        checkDomainCfAccount(domain).catch(() => ({ accountName: "Chưa rõ" })),
        findZoneByName(domain).catch(() => null),
      ]);

      let activeRule = null;
      if (zone) {
        activeRule = await findActiveForwardingRule(zone.id);
      }

      const repoMatches = findDomainInRepos(domain);
      let isPremium = Boolean(info.premiumPricing && Array.isArray(info.premiumPricing) && info.premiumPricing.length > 0);
      
      // Quy tắc bảo mật kinh doanh: Không cho mua miền premium / aftermarket, báo không còn
      const rawAvailable = info.result === "available";
      const isAvailable = rawAvailable && !isPremium;
      const isBuyable = isAvailable;

      const priceRule = calculateDomainPriceRule(domain);
      const priceDetail = calculateDomainPriceDetail(domain);
      let exactPriceUsd = priceRule.priceUsd;
      let renewPriceUsd = priceDetail.renewPrice || exactPriceUsd;

      const priceXu = priceRule.priceXu;
      const priceVnd = priceRule.priceVnd;
      const priceFormatted = `${priceXu} Xu (≈ ${(priceVnd / 1000).toLocaleString("vi-VN")}k đ)`;

      // Phân tích trạng thái vận hành hiện tại của tên miền
      let currentMode = "UNCONFIGURED";
      if (repoMatches.length > 0) {
        currentMode = "LANDING_PAGE";
      } else if (activeRule) {
        currentMode = "DIRECT_302";
      } else if (isAvailable) {
        currentMode = "AVAILABLE";
      } else if (isPremium) {
        currentMode = "PREMIUM_UNAVAILABLE";
      }

      sendJson(res, 200, {
        success: true,
        domain,
        isAvailable,
        isBuyable,
        isPremium,
        availability: isAvailable ? "available" : (isPremium ? "premium_unavailable" : (info.result === "registered" ? "registered" : "unavailable")),
        statusMessage: isPremium ? "❌ Tên miền không khả dụng (Premium/Aftermarket)" : (isAvailable ? "✅ Còn trống để mua" : "❌ Đã có chủ / Không còn"),
        priceXu,
        priceVnd,
        priceUsd: exactPriceUsd,
        renewPriceUsd,
        priceFormatted,
        ruleApplied: priceRule.ruleApplied,
        cfAccount: cfInfo.accountName,
        cfAccountId: cfInfo.accountId,
        hasZone: !!zone,
        zoneStatus: zone?.status || "none",
        currentMode,
        activeRedirect: activeRule
          ? {
              active: true,
              targetUrl: activeRule.targetUrl,
              statusCode: activeRule.statusCode,
            }
          : null,
        repoMatches: repoMatches.map((m) => {
          const cfg = m.config || {};
          const mainUrl = cfg.main_url || cfg.url || cfg.link || (typeof cfg === "string" ? cfg : "");
          const teleUrl = cfg.telegram_url || cfg.tele || (cfg.messenger_url && cfg.messenger_url !== mainUrl ? cfg.messenger_url : "");
          return {
            folderPath: m.folderPath,
            mainUrl,
            telegramUrl: teleUrl,
            messengerUrl: cfg.messenger_url || "",
          };
        }),
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/spaceship/quote — báo giá trước khi mua (popup xác nhận)
  if (req.method === "POST" && pathname === "/api/spaceship/quote") {
    try {
      const body = await parseBody(req);
      const domain = normalizeDomain(body.domain || "");
      if (!domain) {
        sendJson(res, 400, { success: false, error: "Vui lòng cung cấp tên miền" });
        return;
      }
      const quote = await quoteSpaceshipPurchase(domain);
      sendJson(res, 200, { success: true, quote });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/check-domains-batch (Kiểm tra hàng loạt danh sách tên miền cho User & Admin)
  if (req.method === "POST" && pathname === "/api/check-domains-batch") {
    try {
      const body = await parseBody(req);
      const rawDomains = Array.isArray(body.domains) ? body.domains : (body.text || "").split(/[\n,;\s]+/);
      const domains = [...new Set(rawDomains.map((d) => normalizeDomain(d)).filter(Boolean))];

      if (domains.length === 0) {
        sendJson(res, 400, { success: false, error: "Vui lòng nhập ít nhất 1 tên miền để kiểm tra" });
        return;
      }

      const results = await Promise.all(
        domains.slice(0, 50).map(async (domain) => {
          const priceRule = calculateDomainPriceRule(domain);
          const priceDetail = calculateDomainPriceDetail(domain);
          let exactPriceUsd = priceRule.priceUsd;
          let renewPriceUsd = priceDetail.renewPrice || exactPriceUsd;

          try {
            const info = await checkDomainAvailability(domain).catch(() => ({ result: "unknown" }));
            const isPremium = Boolean(info.premiumPricing && Array.isArray(info.premiumPricing) && info.premiumPricing.length > 0);
            const rawAvailable = info.result === "available";
            const isAvailable = rawAvailable && !isPremium;

            return {
              domain,
              isAvailable,
              isBuyable: isAvailable,
              isPremium,
              status: isAvailable ? "AVAILABLE" : (isPremium ? "PREMIUM_UNAVAILABLE" : (info.result === "registered" ? "REGISTERED" : "UNKNOWN")),
              statusMessage: isPremium ? "❌ Không còn (Premium)" : (isAvailable ? "✅ Còn trống" : "❌ Đã có người mua"),
              priceXu: priceRule.priceXu,
              priceVnd: priceRule.priceVnd,
              priceUsd: exactPriceUsd,
              renewPriceUsd,
              priceFormatted: `${priceRule.priceXu} Xu (≈ ${(priceRule.priceVnd / 1000).toLocaleString("vi-VN")}k đ)`,
              ruleApplied: priceRule.ruleApplied,
            };
          } catch (e) {
            return {
              domain,
              isAvailable: false,
              isBuyable: false,
              isPremium: false,
              status: "ERROR",
              priceXu: priceRule.priceXu,
              priceVnd: priceRule.priceVnd,
              priceUsd: exactPriceUsd,
              renewPriceUsd,
              priceFormatted: `${priceRule.priceXu} Xu`,
              error: e.message,
            };
          }
        })
      );

      sendJson(res, 200, {
        success: true,
        count: results.length,
        availableCount: results.filter((r) => r.isAvailable).length,
        results,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }



  // POST /api/history/verify (Kiểm tra HTTP 200 & Chụp ảnh cho 1 domain cụ thể)
  if (req.method === "POST" && pathname === "/api/history/verify") {
    try {
      const body = await parseBody(req);
      const { id, domain, force } = body;
      const history = getHistory();
      const item = history.find((h) => (id && h.id === id) || (domain && h.domain === domain));

      if (!item && !domain) {
        sendJson(res, 404, { success: false, error: "Không tìm thấy tên miền trong lịch sử" });
        return;
      }

      const targetItem = item || { domain, id: domain, status: "success" };
      const verifyResult = await verifyHistoryItem(targetItem, Boolean(force));

      sendJson(res, 200, {
        success: true,
        data: verifyResult,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/history/verify-all (Kiểm tra toàn bộ các tên miền đang chờ 200)
  if (req.method === "POST" && pathname === "/api/history/verify-all") {
    try {
      const resData = await runVerificationQueue();
      sendJson(res, 200, { success: true, ...resData });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/inspect-health (Chẩn đoán sức khỏe 8 cấp độ cho 1 hoặc nhiều tên miền)
  if (req.method === "POST" && pathname === "/api/inspect-health") {
    try {
      const body = await parseBody(req);
      const rawInput = body.domain || body.domains || body.text || "";
      const domainList = extractDomainsFromText(rawInput);

      if (domainList.length === 0) {
        sendJson(res, 400, { success: false, error: "Vui lòng cung cấp tên miền hợp lệ cần kiểm tra" });
        return;
      }

      if (domainList.length > 1) {
        // Tự động chuyển sang chế độ hàng loạt (Batch Inspection)
        const reports = [];
        const CHUNK_SIZE = 3;
        for (let i = 0; i < domainList.length; i += CHUNK_SIZE) {
          const chunk = domainList.slice(i, i + CHUNK_SIZE);
          const chunkReports = await Promise.all(
            chunk.map((d) => inspectDomainHealth(d).catch((e) => ({ domain: d, overallStatus: "ERROR", error: e.message })))
          );
          reports.push(...chunkReports);
        }

        const healthyCount = reports.filter((r) => r.healthScore === r.maxScore).length;
        const degradedCount = reports.filter((r) => r.overallStatus === "DEGRADED").length;
        const criticalCount = reports.filter((r) => r.overallStatus === "CRITICAL" || r.overallStatus === "ERROR").length;

        sendJson(res, 200, {
          success: true,
          isBatch: true,
          total: reports.length,
          healthyCount,
          degradedCount,
          criticalCount,
          reports,
        });
        return;
      }

      const report = await inspectDomainHealth(domainList[0]);
      sendJson(res, 200, { success: true, isBatch: false, report });
    } catch (err) {
      console.error("inspect-health error:", err);
      sendJson(res, 500, { success: false, error: err.message, stack: err.stack });
    }
    return;
  }

  // POST /api/inspect-batch-health (Chẩn đoán danh sách hàng loạt tên miền)
  if (req.method === "POST" && pathname === "/api/inspect-batch-health") {
    try {
      const body = await parseBody(req);
      let rawInput = body.domains || body.text || body.domain || [];
      let cleanDomains = extractDomainsFromText(rawInput);

      if (cleanDomains.length === 0) {
        const all = listAllDomains();
        cleanDomains = [...new Set(all.map((d) => d.domain))];
      }

      const reports = [];

      // Chạy chẩn đoán theo từng lô (concurrency = 3) để tránh quá tải API
      const CHUNK_SIZE = 3;
      for (let i = 0; i < cleanDomains.length; i += CHUNK_SIZE) {
        const chunk = cleanDomains.slice(i, i + CHUNK_SIZE);
        const chunkReports = await Promise.all(
          chunk.map((d) => inspectDomainHealth(d).catch((e) => ({ domain: d, overallStatus: "ERROR", error: e.message })))
        );
        reports.push(...chunkReports);
      }

      const healthyCount = reports.filter((r) => r.healthScore === r.maxScore).length;
      const degradedCount = reports.filter((r) => r.overallStatus === "DEGRADED").length;
      const criticalCount = reports.filter((r) => r.overallStatus === "CRITICAL" || r.overallStatus === "ERROR").length;

      sendJson(res, 200, {
        success: true,
        total: reports.length,
        healthyCount,
        degradedCount,
        criticalCount,
        reports,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/fix-domain (1-Click Auto Fix toàn diện mọi lỗi cho 1 tên miền)
  if (req.method === "POST" && pathname === "/api/fix-domain") {
    try {
      const body = await parseBody(req);
      if (!body.domain) {
        sendJson(res, 400, { success: false, error: "Vui lòng cung cấp tên miền cần sửa lỗi" });
        return;
      }
      const domain = normalizeDomain(body.domain);

      const adminSkip = adminSkipPayload(domain);
      if (adminSkip) {
        sendJson(res, 403, adminSkip);
        return;
      }

      // Kiểm tra quyền quản trị tên miền
      if (!canUserManageDomain(currentUser, domain)) {
        sendJson(res, 403, {
          success: false,
          error: `⛔ Bạn chưa được cấp quyền quản lý tên miền [${domain}]. Vui lòng gửi yêu cầu cấp quyền tới Admin!`,
          unauthorizedDomain: domain,
        });
        return;
      }

      // 1. Chẩn đoán ban đầu
      const initialReport = await inspectDomainHealth(domain);

      // 2. Tìm template / link / tele
      let matchedTpl = null;
      let targetLink = initialReport.detectedLink;
      let targetTele = initialReport.detectedTele || "";

      const repoMatches = findDomainInRepos(domain);
      const allTpls = listTemplates();

      if (repoMatches.length > 0) {
        matchedTpl = allTpls.find((t) => t.path && repoMatches[0].filePath.includes(t.path));
        targetLink = targetLink || repoMatches[0].config?.main_url || repoMatches[0].config?.url;
        targetTele = targetTele || repoMatches[0].config?.telegram_url || repoMatches[0].config?.messenger_url || "";
      }
      if (!matchedTpl) {
        matchedTpl = allTpls.find((t) => t.id === "gg88_lp_5uae") || allTpls[0];
      }
      if (!targetLink) {
        targetLink = "https://t.me/";
      }

      // 3. Đảm bảo Zone Cloudflare & Đồng bộ Nameservers
      const zone = await getOrCreateZone(domain).catch(() => null);
      if (zone) {
        const zoneNs = getZoneNameservers(zone);
        if (zoneNs && zoneNs.length > 0) {
          await updateNameservers(domain, zoneNs).catch(() => {});
        }
        await deleteForwardingPageRules(zone.id).catch(() => {});
      }

      // 4. Dọn dẹp liên kết cũ bị kẹt / lệch project
      await removeDomainFromAllPagesProjects(domain).catch(() => {});

      // 5. Gắn Custom Domain vào Cloudflare Pages
      let finalTarget = matchedTpl.cnameTarget;
      if (matchedTpl.pagesProject) {
        const pagesRes = await addPagesDomain(
          domain,
          matchedTpl.pagesProject,
          matchedTpl.path,
          await pagesOptsForTemplate(domain, matchedTpl)
        ).catch(() => {});
        if (pagesRes?.canonicalSubdomain) {
          finalTarget = pagesRes.canonicalSubdomain;
        }
      }

      // 6. Cập nhật DNS CNAME (@ & www) trỏ chuẩn xác về target
      await ensurePagesCname(domain, finalTarget).catch(() => {});

      // 7. Cập nhật domains.json & js/config.js và Git Push / Deploy
      await updateTemplateDomainsJson(matchedTpl, domain, targetLink, targetTele).catch(() => {});

      // 8. Chờ Cloudflare định tuyến & Verify HTTP 200 + Chụp ảnh
      await new Promise((r) => setTimeout(r, 4000));
      await verifyHistoryItem({ domain, id: domain, link: targetLink }, true).catch(() => {});

      // 9. Chẩn đoán lại để trả về kết quả mới nhất
      const updatedReport = await inspectDomainHealth(domain);

      sendJson(res, 200, {
        success: true,
        message: `Đã tự động sửa xong toàn diện cho [${domain}]!`,
        domain,
        report: updatedReport,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/fix-batch-domains (Tự động sửa hàng loạt toàn bộ tên miền lỗi)
  if (req.method === "POST" && pathname === "/api/fix-batch-domains") {
    if (!requireAdmin(res, currentUser)) return;
    try {
      const body = await parseBody(req);
      const rawDomains = Array.isArray(body.domains) ? body.domains : [];

      if (rawDomains.length === 0) {
        sendJson(res, 400, { success: false, error: "Thiếu danh sách tên miền cần sửa" });
        return;
      }

      const cleanDomains = [...new Set(rawDomains.map((d) => normalizeDomain(d)).filter(Boolean))];
      const results = [];

      for (const dom of cleanDomains) {
        try {
          const adminSkip = adminSkipPayload(dom);
          if (adminSkip) {
            results.push({ domain: dom, success: false, skipped: true, error: adminSkip.error, code: "CF_ADMIN_SKIP" });
            continue;
          }

          const initialReport = await inspectDomainHealth(dom);

          // Tìm template & link
          let matchedTpl = null;
          let targetLink = initialReport.detectedLink;
          let targetTele = initialReport.detectedTele || "";

          const repoMatches = findDomainInRepos(dom);
          const allTpls = listTemplates();

          if (repoMatches.length > 0) {
            matchedTpl = allTpls.find((t) => t.path && repoMatches[0].filePath.includes(t.path));
            targetLink = targetLink || repoMatches[0].config?.main_url || repoMatches[0].config?.url;
            targetTele = targetTele || repoMatches[0].config?.telegram_url || repoMatches[0].config?.messenger_url || "";
          }
          if (!matchedTpl) {
            matchedTpl = allTpls.find((t) => t.id === "gg88_lp_5uae") || allTpls[0];
          }
          if (!targetLink) {
            targetLink = "https://t.me/";
          }

          // Đồng bộ NS & Zone
          const zone = await getOrCreateZone(dom).catch(() => null);
          if (zone) {
            const zoneNs = getZoneNameservers(zone);
            if (zoneNs && zoneNs.length > 0) {
              await updateNameservers(dom, zoneNs).catch(() => {});
            }
            await deleteForwardingPageRules(zone.id).catch(() => {});
          }

          // Dọn dẹp domain cũ
          await removeDomainFromAllPagesProjects(dom).catch(() => {});

          // Gắn vào Pages
          let finalTarget = matchedTpl.cnameTarget;
          if (matchedTpl.pagesProject) {
            const pagesRes = await addPagesDomain(
              dom,
              matchedTpl.pagesProject,
              matchedTpl.path,
              await pagesOptsForTemplate(dom, matchedTpl)
            ).catch(() => {});
            if (pagesRes?.canonicalSubdomain) {
              finalTarget = pagesRes.canonicalSubdomain;
            }
          }

          // Cập nhật CNAME
          await ensurePagesCname(dom, finalTarget).catch(() => {});

          // Ghi domains.json & deploy
          await updateTemplateDomainsJson(matchedTpl, dom, targetLink, targetTele).catch(() => {});

          // Chờ 3s & Verify
          await new Promise((r) => setTimeout(r, 3000));
          await verifyHistoryItem({ domain: dom, id: dom, link: targetLink }, true).catch(() => {});

          const updatedReport = await inspectDomainHealth(dom);
          results.push({
            domain: dom,
            success: true,
            healthScore: updatedReport.healthScore,
            maxScore: updatedReport.maxScore,
            overallStatus: updatedReport.overallStatus,
            report: updatedReport,
          });
        } catch (domErr) {
          results.push({
            domain: dom,
            success: false,
            error: domErr.message,
          });
        }
      }

      const fixedCount = results.filter((r) => r.success && r.healthScore === r.maxScore).length;
      const partialCount = results.filter((r) => r.success && r.healthScore < r.maxScore).length;
      const failedCount = results.filter((r) => !r.success).length;

      sendJson(res, 200, {
        success: true,
        total: cleanDomains.length,
        fixedCount,
        partialCount,
        failedCount,
        results,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/auto-repair (Tự động chẩn đoán & tái triển khai toàn diện)
  if (req.method === "POST" && pathname === "/api/auto-repair") {
    try {
      const body = await parseBody(req);
      const { domain, id, isFullRebuild } = body;
      const history = getHistory();
      const item = history.find((h) => (id && h.id === id) || (domain && h.domain === domain)) || {
        domain,
        id: domain,
        status: "success",
      };

      const targetDomain = domain || item.domain;
      const adminSkip = adminSkipPayload(normalizeDomain(targetDomain || ""));
      if (adminSkip) {
        sendJson(res, 403, adminSkip);
        return;
      }
      if (!canUserManageDomain(currentUser, targetDomain)) {
        sendJson(res, 403, {
          success: false,
          error: `⛔ Bạn chưa được cấp quyền quản lý tên miền [${targetDomain}]. Vui lòng gửi yêu cầu cấp quyền tới Admin!`,
          unauthorizedDomain: targetDomain,
        });
        return;
      }

      const repairResult = await autoRepairDomain(item, Boolean(isFullRebuild));
      sendJson(res, 200, { success: true, ...repairResult });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  function startDeployTracking({ domain, currentUser, actionType, actionLabel, link, tele, template, isBuy, mode }) {
    const historyId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const task = createTask({
      type: mode === "302" ? "DEPLOY_302" : "DEPLOY_LP",
      domain,
      userId: currentUser.userId || currentUser.id || "admin",
      title: `${actionLabel} — ${domain}`,
      params: {
        domain,
        link: link || "",
        tele: tele || "",
        templateId: template?.id || null,
        isBuy: !!isBuy,
        mode: mode === "302" ? "302" : "LP",
        historyId,
        targetUserId: currentUser.userId || currentUser.id || null,
      },
    });
    addHistoryItem({
      id: historyId,
      domain,
      actionType,
      actionLabel,
      templateName: template?.name || (mode === "302" ? "302 Redirect" : "N/A"),
      templateId: template?.id || null,
      cnameTarget: template?.cnameTarget || null,
      link: link || "",
      tele: tele || "",
      status: "in_progress",
      progress: "Khởi tạo tiến trình...",
      isBuy: !!isBuy,
      taskId: task.id,
      userId: currentUser.userId,
      username: currentUser.username,
      fullName: currentUser.fullName,
    });
    updateTaskProgress(task.id, 5, "Khởi tạo tiến trình...", `Bắt đầu: ${actionLabel}`, "info");
    return { task, historyId };
  }

  function bumpDeployProgress(task, historyId, progress, stepMsg) {
    if (historyId) setHistoryProgress(historyId, stepMsg);
    if (task?.id) updateTaskProgress(task.id, progress, stepMsg, stepMsg, "info");
  }

  function finishDeployTracking(task, historyId, historyPatch = {}, result = {}, finishMsg = "Hoàn tất cài đặt") {
    if (historyId) {
      updateHistoryItem(historyId, { status: "success", ...historyPatch });
      setTimeout(() => verifyHistoryItem(historyId, false).catch(() => {}), 3000);
    }
    if (task?.id) completeTask(task.id, { historyId, ...result }, finishMsg);
  }

  function failDeployTracking(task, historyId, friendly, actionMeta = {}) {
    if (historyId) {
      updateHistoryItem(historyId, { status: "failed", error: friendly, ...actionMeta });
    } else {
      addHistoryItem({ ...actionMeta, status: "failed", error: friendly });
    }
    if (task?.id) failTask(task.id, friendly, "Cài đặt thất bại");
  }

  async function runDeployLpJob(ctx) {
    const { body, domain, link, tele, template, deployTask, deployHistId, currentUser, isBuy } = ctx;
    const logs = [];
    try {
      logs.push({ step: "start", message: `Bắt đầu cấu hình Landing Page cho ${domain}` });

      if (isBuy) {
        await assertSpaceshipBuyConfirmed(body, domain);
        bumpDeployProgress(deployTask, deployHistId, 15, "Đang đăng ký tên miền trên Spaceship...");
        logs.push({ step: 1, message: "Đang đăng ký tên miền trên Spaceship..." });
        const contactId = await resolveContactId();
        await registerDomain(domain, contactId);
        logs.push({ step: 1, message: "Đăng ký tên miền thành công trên Spaceship!" });
        bumpDeployProgress(deployTask, deployHistId, 30, "Đăng ký tên miền thành công trên Spaceship!");
      } else {
        logs.push({ step: 1, message: "Xác nhận tên miền có sẵn." });
        bumpDeployProgress(deployTask, deployHistId, 20, "Xác nhận tên miền có sẵn...");
      }

      bumpDeployProgress(deployTask, deployHistId, 45, "Đang kết nối Cloudflare & cập nhật Nameservers...");
      logs.push({ step: 2, message: "Đang kết nối Cloudflare & cập nhật Nameservers..." });
      const zone = await getOrCreateZone(domain);
      const nameservers = getZoneNameservers(zone);
      if (nameservers) {
        await updateNameservers(domain, nameservers).catch(() => {});
      }
      await deleteForwardingPageRules(zone.id).catch(() => {});
      logs.push({ step: 2, message: "Cập nhật Nameservers Cloudflare hoàn tất!" });
      bumpDeployProgress(deployTask, deployHistId, 58, "Cập nhật Nameservers Cloudflare hoàn tất!");

      bumpDeployProgress(deployTask, deployHistId, 65, "Đang gắn tên miền vào Cloudflare Pages...");
      logs.push({ step: 3, message: "Đang gắn tên miền vào Cloudflare Pages (Tự động DNS & SSL)..." });
      let finalTarget = template.cnameTarget;
      if (template.pagesProject) {
        const pagesResult = await addPagesDomain(
          domain,
          template.pagesProject,
          template.path,
          await pagesOptsForTemplate(domain, template)
        ).catch(() => {});
        if (pagesResult?.canonicalSubdomain) {
          finalTarget = pagesResult.canonicalSubdomain;
        }
      }
      await ensurePagesCname(domain, finalTarget).catch(() => {});
      logs.push({ step: 3, message: "Đã kích hoạt Cloudflare Pages Custom Domain & SSL!" });
      bumpDeployProgress(deployTask, deployHistId, 78, "Đã kích hoạt Cloudflare Pages & SSL!");

      bumpDeployProgress(deployTask, deployHistId, 85, "Đang đồng bộ link đích vào domains.json & Deploy...");
      logs.push({ step: 4, message: "Đang đồng bộ link đích vào domains.json & Deploy..." });
      await updateTemplateDomainsJson(template, domain, link, tele);
      logs.push({ step: 4, message: "Đồng bộ cấu hình & Deploy thành công!" });

      const ownership = syncDeployOwnership(domain, currentUser, body, {
        mode: "LP",
        currentLink: link,
        tele: tele || "",
        templateId: template.id,
        templateName: template.name,
        cnameTarget: finalTarget,
        orderId: body.orderId || null,
      });

      if (body.orderId) {
        try {
          markDomainOrderFulfilled(body.orderId, currentUser, { deployMode: "LP" });
        } catch {}
      }

      finishDeployTracking(
        deployTask,
        deployHistId,
        {
          templateName: template.name,
          templateId: template.id,
          cnameTarget: finalTarget,
          link,
          tele,
          userId: ownership.userId,
          username: ownership.username || currentUser.username,
          fullName: ownership.fullName || currentUser.fullName,
          details: { performedBy: currentUser.username, ownerUserId: ownership.userId },
        },
        { domain, link, templateName: template.name, nameservers: nameservers || [] },
        `Đã cài ${domain} — ${template.name}`
      );
    } catch (err) {
      const failedTpl = body?.templateId ? getTemplate(body.templateId) : null;
      const friendly = friendlySpaceshipBuyError(err.message);
      failDeployTracking(deployTask, deployHistId, friendly, {
        domain,
        actionType: isBuy ? "BUY_LP" : "POINT_LP",
        actionLabel: isBuy ? "Mua & Gán Landing Page" : "Trỏ Miền Có Sẵn ➔ LP",
        templateName: failedTpl?.name || template?.name || "N/A",
        templateId: failedTpl?.id || template?.id || body?.templateId || null,
        cnameTarget: failedTpl?.cnameTarget || template?.cnameTarget || null,
        link: link || body?.link || "N/A",
        isBuy,
        userId: currentUser?.userId || null,
        username: currentUser?.username || null,
        fullName: currentUser?.fullName || null,
      });
      console.error(`[deploy-lp/bg] ${domain}:`, err.message);
    } finally {
      activeDeployLocks.delete(domain);
    }
  }

  async function runDeploy302Job(ctx) {
    const { body, domain, link, deployTask, deployHistId, currentUser, isBuy } = ctx;
    const logs = [];
    try {
      logs.push({ step: "start", message: `Bắt đầu cấu hình Trỏ 302 Trực Tiếp cho ${domain}` });

      if (isBuy) {
        await assertSpaceshipBuyConfirmed(body, domain);
        bumpDeployProgress(deployTask, deployHistId, 15, "Đang đăng ký tên miền trên Spaceship...");
        logs.push({ step: 1, message: "Đang đăng ký tên miền trên Spaceship..." });
        const contactId = await resolveContactId();
        await registerDomain(domain, contactId);
        logs.push({ step: 1, message: "Đăng ký tên miền thành công trên Spaceship!" });
        bumpDeployProgress(deployTask, deployHistId, 35, "Đăng ký tên miền thành công!");
      } else {
        logs.push({ step: 1, message: "Xác nhận tên miền có sẵn." });
        bumpDeployProgress(deployTask, deployHistId, 20, "Xác nhận tên miền có sẵn...");
      }

      bumpDeployProgress(deployTask, deployHistId, 55, "Đang cài đặt chuyển hướng 302 trên Cloudflare...");
      logs.push({ step: 2, message: "Đang cài đặt chuyển hướng 302 trên Cloudflare & cập nhật Nameservers..." });
      const cf = await setupDirect302Redirect(domain, link);
      if (cf.nameservers) {
        await updateNameservers(domain, cf.nameservers).catch(() => {});
      }

      const existingRepos = findDomainInRepos(domain);
      for (const m of existingRepos) {
        await removeDomainFromRepo(domain, m.filePath).catch(() => {});
      }

      logs.push({ step: 2, message: "Kích hoạt chuyển hướng 302 trực tiếp thành công!" });
      bumpDeployProgress(deployTask, deployHistId, 88, "Kích hoạt chuyển hướng 302 thành công!");

      const ownership = syncDeployOwnership(domain, currentUser, body, {
        mode: "302",
        currentLink: link,
        templateId: null,
        orderId: body.orderId || null,
      });

      if (body.orderId) {
        try {
          markDomainOrderFulfilled(body.orderId, currentUser, { deployMode: "302" });
        } catch {}
      }

      finishDeployTracking(
        deployTask,
        deployHistId,
        {
          link,
          isBuy,
          userId: ownership.userId,
          username: ownership.username || currentUser.username,
          fullName: ownership.fullName || currentUser.fullName,
          details: { performedBy: currentUser.username, ownerUserId: ownership.userId },
        },
        { domain, link },
        `Đã cài 302 cho ${domain}`
      );
    } catch (err) {
      const friendly = friendlySpaceshipBuyError(err.message);
      failDeployTracking(deployTask, deployHistId, friendly, {
        domain,
        actionType: isBuy ? "BUY_302" : "POINT_302",
        actionLabel: isBuy ? "Mua & Trỏ 302 Trực Tiếp" : "Trỏ 302 Miền Có Sẵn",
        link: link || body?.link || "N/A",
        isBuy,
        userId: currentUser?.userId || null,
        username: currentUser?.username || null,
        fullName: currentUser?.fullName || null,
      });
      console.error(`[deploy-302/bg] ${domain}:`, err.message);
    } finally {
      activeDeployLocks.delete(domain);
    }
  }

  // POST /api/deploy-lp (Mua / Trỏ LP)
  if (req.method === "POST" && pathname === "/api/deploy-lp") {
    let body = {};
    let deployTask = null;
    let deployHistId = null;
    try {
      body = await parseBody(req);
      const { domain: rawDomain, link: rawLink, tele: rawTele, telegram: rawTelegram, templateId, isBuy } = body;

      if (!rawDomain || !rawLink || !templateId) {
        sendJson(res, 400, { success: false, error: "Thiếu thông tin domain, link hoặc templateId" });
        return;
      }

      const domain = normalizeDomain(rawDomain);

      if (rejectNonAdminDirectBuy(res, currentUser, isBuy)) return;

      if (!isBuy) {
        const adminSkip = adminSkipPayload(domain);
        if (adminSkip) {
          sendJson(res, 403, adminSkip);
          return;
        }
      }

      // Kiểm tra quyền đối với tên miền có sẵn (nếu không phải mua mới)
      if (!isBuy && !canUserManageDomain(currentUser, domain)) {
        sendJson(res, 403, {
          success: false,
          error: `⛔ Bạn chưa được cấp quyền quản lý tên miền [${domain}]. Vui lòng gửi yêu cầu cấp quyền tới Admin!`,
          unauthorizedDomain: domain,
        });
        return;
      }

      if (activeDeployLocks.has(domain)) {
        sendJson(res, 429, { success: false, error: `Tên miền [${domain}] đang được xử lý. Vui lòng chờ vài giây.` });
        return;
      }
      activeDeployLocks.add(domain);

      const link = normalizeUrl(rawLink);
      const tele = (rawTele || rawTelegram) ? (rawTele || rawTelegram).trim() : "";
      const template = getTemplate(templateId);

      if (!template) {
        activeDeployLocks.delete(domain);
        sendJson(res, 404, { success: false, error: "Không tìm thấy mẫu Landing Page" });
        return;
      }

      const tracking = startDeployTracking({
        domain,
        currentUser,
        actionType: isBuy ? "BUY_LP" : "POINT_LP",
        actionLabel: isBuy ? "Mua & Gán Landing Page" : "Trỏ Miền Có Sẵn ➔ LP",
        link,
        tele,
        template,
        isBuy,
        mode: "LP",
      });
      deployTask = tracking.task;
      deployHistId = tracking.historyId;

      sendJson(res, 202, {
        success: true,
        queued: true,
        message: `Đã nhận yêu cầu cài đặt ${domain} — theo dõi tab Tiến trình`,
        domain,
        taskId: deployTask.id,
        historyId: deployHistId,
      });

      setImmediate(() => {
        runDeployLpJob({
          body,
          domain,
          link,
          tele,
          template,
          deployTask,
          deployHistId,
          currentUser,
          isBuy,
        }).catch((err) => console.error("[deploy-lp/bg]", domain, err));
      });
    } catch (err) {
      if (body?.domain) {
        activeDeployLocks.delete(normalizeDomain(body.domain));
      }
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/deploy-302 (Mua / Trỏ 302 Trực Tiếp)
  if (req.method === "POST" && pathname === "/api/deploy-302") {
    let body = {};
    let deployTask = null;
    let deployHistId = null;
    try {
      body = await parseBody(req);
      const { domain: rawDomain, link: rawLink, isBuy } = body;

      if (!rawDomain || !rawLink) {
        sendJson(res, 400, { success: false, error: "Thiếu thông tin domain hoặc link" });
        return;
      }

      const domain = normalizeDomain(rawDomain);

      if (rejectNonAdminDirectBuy(res, currentUser, isBuy)) return;

      if (!isBuy) {
        const adminSkip = adminSkipPayload(domain);
        if (adminSkip) {
          sendJson(res, 403, adminSkip);
          return;
        }
      }

      if (!isBuy && !canUserManageDomain(currentUser, domain)) {
        sendJson(res, 403, {
          success: false,
          error: `⛔ Bạn chưa được cấp quyền quản lý tên miền [${domain}]. Vui lòng gửi yêu cầu cấp quyền tới Admin!`,
          unauthorizedDomain: domain,
        });
        return;
      }

      if (activeDeployLocks.has(domain)) {
        sendJson(res, 429, { success: false, error: `Tên miền [${domain}] đang được xử lý. Vui lòng chờ vài giây.` });
        return;
      }
      activeDeployLocks.add(domain);

      const link = normalizeUrl(rawLink);

      const tracking = startDeployTracking({
        domain,
        currentUser,
        actionType: isBuy ? "BUY_302" : "POINT_302",
        actionLabel: isBuy ? "Mua & Trỏ 302 Trực Tiếp" : "Trỏ 302 Miền Có Sẵn",
        link,
        tele: "",
        template: null,
        isBuy,
        mode: "302",
      });
      deployTask = tracking.task;
      deployHistId = tracking.historyId;

      sendJson(res, 202, {
        success: true,
        queued: true,
        message: `Đã nhận yêu cầu cài 302 cho ${domain} — theo dõi tab Tiến trình`,
        domain,
        taskId: deployTask.id,
        historyId: deployHistId,
      });

      setImmediate(() => {
        runDeploy302Job({
          body,
          domain,
          link,
          deployTask,
          deployHistId,
          currentUser,
          isBuy,
        }).catch((err) => console.error("[deploy-302/bg]", domain, err));
      });
    } catch (err) {
      if (body?.domain) {
        activeDeployLocks.delete(normalizeDomain(body.domain));
      }
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/set-link (Cập nhật link thông minh: tự nhận diện Landing Page hay 302)
  if (req.method === "POST" && pathname === "/api/set-link") {
    try {
      const body = await parseBody(req);
      const { domain: rawDomain, link: rawLink, tele: rawTele, telegram: rawTelegram } = body;

      if (!rawDomain || !rawLink) {
        sendJson(res, 400, { success: false, error: "Thiếu thông tin domain hoặc link" });
        return;
      }

      const domain = normalizeDomain(rawDomain);
      const link = normalizeUrl(rawLink);
      const tele = (rawTele || rawTelegram) ? (rawTele || rawTelegram).trim() : "";

      // Kiểm tra quyền quản trị tên miền
      if (!canUserManageDomain(currentUser, domain)) {
        sendJson(res, 403, {
          success: false,
          error: `⛔ Bạn chưa được cấp quyền quản lý tên miền [${domain}]. Vui lòng gửi yêu cầu cấp quyền tới Admin!`,
          unauthorizedDomain: domain,
        });
        return;
      }

      const result = await smartSetLink(domain, link, tele, {
        userId: currentUser.userId,
        username: currentUser.username,
        fullName: currentUser.fullName,
      });
      if (result.success) {
        syncDeployOwnershipPreserve(domain, currentUser, body, {
          mode: result.mode || "LP",
          currentLink: link,
          tele: tele || "",
        });
        invalidateHubDomainCaches();
        sendJson(res, 200, result);
      } else {
        sendJson(res, 400, result);
      }
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/batch-setlink (Cập nhật link hàng loạt)
  if (req.method === "POST" && pathname === "/api/batch-setlink") {
    try {
      const body = await parseBody(req);
      const { domains, link: rawLink } = body;

      if (!Array.isArray(domains) || domains.length === 0 || !rawLink) {
        sendJson(res, 400, { success: false, error: "Thiếu danh sách domains hoặc link" });
        return;
      }

      const link = normalizeUrl(rawLink);
      const results = [];

      for (const rawDom of domains) {
        try {
          const dom = normalizeDomain(rawDom);
          if (!canUserManageDomain(currentUser, dom)) {
            results.push({
              domain: dom,
              status: "error",
              error: "Không có quyền quản lý tên miền này",
            });
            continue;
          }
          const resItem = await smartSetLink(dom, link, "", {
            userId: currentUser.userId,
            username: currentUser.username,
            fullName: currentUser.fullName,
          });
          results.push({
            domain: dom,
            status: resItem.success ? "success" : "error",
            type: resItem.type,
            repos: resItem.updatedRepos,
            error: resItem.error,
          });
        } catch (domErr) {
          results.push({ domain: rawDom, status: "error", error: domErr.message });
        }
      }

      const successCount = results.filter((r) => r.status === "success").length;
      sendJson(res, 200, {
        success: true,
        message: `Đã xử lý đổi link cho ${successCount}/${domains.length} tên miền!`,
        total: domains.length,
        successCount,
        results,
      });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // POST /api/switch-template (Đổi mẫu Landing Page)
  if (req.method === "POST" && pathname === "/api/switch-template") {
    let histId = null;
    try {
      const body = await parseBody(req);
      const { domain: rawDomain, targetTemplateId, newLink: rawLink, newTele: rawTele, tele: rawTele2 } = body;

      if (!rawDomain || !targetTemplateId) {
        sendJson(res, 400, { success: false, error: "Thiếu domain hoặc targetTemplateId" });
        return;
      }

      const domain = normalizeDomain(rawDomain);

      const adminSkip = adminSkipPayload(domain);
      if (adminSkip) {
        sendJson(res, 403, adminSkip);
        return;
      }

      // Kiểm tra quyền quản trị tên miền
      if (!canUserManageDomain(currentUser, domain)) {
        sendJson(res, 403, {
          success: false,
          error: `⛔ Bạn chưa được cấp quyền quản lý tên miền [${domain}]. Vui lòng gửi yêu cầu cấp quyền tới Admin!`,
          unauthorizedDomain: domain,
        });
        return;
      }

      const targetTpl = getTemplate(targetTemplateId);

      if (!targetTpl) {
        sendJson(res, 404, { success: false, error: "Không tìm thấy mẫu Landing Page đích" });
        return;
      }

      histId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      addHistoryItem({
        id: histId,
        domain,
        actionType: "SWITCH_TPL",
        actionLabel: "Đổi Mẫu Landing Page",
        templateName: targetTpl.name,
        templateId: targetTpl.id,
        cnameTarget: targetTpl.cnameTarget || null,
        link: rawLink || "",
        tele: rawTele || rawTele2 || "",
        status: "in_progress",
        progress: `Đang chuyển sang mẫu [${targetTpl.name}]...`,
        userId: currentUser.userId,
        username: currentUser.username,
        fullName: currentUser.fullName,
        previousTemplateId: body.fromTemplateId || null,
        previousTemplateName: body.fromTemplateName || null,
        previousLink: body.previousLink || null,
        details: { step: `Đang chuyển sang mẫu [${targetTpl.name}]...` },
      });

      // 1. Kế thừa link nếu form để trống (domains.json → Page Rule → ownership → history → live 302)
      setHistoryProgress(histId, "Đang lấy link kế thừa...");
      const inherited = await resolveInheritedLink(domain, {
        providedLink: rawLink || "",
        providedTele: rawTele || rawTele2 || "",
      });
      let activeLink = inherited.link;
      let activeTele = inherited.tele || "";

      // Kiểm tra Zone Cloudflare: xoá mọi 302 Page Rule để kích hoạt Landing Page
      setHistoryProgress(histId, "Đang gỡ Page Rule 302 (nếu có)...");
      const zone = await findZoneByName(domain).catch(() => null);
      if (zone) {
        await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) }).catch(() => {});
      }

      if (!activeLink) {
        activeLink = "https://t.me/";
      }
      updateHistoryItem(histId, { link: activeLink, tele: activeTele });

      // 2. Xoá domain khỏi các repo cũ
      setHistoryProgress(histId, "Đang gỡ domain khỏi repo mẫu cũ...");
      const existingMatches = findDomainInRepos(domain);
      const removedFrom = [];
      for (const m of existingMatches) {
        const removed = await removeDomainFromRepo(domain, m.filePath);
        if (removed) removedFrom.push(m.folderPath);
      }

      // 3. Gắn Custom Domain Pages Freze TRƯỚC — không xoá project cũ trước (tránh 1014)
      let finalTarget = targetTpl.cnameTarget;
      if (targetTpl.pagesProject) {
        setHistoryProgress(histId, `Đang gắn domain vào Pages [${targetTpl.pagesProject}]...`);
        try {
          const pagesRes = await addPagesDomain(
            domain,
            targetTpl.pagesProject,
            targetTpl.path,
            await pagesOptsForTemplate(domain, targetTpl)
          );
          if (pagesRes?.canonicalSubdomain) {
            finalTarget = pagesRes.canonicalSubdomain;
          }
          // chờ SSL active đúng account Pages
          if (pagesRes?.projectName) {
            await waitForPagesDomainActive(
              pagesRes.projectName,
              domain,
              pagesRes.accountId || undefined,
              90000
            ).catch(() => {});
          }
        } catch (pagesErr) {
          console.error(`[Switch-Template] Lỗi addPagesDomain cho ${domain}:`, pagesErr.message);
          updateHistoryItem(histId, {
            status: "failed",
            progress: null,
            error: pagesErr.message,
            cnameTarget: finalTarget,
          });
          sendJson(res, 500, {
            success: false,
            error: `Gắn Pages thất bại (chưa đụng DNS): ${pagesErr.message}`,
            histId,
          });
          return;
        }
      }

      // 4. DNS CNAME chỉ sau khi Pages đã nhận domain
      setHistoryProgress(histId, `Đang trỏ CNAME → ${finalTarget}...`);
      try {
        await ensurePagesCname(domain, finalTarget);
      } catch (cnameErr) {
        console.error(`[Switch-Template] Lỗi ensurePagesCname cho ${domain}:`, cnameErr.message);
        updateHistoryItem(histId, {
          status: "failed",
          progress: null,
          error: cnameErr.message,
          cnameTarget: finalTarget,
        });
        sendJson(res, 500, {
          success: false,
          error: `Pages OK nhưng CNAME lỗi (1014/DNS): ${cnameErr.message}`,
          histId,
        });
        return;
      }

      try {
        const proj = String(finalTarget || "").replace(/\.pages\.dev$/i, "");
        if (proj) {
          setHistoryProgress(histId, "Đang chờ Pages domain active (SSL)...");
          await waitForPagesDomainActive(proj, domain, undefined, 120000);
        }
      } catch (waitErr) {
        console.warn(`[Switch-Template] Chờ Pages active: ${waitErr.message}`);
      }

      // 6. Đồng bộ domains.json & Deploy + verify live trên đúng project CNAME
      setHistoryProgress(histId, `Đang push Git + force deploy live mẫu [${targetTpl.name}]...`);
      const syncRes = await updateTemplateDomainsJson(targetTpl, domain, activeLink, activeTele, {
        cnameTarget: finalTarget,
        pagesProject: String(finalTarget || "").replace(/\.pages\.dev$/i, ""),
        accountId: targetTpl.pagesAccountId || undefined,
        liveTimeoutMs: 120000,
      });

      if (syncRes?.liveEnsure && syncRes.liveEnsure.ok === false) {
        updateHistoryItem(histId, {
          status: "failed",
          progress: null,
          error: syncRes.liveEnsure.error || "Live domains.json chưa có link sau deploy",
          cnameTarget: finalTarget,
          link: activeLink,
          tele: activeTele,
          details: { inheritSource: inherited.source, removedFrom, liveEnsure: syncRes.liveEnsure },
        });
        sendJson(res, 500, {
          success: false,
          error: `Git OK nhưng live chưa có link: ${syncRes.liveEnsure.error || "domains.json mismatch"}`,
          histId,
          liveEnsure: syncRes.liveEnsure,
        });
        return;
      }

      // 7. Xoá cache Cloudflare Zone
      if (zone) {
        await cfRequest(`/zones/${zone.id}/purge_cache`, {
          method: "POST",
          body: { purge_everything: true },
          token: tokenForZone(zone),
        }).catch(() => {});
      }

      // Ghi ownership + lịch sử
      syncDeployOwnershipPreserve(domain, currentUser, body, {
        mode: "LP",
        currentLink: activeLink,
        templateId: targetTpl.id,
        cnameTarget: finalTarget,
        tele: activeTele || "",
      });

      const histItem = updateHistoryItem(histId, {
        status: "success",
        progress: null,
        liveStatus: syncRes?.liveEnsure?.ok ? "200_OK" : "PENDING_200",
        cnameTarget: finalTarget,
        link: activeLink,
        tele: activeTele,
        details: { inheritSource: inherited.source, removedFrom, liveEnsure: syncRes?.liveEnsure || null },
      });

      // Kích hoạt verify live trong background
      if (histItem?.id) {
        verifyHistoryItem(histItem.id, true).catch(() => {});
      }

      sendJson(res, 200, {
        success: true,
        message: `Đã chuyển đổi mẫu thành công sang [${targetTpl.name}] cho ${domain}!`,
        liveEnsure: syncRes?.liveEnsure || null,
        domain,
        link: activeLink,
        tele: activeTele,
        newTemplateName: targetTpl.name,
        cnameTarget: finalTarget,
        removedFrom,
        histId,
      });
    } catch (err) {
      if (histId) {
        updateHistoryItem(histId, {
          status: "failed",
          progress: null,
          error: err.message,
        });
      }
      sendJson(res, 500, { success: false, error: err.message, histId });
    }
    return;
  }

  // ── 2. STATIC FILES ───────────────────────────────────────────────────────

  // Phục vụ ảnh screenshot từ thư mục /screenshots/
  if (pathname.startsWith("/screenshots/")) {
    const filename = pathname.replace(/^\/screenshots\//, "");
    let filePath = path.join(PUBLIC_DIR, "screenshots", filename);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(SCREENSHOTS_DIR, filename);
    }
    serveStaticFile(res, filePath);
    return;
  }

  // Phục vụ các mẫu Landing Page đã Clone từ C:\Landingpages\CLONED
  if (pathname.startsWith("/cloned/")) {
    const rel = pathname.replace(/^\/cloned\//, "");
    let target = path.join("C:\\Landingpages\\CLONED", rel);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, "index.html");
    }
    serveStaticFile(res, target);
    return;
  }

  // Phục vụ giao diện web: ưu tiên frontend/dist (React), fallback /public/
  const webRoot = resolveWebRoot();
  let file = pathname === "/" ? "index.html" : pathname;
  if (file === "/login" || file === "login") file = "login.html";
  let filePath = path.join(webRoot, file);

  // SPA fallback: unknown paths (không có extension) → index.html của React
  if (!fs.existsSync(filePath) && webRoot === FRONTEND_DIST_DIR && !path.extname(file)) {
    filePath = path.join(FRONTEND_DIST_DIR, "index.html");
  } else if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
    filePath = `${filePath}.html`;
  }
  serveStaticFile(res, filePath);
});

export function startServer(initialPort = PORT, maxRetries = 20) {
  return new Promise((resolve, reject) => {
    let currentPort = parseInt(initialPort, 10) || 3000;
    let attempts = 0;

    const onError = (err) => {
      if (err.code === "EADDRINUSE") {
        attempts++;
        if (attempts <= maxRetries) {
          const nextPort = currentPort + 1;
          console.warn(`⚠️ Cổng ${currentPort} đã bị chiếm dụng (EADDRINUSE). Tự động thử chuyển sang cổng ${nextPort}...`);
          currentPort = nextPort;
          setTimeout(() => {
            server.listen(currentPort, "0.0.0.0");
          }, 150);
          return;
        }
      }
      server.removeListener("error", onError);
      reject(err);
    };

    server.on("error", onError);

    server.once("listening", () => {
      server.removeListener("error", onError);
      const actualPort = server.address().port;
      process.env.PORT = String(actualPort);
      process.env.WEB_HUB_URL = `http://localhost:${actualPort}`;
      server.actualPort = actualPort;
      console.log(`🌐 Web Dashboard & API Server đang chạy tại: http://localhost:${actualPort} (hoặc http://127.0.0.1:${actualPort})`);
      resolve({ server, port: actualPort });
    });

    server.listen(currentPort, "0.0.0.0");
  });
}

// Nếu chạy trực tiếp file server.js
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  startServer();
}
