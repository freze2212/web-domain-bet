import { findActiveTaskForDomain, reconcileStaleTasks } from "./task-queue.js";
import { getHistory, reconcileStaleHistory } from "./history.js";

/** Tác vụ chạy đồng bộ trong request (sửa miền, đổi link nhanh…) — không có task/history in_progress. */
const inlineLocks = new Map();

function norm(domain) {
  return String(domain || "").trim().toLowerCase().replace(/^www\./, "");
}

let lastReconcileAt = 0;
function reconcileThrottled() {
  if (Date.now() - lastReconcileAt < 10_000) return;
  lastReconcileAt = Date.now();
  reconcileStaleTasks();
  reconcileStaleHistory();
}

/**
 * Miền đang có tiến trình chạy? Trả về null nếu rảnh.
 * Nguồn: hàng đợi task, lịch sử in_progress (đổi mẫu, chờ zone 302, chờ live) và khoá đồng bộ.
 */
export function getDomainBusy(domain) {
  const d = norm(domain);
  if (!d) return null;

  const inline = inlineLocks.get(d);
  if (inline) return { domain: d, label: inline.label, since: inline.since, username: inline.username || null };

  reconcileThrottled();
  const task = findActiveTaskForDomain(d);
  if (task) {
    return {
      domain: d,
      label: task.title || task.type,
      since: task.startedAt || task.createdAt,
      username: task.params?.username || null,
      step: task.currentStep || null,
      taskId: task.id,
    };
  }

  const row = getHistory().find(
    (h) => (h.status === "in_progress" || h.status === "pending") && norm(h.domain) === d
  );
  if (row) {
    return {
      domain: d,
      label: row.actionLabel || row.actionType,
      since: row.timestamp,
      username: row.username || null,
      step: row.progress || row.details?.step || null,
      historyId: row.id,
    };
  }
  return null;
}

export function domainBusyMessage(busy) {
  const at = busy.since ? new Date(busy.since).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "";
  const meta = [at && `bắt đầu ${at}`, busy.username && `bởi @${busy.username}`].filter(Boolean).join(", ");
  const step = busy.step ? ` — đang: ${busy.step}` : "";
  return (
    `⏳ Tên miền [${busy.domain}] đang có tiến trình chạy: ${busy.label}${meta ? ` (${meta})` : ""}${step}. ` +
    `Vui lòng chờ tiến trình xong (thành công hoặc thất bại) rồi mới đổi tiếp.`
  );
}

export function domainBusyPayload(busy) {
  return { success: false, code: "DOMAIN_BUSY", error: domainBusyMessage(busy), busy };
}

/** Trả 409 nếu miền bận. Dùng ngay trước khi tạo task / ghi history (không await xen giữa). */
export function rejectIfDomainBusy(res, sendJson, domain) {
  const busy = getDomainBusy(domain);
  if (!busy) return false;
  sendJson(res, 409, domainBusyPayload(busy));
  return true;
}

/** Giữ khoá trong lúc chạy tác vụ đồng bộ. Ném lỗi DOMAIN_BUSY nếu miền đang bận. */
export async function withDomainLock(domain, label, user, fn) {
  const d = norm(domain);
  const busy = getDomainBusy(d);
  if (busy) {
    const err = new Error(domainBusyMessage(busy));
    err.code = "DOMAIN_BUSY";
    err.busy = busy;
    throw err;
  }
  inlineLocks.set(d, { label, since: new Date().toISOString(), username: user?.username || null });
  try {
    return await fn();
  } finally {
    inlineLocks.delete(d);
  }
}
