import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignDomain, getDomainOwner, describeOwnerConflict, unassignDomain } from "./ownership.js";
import { calculateDomainPriceRule, getBalance, deductBalance, topupBalance } from "./wallet.js";
import { getStore, setStore } from "./mongo-stores.js";
import { cleanText, normalizeUrl } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const ORDERS_FILE = path.join(DATA_DIR, "domain_orders.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadOrders() {
  const data = getStore("domain_orders");
  return Array.isArray(data) ? data : [];
}

function saveOrders(data) {
  const list = Array.isArray(data) ? data : [];
  setStore("domain_orders", list);
}

/**
 * Tạo đơn đặt mua tên miền mới (Chờ Admin duyệt).
 * Chưa trừ Xu lúc gửi, nhưng ví phải đủ trả đơn này và các đơn đang chờ.
 */
export function createDomainOrder({ userId, username, fullName, domain, note = "", link = "", tele = "", templateId = "", deployMode = "LP" }) {
  const normDomain = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!normDomain) {
    throw new Error("Vui lòng cung cấp tên miền hợp lệ");
  }

  // Tính giá theo quy tắc định giá
  const pricing = calculateDomainPriceRule(normDomain);
  const currentBalance = getBalance(userId);

  const orders = loadOrders();

  // Kiểm tra nếu đã có đơn đặt mua đang chờ duyệt cho tên miền này
  const existingPending = orders.find(
    (o) => o.domain === normDomain && o.status === "pending"
  );
  if (existingPending) {
    if (existingPending.userId === userId) {
      throw new Error(`Bạn đã có đơn đặt mua cho tên miền ${normDomain} đang chờ Admin duyệt!`);
    } else {
      throw new Error(`Tên miền ${normDomain} hiện đã có một đơn đặt mua khác đang chờ Admin duyệt!`);
    }
  }

  const owned = getDomainOwner(normDomain);
  if (owned?.userId) {
    throw new Error(`Tên miền ${normDomain} đã có người quản lý (@${owned.username || owned.userId}). Không gửi đơn mua để nhận miền này được.`);
  }

  const isAdminAccount = userId === "u_admin" || userId === "admin";
  const pendingHold = orders
    .filter((o) => o.userId === userId && o.status === "pending")
    .reduce((sum, o) => sum + (Number(o.priceXu) || 0), 0);
  if (!isAdminAccount && currentBalance < pricing.priceXu + pendingHold) {
    const have = currentBalance.toLocaleString("vi-VN");
    const need = pricing.priceXu.toLocaleString("vi-VN");
    const held = pendingHold
      ? ` Đơn đang chờ đã chiếm ${pendingHold.toLocaleString("vi-VN")} Xu.`
      : "";
    if (currentBalance <= 0) {
      throw new Error("Bạn chưa có Xu. Hãy nạp rồi gửi lại.");
    }
    throw new Error(`Ví không đủ Xu để gửi yêu cầu mua. Cần ${need} Xu, hiện có ${have} Xu.${held} Hãy nạp thêm rồi gửi lại.`);
  }

  const newOrder = {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId,
    username: username || userId,
    fullName: fullName || username || userId,
    domain: normDomain,
    note: cleanText(note, 200),
    link: link ? normalizeUrl(String(link)).slice(0, 500) : "",
    tele: tele ? normalizeUrl(String(tele)).slice(0, 500) : "",
    templateId: String(templateId || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80),
    deployMode: deployMode === "302" ? "302" : "LP",
    priceXu: pricing.priceXu,
    priceVnd: pricing.priceVnd,
    priceUsd: pricing.priceUsd,
    ruleApplied: pricing.ruleApplied,
    status: "pending", // pending | approved | rejected
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    rejectReason: null,
    deductedAmount: 0,
  };

  orders.unshift(newOrder);
  saveOrders(orders);

  return {
    order: newOrder,
    currentBalance,
    estimatedCost: pricing.priceXu,
  };
}

/**
 * Lấy danh sách đơn đặt mua tên miền (User xem của mình, Admin xem tất cả)
 */
export function listDomainOrders({ userId = null, role = "user", status = null } = {}) {
  let list = loadOrders();
  if (role !== "admin" && userId) {
    list = list.filter((o) => o.userId === userId);
  }
  if (status) {
    list = list.filter((o) => o.status === status);
  }

  return list.map((o) => {
    const userBalance = getBalance(o.userId);
    const hasEnoughBalance = userBalance >= o.priceXu;
    const currentOwner = getDomainOwner(o.domain);

    return {
      ...o,
      userCurrentBalance: userBalance,
      hasEnoughBalance,
      currentOwner: currentOwner ? { userId: currentOwner.userId, username: currentOwner.username } : null,
    };
  });
}

/**
 * Lấy chi tiết một đơn đặt mua
 */
export function getDomainOrderById(id) {
  const orders = loadOrders();
  return orders.find((o) => o.id === id) || null;
}

/**
 * Admin duyệt đơn đặt mua: Kiểm tra số dư -> Trừ xu -> Cấp quyền & Khởi tạo
 */
