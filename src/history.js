import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { calculateDomainPrice } from "./wallet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

function ensureHistoryFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

export function getHistory() {
  ensureHistoryFile();
  try {
    const content = fs.readFileSync(HISTORY_FILE, "utf8");
    const list = JSON.parse(content || "[]");
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error("Lỗi đọc file lịch sử:", err.message);
    return [];
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

    list[index] = {
      ...list[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), "utf8");
    return list[index];
  } catch (err) {
    console.error("Lỗi cập nhật lịch sử:", err.message);
    return null;
  }
}

export function clearHistory() {
  ensureHistoryFile();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Lấy link/template gần nhất của domain từ lịch sử (để ghi previousLink khi đổi) */
export function getLastDomainHistoryMeta(domain) {
  const list = getHistory();
  const d = (domain || "").toLowerCase();
  const hit = list.find((h) => h.domain && h.domain.toLowerCase() === d && h.status !== "failed");
  if (!hit) return null;
  return {
    link: hit.link || null,
    tele: hit.tele || null,
    templateId: hit.templateId || null,
    templateName: hit.templateName || null,
    actionType: hit.actionType || null,
  };
}
