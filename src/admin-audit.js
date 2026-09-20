/**
 * Admin audit log — quản trị user / quyền / Xu / duyệt đơn.
 * File: data/admin_audit.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const AUDIT_FILE = path.join(DATA_DIR, "admin_audit.json");
const MAX_ITEMS = 2000;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAudit() {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(AUDIT_FILE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveAudit(list) {
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(list.slice(0, MAX_ITEMS), null, 2), "utf8");
}

/**
 * @param {object} opts
 * @param {string} opts.action - USER_CREATE | USER_UPDATE | USER_DELETE | USER_TOPUP | DOMAIN_ASSIGN | DOMAIN_UNASSIGN | DOMAIN_REQUEST_APPROVE | DOMAIN_REQUEST_REJECT | DOMAIN_ORDER_APPROVE | DOMAIN_ORDER_REJECT | PASSWORD_RESET | ROLE_CHANGE | STATUS_CHANGE
 * @param {object} [opts.actor] - admin performing action
 * @param {object} [opts.target] - affected user { userId, username }
 * @param {string} [opts.summary]
 * @param {object} [opts.details]
 */
export function logAdminAction({ action, actor = {}, target = {}, summary = "", details = {} }) {
  const item = {
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    action: String(action || "UNKNOWN"),
    summary: summary || action,
    actor: {
      userId: actor.userId || actor.id || null,
      username: actor.username || null,
      fullName: actor.fullName || null,
      role: actor.role || null,
    },
    target: {
      userId: target.userId || target.id || null,
      username: target.username || null,
      domain: target.domain || null,
    },
    details: details && typeof details === "object" ? details : {},
  };

  const list = loadAudit();
  list.unshift(item);
  saveAudit(list);
  return item;
}

export function listAdminAudit({ limit = 100, action = "", q = "", targetUserId = "" } = {}) {
  let list = loadAudit();
  const act = String(action || "").trim().toUpperCase();
  const query = String(q || "").trim().toLowerCase();
  const tid = String(targetUserId || "").trim();

  if (act) list = list.filter((x) => String(x.action || "").toUpperCase() === act || String(x.action || "").toUpperCase().includes(act));
  if (tid) list = list.filter((x) => x.target?.userId === tid);
  if (query) {
    list = list.filter((x) => {
      const blob = [
        x.summary,
        x.action,
        x.actor?.username,
        x.target?.username,
        x.target?.domain,
        JSON.stringify(x.details || {}),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(query);
    });
  }

  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  return {
    total: list.length,
    items: list.slice(0, lim),
  };
}