export function approveDomainOrder(orderId, adminUser, { confirmTransfer = false } = {}) {
  const orders = loadOrders();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    throw new Error("Không tìm thấy đơn đặt mua này");
  }
  if (order.status !== "pending") {
    throw new Error(`Đơn hàng này đã được xử lý trước đó (Trạng thái: ${order.status})`);
  }

  const conflict = describeOwnerConflict(order.domain, order.userId);
  if (conflict && !confirmTransfer) {
    const err = new Error(
      `Tên miền ${conflict.domain} đang thuộc @${conflict.username}. Xác nhận đổi chủ thì mới duyệt đơn được.`
    );
    err.code = "OWNER_CONFLICT";
    err.currentOwner = conflict;
    throw err;
  }

  const userBalance = getBalance(order.userId);
  if (userBalance < order.priceXu && order.userId !== "u_admin" && order.userId !== "admin") {
    throw new Error(
      `Số dư của người dùng [${order.username}] không đủ để thanh toán! (Ví hiện có: ${userBalance.toLocaleString("vi-VN")} Xu, Cần: ${order.priceXu.toLocaleString("vi-VN")} Xu). Vui lòng thông báo nạp thêm Xu trước khi duyệt đơn.`
    );
  }

  // 1. Thực hiện trừ xu của User
  const deductRes = deductBalance(
    order.userId,
    order.priceXu,
    `Thanh toán mua tên miền [${order.domain}] - Đơn hàng #${order.id}`,
    { orderId: order.id, domain: order.domain, rule: order.ruleApplied }
  );

  // 2. Gán quyền quản trị tên miền cho User
  assignDomain(
    order.domain,
    order.userId,
    {
      approvedBy: adminUser.username || adminUser.id || "admin",
      approvedAt: new Date().toISOString(),
      username: order.username,
      fullName: order.fullName,
      orderId: order.id,
      purchasedWithXu: order.priceXu,
    },
    { allowTransfer: true }
  );

  // 3. Cập nhật trạng thái đơn hàng
  order.status = "approved";
  order.resolvedAt = new Date().toISOString();
  order.resolvedBy = adminUser.username || adminUser.id || "admin";
  order.deductedAmount = order.priceXu;
  order.remainingBalance = deductRes.balance;

  saveOrders(orders);

  return {
    order,
    deductedAmount: order.priceXu,
    remainingBalance: deductRes.balance,
  };
}

/**
 * Admin từ chối đơn đặt mua (KHÔNG trừ xu của User)
 */
export function rejectDomainOrder(orderId, adminUser, reason = "Admin từ chối đơn đặt mua") {
  const orders = loadOrders();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    throw new Error("Không tìm thấy đơn đặt mua này");
  }
  if (order.status !== "pending") {
    throw new Error(`Đơn hàng này đã được xử lý trước đó (Trạng thái: ${order.status})`);
  }

  order.status = "rejected";
  order.resolvedAt = new Date().toISOString();
  order.resolvedBy = adminUser.username || adminUser.id || "admin";
  order.rejectReason = reason;

  saveOrders(orders);

  return {
    order,
    message: "Đã từ chối đơn đặt mua thành công. Không trừ Xu của người dùng.",
  };
}

/**
 * Cài sau khi duyệt bị fail: hoàn Xu cho thành viên, gỡ miền khỏi tài khoản,
 * đưa đơn về chờ duyệt để admin cài lại (lần duyệt sau trừ Xu lại).
 */
export function refundFailedDomainOrder(orderId, domain, reason) {
  if (!orderId) return { refunded: false };
  const orders = loadOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order || order.status !== "approved" || order.fulfilledAt) return { refunded: false };

  const norm = String(domain || order.domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (!norm || order.domain !== norm) return { refunded: false };

  const amount = Number(order.deductedAmount || order.priceXu) || 0;
  const isAdminAccount = order.userId === "u_admin" || order.userId === "admin";
  if (!isAdminAccount && amount > 0) {
    topupBalance(
      order.userId,
      amount,
      reason || `Hoàn ${amount} Xu vì cài ${norm} thất bại`,
      "AUTO_REFUND"
    );
  }

  const owner = getDomainOwner(norm);
  if (!owner || owner.userId === order.userId) unassignDomain(norm);

  order.status = "pending";
  order.resolvedAt = null;
  order.resolvedBy = null;
  order.deductedAmount = 0;
  order.remainingBalance = null;
  order.lastRefundAt = new Date().toISOString();
  order.lastRefundReason = reason || "";
  saveOrders(orders);

  return {
    refunded: !isAdminAccount && amount > 0,
    reopened: true,
    amount: !isAdminAccount ? amount : 0,
    userId: order.userId,
  };
}

/** Từ chối mọi đơn còn chờ duyệt của 1 user (khi xoá user). */
export function rejectPendingOrdersForUser(userId, adminUser, reason) {
  const orders = loadOrders();
  const now = new Date().toISOString();
  let n = 0;
  for (const o of orders) {
    if (o.userId !== userId || o.status !== "pending") continue;
    o.status = "rejected";
    o.resolvedAt = now;
    o.resolvedBy = adminUser?.username || "admin";
    o.rejectReason = reason;
    n++;
  }
  if (n) saveOrders(orders);
  return n;
}

/** Admin đánh dấu đơn đã mua Spaceship + cài xong */
export function markDomainOrderFulfilled(orderId, adminUser, { deployMode } = {}) {
  const orders = loadOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error("Không tìm thấy đơn đặt mua này");
  if (order.status !== "approved") {
    throw new Error(`Chỉ fulfill đơn đã duyệt (hiện: ${order.status})`);
  }
  order.fulfilledAt = new Date().toISOString();
  order.fulfilledBy = adminUser.username || adminUser.id || "admin";
  if (deployMode) order.deployMode = deployMode === "302" ? "302" : "LP";
  saveOrders(orders);
  return { order };
}
