import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const OWNERSHIP_FILE = path.join(DATA_DIR, "domain_ownership.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadOwnership() {
  if (!fs.existsSync(OWNERSHIP_FILE)) {
    fs.writeFileSync(OWNERSHIP_FILE, JSON.stringify({}, null, 2), "utf8");
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(OWNERSHIP_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveOwnership(data) {
  fs.writeFileSync(OWNERSHIP_FILE, JSON.stringify(data, null, 2), "utf8");
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
