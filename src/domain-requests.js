import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignDomain, unassignDomain, getDomainOwner } from "./ownership.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const REQUESTS_FILE = path.join(DATA_DIR, "domain_requests.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadRequests() {
  if (!fs.existsSync(REQUESTS_FILE)) {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify([], null, 2), "utf8");
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveRequests(data) {
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Tạo yêu cầu xin cấp quyền quản lý tên miền
 */
export function createDomainRequest({ userId, username, fullName, domain, note = "" }) {
  const normDomain = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!normDomain) {
    throw new Error("Tên miền không hợp lệ");
  }

  const requests = loadRequests();

  // Kiểm tra xem đã có request đang chờ duyệt cho domain này của user chưa
  const existingPending = requests.find(
    (r) => r.userId === userId && r.domain === normDomain && r.status === "pending"
  );
  if (existingPending) {
    throw new Error(`Bạn đã có một yêu cầu cấp quyền cho tên miền ${normDomain} đang chờ Admin duyệt!`);
  }

  // Kiểm tra xem user đã sở hữu domain này chưa
  const currentOwner = getDomainOwner(normDomain);
  if (currentOwner && currentOwner.userId === userId) {
    throw new Error(`Bạn đã có toàn quyền quản lý tên miền ${normDomain} rồi!`);
  }

  const newRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId,
    username: username || userId,
    fullName: fullName || username || userId,
    domain: normDomain,
    note: note.trim(),
    status: "pending", // pending | approved | rejected
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    rejectReason: null,
  };

  requests.unshift(newRequest);
  saveRequests(requests);
  return newRequest;
}

/**
 * Lấy danh sách yêu cầu cấp quyền
 */
export function listDomainRequests({ userId = null, role = "user", status = null } = {}) {
  let list = loadRequests();
  if (role !== "admin" && userId) {
    list = list.filter((r) => r.userId === userId);
  }
  if (status) {
    list = list.filter((r) => r.status === status);
  }
  return list.map((r) => {
    const owner = getDomainOwner(r.domain);
    const isConflict = Boolean(owner && owner.userId !== r.userId);
    return {
      ...r,
      currentOwner: owner ? { userId: owner.userId, username: owner.username || owner.userId, assignedAt: owner.assignedAt } : null,
      isConflict,
    };
  });
}

/**
 * Lấy chi tiết 1 yêu cầu
 */
export function getDomainRequestById(id) {
  const requests = loadRequests();
  return requests.find((r) => r.id === id) || null;
}

/**
 * Admin phê duyệt yêu cầu cấp quyền
 */
export function approveDomainRequest(requestId, adminUser) {
  const requests = loadRequests();
  const req = requests.find((r) => r.id === requestId);
  if (!req) {
    throw new Error("Không tìm thấy yêu cầu cấp quyền này");
  }
  if (req.status !== "pending") {
    throw new Error(`Yêu cầu này đã được xử lý trước đó (Trạng thái: ${req.status})`);
  }

  req.status = "approved";
  req.resolvedAt = new Date().toISOString();
  req.resolvedBy = adminUser.username || adminUser.id || "admin";

  // Cấp quyền sở hữu trong ownership
  assignDomain(req.domain, req.userId, {
    approvedBy: req.resolvedBy,
    approvedAt: req.resolvedAt,
    username: req.username,
    fullName: req.fullName,
    requestId: req.id,
  });

  saveRequests(requests);
  return req;
}

/**
 * Admin từ chối yêu cầu cấp quyền
 */
export function rejectDomainRequest(requestId, adminUser, reason = "Admin từ chối yêu cầu") {
  const requests = loadRequests();
  const req = requests.find((r) => r.id === requestId);
  if (!req) {
    throw new Error("Không tìm thấy yêu cầu cấp quyền này");
  }
  if (req.status !== "pending") {
    throw new Error(`Yêu cầu này đã được xử lý trước đó (Trạng thái: ${req.status})`);
  }

  req.status = "rejected";
  req.resolvedAt = new Date().toISOString();
  req.resolvedBy = adminUser.username || adminUser.id || "admin";
  req.rejectReason = reason;

  saveRequests(requests);
  return req;
}
