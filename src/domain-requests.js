import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assignDomain, unassignDomain, getDomainOwner, describeOwnerConflict } from "./ownership.js";
import { normalizeDomain, cleanText } from "./utils.js";
import { getStore, setStore } from "./mongo-stores.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const REQUESTS_FILE = path.join(DATA_DIR, "domain_requests.json");
const MAX_PENDING_PER_USER = 20;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadRequests() {
  const data = getStore("domain_requests");
  return Array.isArray(data) ? data : [];
}

function saveRequests(data) {
  setStore("domain_requests", Array.isArray(data) ? data : []);
}

/**
 * Tạo yêu cầu xin cấp quyền quản lý tên miền
 */
export function createDomainRequest({ userId, username, fullName, domain, note = "" }) {
  const normDomain = normalizeDomain(domain).replace(/^www\./, "");
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
  const myPending = requests.filter((r) => r.userId === userId && r.status === "pending").length;
  if (myPending >= MAX_PENDING_PER_USER) {
    throw new Error(`Bạn đang có ${myPending} yêu cầu chờ duyệt. Chờ Admin xử lý bớt rồi gửi tiếp.`);
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
    note: cleanText(note, 200),
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
export function approveDomainRequest(requestId, adminUser, { confirmTransfer = false } = {}) {
  const requests = loadRequests();
  const req = requests.find((r) => r.id === requestId);
  if (!req) {
    throw new Error("Không tìm thấy yêu cầu cấp quyền này");
  }
  if (req.status !== "pending") {
    throw new Error(`Yêu cầu này đã được xử lý trước đó (Trạng thái: ${req.status})`);
  }

  const conflict = describeOwnerConflict(req.domain, req.userId);
  if (conflict && !confirmTransfer) {
    const err = new Error(
      `Tên miền ${conflict.domain} đang thuộc @${conflict.username}. Xác nhận đổi chủ thì mới cấp được.`
    );
    err.code = "OWNER_CONFLICT";
    err.currentOwner = conflict;
    throw err;
  }

  req.status = "approved";
  req.resolvedAt = new Date().toISOString();
  req.resolvedBy = adminUser.username || adminUser.id || "admin";

  assignDomain(
    req.domain,
    req.userId,
    {
      approvedBy: req.resolvedBy,
      approvedAt: req.resolvedAt,
      username: req.username,
      fullName: req.fullName,
      requestId: req.id,
    },
    { allowTransfer: true }
  );

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
