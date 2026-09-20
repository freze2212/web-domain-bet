import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { calculateDomainPrice } from "./wallet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

let historyCache = { mtime: -1, data: null };

export function invalidateHistoryCache() {
  historyCache = { mtime: -1, data: null };
}

function ensureHistoryFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), "utf8");
    historyCache = { mtime: Date.now(), data: [] };
  }
}

export function getHistory() {
  ensureHistoryFile();
  try {
    const mtime = fs.statSync(HISTORY_FILE).mtimeMs;
    if (historyCache.data && historyCache.mtime === mtime) {
      return historyCache.data;
    }
    const content = fs.readFileSync(HISTORY_FILE, "utf8");
    const list = JSON.parse(content || "[]");
    const data = Array.isArray(list) ? list : [];
    historyCache = { mtime, data };
    return data;
  } catch (err) {
    console.error("Lỗi đọc file lịch sử:", err.message);
    historyCache = { mtime: Date.now(), data: [] };
    return historyCache.data;
  }
}

export function addHistoryItem(item) {
  ensureHistoryFile();
  try {
    const list = getHistory();
    const now = new Date().toISOString();
    const newEntry = {
      id: item.id || `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: item.userId || null,
      username: item.username || null,
      fullName: item.fullName || null,
      timestamp: item.timestamp || now,
      domain: item.domain || "N/A",
      actionType: item.actionType || "DEPLOY", // BUY_LP, BUY_302, POINT_LP, POINT_302, SWITCH_TPL, SET_LINK, SWITCH_LP, SWITCH_302
      actionLabel: item.actionLabel || "Cài đặt tên miền",
      templateName: item.templateName || "N/A",
      templateId: item.templateId || null,
      cnameTarget: item.cnameTarget || null,
      link: item.link || "N/A",
      tele: item.tele || item.teleLink || null,
      previousLink: item.previousLink || null,
      previousTemplateId: item.previousTemplateId || null,
      previousTemplateName: item.previousTemplateName || null,
      status: item.status || "success", // success | failed | in_progress
      isBuy: !!item.isBuy,
      price: item.price || (item.isBuy ? `${calculateDomainPrice(item.domain).toFixed(2)} USD` : null),
      cfAccount: item.cfAccount || "Freze (Freze@itkjc.com)",
      error: item.error || null,
      details: item.details || null,
      taskId: item.taskId || null,
    };

    list.unshift(newEntry);

    // Giữ tối đa 500 bản ghi gần nhất
    const trimmed = list.slice(0, 500);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), "utf8");
    invalidateHistoryCache();
    return newEntry;
  } catch (err) {
    console.error("Lỗi ghi lịch sử:", err.message);
    return null;
  }
}

export function updateHistoryItem(id, updates) {
  ensureHistoryFile();
  try {
    const list = getHistory();
    const index = list.findIndex((x) => x.id === id || (x.domain === id && !x.liveScreenshot));
    if (index === -1) return null;

    const prev = list[index];
    const nextDetails =
      updates.details && typeof updates.details === "object"
        ? { ...(prev.details || {}), ...updates.details }
        : updates.details !== undefined
          ? updates.details
          : prev.details;

    list[index] = {
      ...prev,
      ...updates,
      details: nextDetails,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), "utf8");
    invalidateHistoryCache();
    return list[index];
  } catch (err) {
    console.error("Lỗi cập nhật lịch sử:", err.message);
    return null;
  }
}

/** Ghi nhanh bước đang chạy (hiện ở cột Live Status khi status=in_progress) */
export function setHistoryProgress(id, step, extra = {}) {
  return updateHistoryItem(id, {
    status: "in_progress",
    progress: step,
    details: { step, ...extra },
  });
}

export function clearHistory() {
  ensureHistoryFile();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), "utf8");
    invalidateHistoryCache();
    return true;
  } catch {
    return false;
  }
}

/**
 * Đóng history in_progress treo:
 * - Có bản success/failed mới hơn cùng domain → đánh dấu cancelled
 * - Treo > maxAgeMs → failed (stale)
 */
export function reconcileStaleHistory(maxAgeMs = 2 * 60 * 60 * 1000) {
  ensureHistoryFile();
  try {
    const list = getHistory();
    const now = Date.now();
    let changed = 0;

    const latestTerminalByDomain = new Map();
    for (const h of list) {
      if (h.status !== "success" && h.status !== "failed") continue;
      const key = String(h.domain || "")
        .toLowerCase()
        .replace(/^www\./, "");
      if (!key) continue;
      const ts = new Date(h.updatedAt || h.timestamp || 0).getTime();
      const prev = latestTerminalByDomain.get(key);
      if (!prev || ts > prev.ts) latestTerminalByDomain.set(key, { ts, status: h.status, id: h.id });
    }

    for (const h of list) {
      if (h.status !== "in_progress" && h.status !== "pending") continue;
      const key = String(h.domain || "")
        .toLowerCase()
        .replace(/^www\./, "");
      const ts = new Date(h.updatedAt || h.timestamp || 0).getTime();
      const terminal = key ? latestTerminalByDomain.get(key) : null;

      if (terminal && terminal.ts >= ts && terminal.id !== h.id) {
        h.status = "cancelled";
        h.progress = null;
        h.error = null;
        h.updatedAt = new Date().toISOString();
        h.details = { ...(h.details || {}), closedAs: "superseded_by_later_result", laterId: terminal.id };
        changed++;
        continue;
      }

      if (ts && now - ts > maxAgeMs) {
        h.status = "failed";
        h.progress = null;
        h.error =
          "Tiến trình treo quá lâu (restart / job chết giữa chừng). Đã đóng tự động — kiểm tra live hoặc chạy lại.";
        h.updatedAt = new Date().toISOString();
        h.details = { ...(h.details || {}), closedAs: "stale_in_progress" };
        changed++;
      }
    }

    if (changed > 0) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), "utf8");
      invalidateHistoryCache();
    }
    return changed;
  } catch (err) {
    console.error("reconcileStaleHistory:", err.message);
    return 0;
  }
}

/** Lấy link/template gần nhất của domain từ lịch sử (để ghi previousLink khi đổi) */
export function getLastDomainHistoryMeta(domain) {
  const list = getHistory();
  const d = (domain || "").toLowerCase();
  const hit = list.find(
    (h) =>
      h.domain &&
      h.domain.toLowerCase() === d &&
      h.status !== "failed" &&
      h.status !== "in_progress" &&
      h.status !== "pending"
  );
  if (!hit) return null;
  return {
    link: hit.link || null,
    tele: hit.tele || null,
    templateId: hit.templateId || null,
    templateName: hit.templateName || null,
    actionType: hit.actionType || null,
  };
}
