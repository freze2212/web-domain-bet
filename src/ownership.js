import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUserById } from "./auth.js";

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
  try {
    if (!fs.existsSync(OWNERSHIP_FILE)) {
      fs.writeFileSync(OWNERSHIP_FILE, JSON.stringify({}, null, 2), "utf8");
      ownershipCache = { mtime: Date.now(), data: {} };
      return ownershipCache.data;
    }
    const mtime = fs.statSync(OWNERSHIP_FILE).mtimeMs;
    if (ownershipCache.data && ownershipCache.mtime === mtime) {
      return ownershipCache.data;
    }
    const data = JSON.parse(fs.readFileSync(OWNERSHIP_FILE, "utf8"));
    ownershipCache = { mtime, data: data && typeof data === "object" ? data : {} };
    return ownershipCache.data;
  } catch {
    ownershipCache = { mtime: Date.now(), data: {} };
    return ownershipCache.data;
  }
}

function saveOwnership(data) {
  fs.writeFileSync(OWNERSHIP_FILE, JSON.stringify(data, null, 2), "utf8");
  try {
    ownershipCache = { mtime: fs.statSync(OWNERSHIP_FILE).mtimeMs, data };
  } catch {
    ownershipCache = { mtime: Date.now(), data };
  }
}

export function assignDomain(domain, userId, meta = {}) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const map = loadOwnership();
  map[norm] = {
    domain: norm,
    userId,
    assignedAt: new Date().toISOString(),
    ...meta,
  };
  saveOwnership(map);
  return map[norm];
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
  if (user.role === "admin" || user.userId === "u_admin" || user.id === "u_admin" || user.username === "admin") {
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
  const ownerId = resolveDeployOwnerUserId(currentUser, body);
  const owner = getUserById(ownerId);
  return assignDomain(domain, ownerId, {
    username: owner?.username,
    fullName: owner?.fullName,
    assignedBy: currentUser?.userId || currentUser?.username || "system",
    ...meta,
  });
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
