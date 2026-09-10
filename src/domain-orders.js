import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignDomain, getDomainOwner } from "./ownership.js";
import { calculateDomainPriceRule, getBalance, deductBalance } from "./wallet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const ORDERS_FILE = path.join(DATA_DIR, "domain_orders.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadOrders() {
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2), "utf8");
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveOrders(data) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Tạo đơn đặt mua tên miền mới (Chờ Admin duyệt - CHƯA trừ xu lúc này)
 */
export function createDomainOrder({ userId, username, fullName, domain, note = "" }) {
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

  const newOrder = {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId,
    username: username || userId,
    fullName: fullName || username || userId,
    domain: normDomain,
    note: note.trim(),
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
export function approveDomainOrder(orderId, adminUser) {
  const orders = loadOrders();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    throw new Error("Không tìm thấy đơn đặt mua này");
  }
  if (order.status !== "pending") {
    throw new Error(`Đơn hàng này đã được xử lý trước đó (Trạng thái: ${order.status})`);
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
  assignDomain(order.domain, order.userId, {
    approvedBy: adminUser.username || adminUser.id || "admin",
    approvedAt: new Date().toISOString(),
    username: order.username,
    fullName: order.fullName,
    orderId: order.id,
    purchasedWithXu: order.priceXu,
  });

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
