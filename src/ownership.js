import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUserById } from "./auth.js";
import { getStore, setStore } from "./mongo-stores.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const OWNERSHIP_FILE = path.join(DATA_DIR, "domain_ownership.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let ownershipCache = { mtime: -1, data: null };

export function invalidateOwnershipCache() {
  ownershipCache = { mtime: -1, data: null };
}

function loadOwnership() {
  const data = getStore("domains");
  const map = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  ownershipCache = { mtime: Date.now(), data: map };
  return map;
}

function saveOwnership(data) {
  ownershipCache = { mtime: Date.now(), data };
  setStore("domains", data);
}

function isHubAdminAccount(userId, username) {
  const id = String(userId || "");
  const name = String(username || "").toLowerCase();
  return id === "u_admin" || id === "admin" || name === "admin";
}

export function describeOwnerConflict(domain, nextUserId) {
  const existing = getDomainOwner(domain);
  if (!existing?.userId || existing.userId === nextUserId) return null;
  const user = getUserById(existing.userId);
  const username = user?.username || existing.username || existing.userId;
  if (isHubAdminAccount(existing.userId, username)) return null;
  return {
    domain: existing.domain,
    userId: existing.userId,
    username,
    fullName: user?.fullName || existing.fullName || "",
  };
}

export function assignDomain(domain, userId, meta = {}, options = {}) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const map = loadOwnership();
  const existing = map[norm];
  if (existing?.userId && existing.userId !== userId && !options.allowTransfer) {
    const conflict = describeOwnerConflict(norm, userId);
    const err = new Error(
      `Tên miền ${norm} đang thuộc @${conflict?.username || existing.userId}. Xác nhận đổi chủ thì mới gán được.`
    );
    err.code = "OWNER_CONFLICT";
    err.currentOwner = conflict;
    throw err;
  }
  map[norm] = {
    domain: norm,
    userId,
    assignedAt: new Date().toISOString(),
    ...meta,
  };
  saveOwnership(map);
  return map[norm];
}

/** Cập nhật meta, giữ nguyên chủ cũ nếu miền đã có người quản lý. */
export function touchDomainOwner(domain, fallbackUserId, meta = {}) {
  const existing = getDomainOwner(domain);
  const userId = existing?.userId || fallbackUserId;
  if (!userId) return existing;
  const owner = getUserById(userId);
  return assignDomain(domain, userId, {
    username: owner?.username || existing?.username,
    fullName: owner?.fullName || existing?.fullName,
    ...meta,
  });
}

export function unassignDomain(domain) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const map = loadOwnership();
  delete map[norm];
  saveOwnership(map);
  return true;
}

export function getDomainOwner(domain) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const map = loadOwnership();
  return map[norm] || null;
}

/**
 * Kiểm tra xem user có quyền quản trị tên miền này hay không
 */
export function canUserManageDomain(user, domain) {
  if (!user) return false;
  if (user.role === "admin" || user.userId === "u_admin" || user.id === "u_admin") {
    return true; // Admin có quyền với tất cả các tên miền
  }

  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const owner = getDomainOwner(norm);
  const userId = user.userId || user.id;

  if (owner && owner.userId === userId) {
    return true;
  }
  return false;
}

export function listUserDomainNames(userId) {
  if (!userId || userId === "admin" || userId === "u_admin") {
    return null; // All domains allowed for admin
  }
  const map = loadOwnership();
  return Object.keys(map).filter((d) => map[d].userId === userId);
}

export function getUserDomainsDetails(userId) {
  const map = loadOwnership();
  return Object.values(map).filter((item) => item.userId === userId);
}

export function listAllAssignments() {
  return loadOwnership();
}

/** Admin có thể gán miền cho khách qua targetUserId; user thường = chính họ */
export function resolveDeployOwnerUserId(currentUser, body = {}) {
  const selfId = currentUser?.userId || currentUser?.id;
  if (!selfId) throw new Error("Thiếu thông tin user đăng nhập");
  const target = String(body.targetUserId || body.ownerUserId || "").trim();
  if (currentUser?.role === "admin" && target) {
    const u = getUserById(target);
    if (!u) throw new Error(`Không tìm thấy user [${target}] để gán quyền miền`);
    return u.id;
  }
  return selfId;
}

/** Gán/cập nhật ownership sau deploy thành công */
export function syncDeployOwnership(domain, currentUser, body, meta = {}) {
  const existing = getDomainOwner(domain);
  let ownerId = resolveDeployOwnerUserId(currentUser, body);
  const confirm = body?.confirmTransfer === true;
  if (existing?.userId && existing.userId !== ownerId && !confirm) {
    ownerId = existing.userId;
  }
  const owner = getUserById(ownerId);
  return assignDomain(
    domain,
    ownerId,
    {
      username: owner?.username || existing?.username,
      fullName: owner?.fullName || existing?.fullName,
      assignedBy: currentUser?.userId || currentUser?.username || "system",
      ...meta,
    },
    { allowTransfer: confirm }
  );
}

/** Giữ chủ cũ khi admin sửa miền của khách (set-link / switch) */
export function syncDeployOwnershipPreserve(domain, currentUser, body, meta = {}) {
  const existing = getDomainOwner(domain);
  if (existing?.userId && currentUser?.role === "admin") {
    const owner = getUserById(existing.userId);
    return assignDomain(domain, existing.userId, {
      username: owner?.username || existing.username,
      fullName: owner?.fullName || existing.fullName,
      assignedBy: currentUser?.userId || currentUser?.username || "admin",
      ...meta,
    });
  }
  return syncDeployOwnership(domain, currentUser, body, meta);
}
