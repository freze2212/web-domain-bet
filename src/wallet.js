import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadUsers } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const WALLETS_FILE = path.join(DATA_DIR, "wallets.json");
const PRICING_FILE = path.join(DATA_DIR, "pricing.json");
const TRANSACTIONS_FILE = path.join(DATA_DIR, "transactions.json");
const BANK_CONFIG_FILE = path.join(DATA_DIR, "bank_config.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_BANK_CONFIG = {
  bankId: "MB", // Mã ngân hàng VietQR (MB, VCB, TCB, ACB, TPB, VPB,...)
  bankName: "MBBank (Ngân Hàng Quân Đội)",
  accountNumber: "0988889999",
  accountName: "NGUYEN VAN FREZE",
  vndRate: 25400,
  prefix: "NAP",
};

const DEFAULT_PRICING = {
  currency: "USD",
  vndRate: 25400,
  defaultPrice: 4.98,
  maxAutoBuyPriceUsd: 12.00,
  tldPrices: {
    ".top": { reg: 1.40, renew: 3.85 },
    ".com": { reg: 8.88, renew: 9.98 },
    ".net": { reg: 10.98, renew: 12.98 },
    ".org": { reg: 8.88, renew: 9.98 },
    ".xyz": { reg: 1.80, renew: 10.98 },
    ".shop": { reg: 1.48, renew: 29.98 },
    ".online": { reg: 2.15, renew: 21.38 },
    ".site": { reg: 1.48, renew: 29.98 },
    ".store": { reg: 1.78, renew: 49.98 },
    ".space": { reg: 1.48, renew: 24.98 },
    ".icu": { reg: 1.88, renew: 7.98 },
    ".cyou": { reg: 1.88, renew: 7.98 },
    ".cfd": { reg: 1.88, renew: 7.98 },
    ".fun": { reg: 1.88, renew: 19.98 },
    ".uno": { reg: 1.88, renew: 9.98 },
    ".click": { reg: 1.98, renew: 10.98 },
    ".club": { reg: 2.98, renew: 14.98 },
    ".tech": { reg: 2.48, renew: 44.98 },
    ".work": { reg: 2.98, renew: 10.98 },
    ".live": { reg: 2.07, renew: 25.88 },
    ".pw": { reg: 2.88, renew: 6.50 },
    ".pro": { reg: 2.98, renew: 18.98 },
    ".vip": { reg: 3.62, renew: 4.70 },
    ".us": { reg: 3.50, renew: 8.98 },
    ".info": { reg: 3.68, renew: 19.98 },
    ".link": { reg: 3.98, renew: 11.98 },
    ".biz": { reg: 4.50, renew: 17.98 },
    ".co": { reg: 4.98, renew: 31.05 },
    ".me": { reg: 4.98, renew: 17.98 },
    ".cc": { reg: 5.98, renew: 9.98 },
    ".win": { reg: 2.88, renew: 28.98 },
    ".bet": { reg: 14.88, renew: 18.98 },
    ".app": { reg: 14.50, renew: 16.50 },
    ".dev": { reg: 14.50, renew: 16.50 },
    ".io": { reg: 32.00, renew: 36.00 },
    ".ai": { reg: 159.96, renew: 79.98 },
    ".inc": { reg: 999.00, renew: 999.00 },
  },
};

function loadJson(file, defaultVal) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2), "utf8");
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return defaultVal;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

export function getBankConfig() {
  return loadJson(BANK_CONFIG_FILE, DEFAULT_BANK_CONFIG);
}

export function updateBankConfig(newConfig) {
  const current = getBankConfig();
  const updated = { ...current, ...newConfig };
  saveJson(BANK_CONFIG_FILE, updated);
  return updated;
}

export function generateVietQrInfo(username, amountXu = 100) {
  const bank = getBankConfig();
  const amountVnd = Math.round(amountXu * 1000);
  const amountUsd = Math.round((amountVnd / (bank.vndRate || 25400)) * 100) / 100;
  const transferContent = `${bank.prefix} ${username.toUpperCase()} ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const qrUrl = `https://img.vietqr.io/image/${bank.bankId}-${bank.accountNumber}-compact2.png?amount=${amountVnd}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(bank.accountName)}`;

  return {
    bankId: bank.bankId,
    bankName: bank.bankName,
    accountNumber: bank.accountNumber,
    accountName: bank.accountName,
    amountXu,
    amountUsd,
    amountVnd,
    transferContent,
    qrUrl,
    vndRate: bank.vndRate,
  };
}

export function getPricing() {
  return loadJson(PRICING_FILE, DEFAULT_PRICING);
}

export function updatePricing(newPricing) {
  const current = getPricing();
  const updated = { ...current, ...newPricing };
  saveJson(PRICING_FILE, updated);
  return updated;
}

export function calculateDomainPriceDetail(domain) {
  if (!domain) return { regPrice: 4.98, renewPrice: 4.98 };
  const pricing = getPricing();
  const clean = domain.trim().toLowerCase();
  for (const [tld, val] of Object.entries(pricing.tldPrices || {})) {
    if (clean.endsWith(tld)) {
      if (typeof val === "object" && val !== null) {
        return {
          regPrice: typeof val.reg === "number" ? val.reg : parseFloat(val.reg || 4.98),
          renewPrice: typeof val.renew === "number" ? val.renew : parseFloat(val.renew || val.reg || 4.98),
          isUnlisted: false,
        };
      }
      const num = parseFloat(val) || 4.98;
      return { regPrice: num, renewPrice: num, isUnlisted: false };
    }
  }
  // An toàn tuyệt đối: Nếu đuôi miền chưa khai báo, không áp bừa giá rẻ
  return {
    regPrice: null,
    renewPrice: null,
    isUnlisted: true,
    requiresApproval: true,
  };
}

export function calculateDomainPriceRule(domain) {
  if (!domain) return { priceXu: 250, priceVnd: 250000, priceUsd: 2.50, tld: "", ruleApplied: "Mặc định" };
  const clean = domain.trim().toLowerCase().replace(/^www\./, "");
  
  // 1. Quy tắc .COM = 350 xu (350k)
  if (clean.endsWith(".com")) {
    return {
      priceXu: 350,
      priceVnd: 350000,
      priceUsd: 8.88,
      tld: ".com",
      ruleApplied: ".COM (350 Xu)",
    };
  }
  // 2. Quy tắc .NET = 400 xu (400k)
  if (clean.endsWith(".net")) {
    return {
      priceXu: 400,
      priceVnd: 400000,
      priceUsd: 10.98,
      tld: ".net",
      ruleApplied: ".NET (400 Xu)",
    };
  }

  // 3. Quy tắc theo giá gốc USD
  const detail = calculateDomainPriceDetail(clean);
  const regUsd = detail.regPrice !== null ? detail.regPrice : 4.98;

  // Dưới 2 USD => 200 xu (200k)
  if (regUsd < 2.00) {
    return {
      priceXu: 200,
      priceVnd: 200000,
      priceUsd: regUsd,
      tld: clean.slice(clean.lastIndexOf(".")),
      ruleApplied: "Giá gốc < 2$ (200 Xu)",
    };
  }

  // Dưới 5 USD (2$ <= usd < 5$) => 250 xu (250k)
  if (regUsd < 5.00) {
    return {
      priceXu: 250,
      priceVnd: 250000,
      priceUsd: regUsd,
      tld: clean.slice(clean.lastIndexOf(".")),
      ruleApplied: "Giá gốc 2$ - <5$ (250 Xu)",
    };
  }

  // Các đuôi đặc thù >= 5$ khác (quy đổi tỷ lệ an toàn)
  const specialXu = Math.round(regUsd * 30);
  return {
    priceXu: specialXu,
    priceVnd: specialXu * 1000,
    priceUsd: regUsd,
    tld: clean.slice(clean.lastIndexOf(".")),
    ruleApplied: `Đặc thù Registry (${specialXu} Xu)`,
  };
}

export function calculateDomainPriceInXu(domain) {
  const rule = calculateDomainPriceRule(domain);
  const detail = calculateDomainPriceDetail(domain);
  return {
    regXu: rule.priceXu,
    renewXu: rule.priceXu,
    regUsd: rule.priceUsd,
    renewUsd: detail.renewPrice || rule.priceUsd,
    regVnd: rule.priceVnd,
    renewVnd: rule.priceVnd,
    ruleApplied: rule.ruleApplied,
  };
}

export function calculateDomainPrice(domain) {
  const rule = calculateDomainPriceRule(domain);
  return rule.priceXu;
}

export function getBalance(userId) {
  const wallets = loadJson(WALLETS_FILE, { u_admin: 999999, u_member_demo: 500 });
  return typeof wallets[userId] === "number" ? wallets[userId] : 0;
}

export function topupBalance(userId, amount, note = "Nạp Xu vào ví", createdBy = "admin") {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    throw new Error("Số lượng Xu nạp không hợp lệ");
  }

  const wallets = loadJson(WALLETS_FILE, {});
  const oldBalance = typeof wallets[userId] === "number" ? wallets[userId] : 0;
  const newBalance = Math.round((oldBalance + num) * 100) / 100;
  wallets[userId] = newBalance;
  saveJson(WALLETS_FILE, wallets);

  // Ghi nhật ký giao dịch
  addTransaction({
    userId,
    type: "TOPUP",
    amount: num,
    oldBalance,
    newBalance,
    note,
    createdBy,
  });

  return { userId, balance: newBalance };
}

export function deductBalance(userId, amount, reason = "Mua tên miền / Dịch vụ", meta = {}) {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    throw new Error("Số lượng Xu thanh toán không hợp lệ");
  }

  // Admin có thể miễn trừ hoặc không trừ
  if (userId === "u_admin" || userId === "admin") {
    return { userId, balance: 999999 };
  }

  const wallets = loadJson(WALLETS_FILE, {});
  const oldBalance = typeof wallets[userId] === "number" ? wallets[userId] : 0;
  if (oldBalance < num) {
    throw new Error(`Số dư không đủ! (Ví hiện có: ${oldBalance.toLocaleString("vi-VN")} Xu, Cần thanh toán: ${num.toLocaleString("vi-VN")} Xu). Vui lòng nạp thêm Xu (100k = 100 Xu).`);
  }

  const newBalance = Math.round((oldBalance - num) * 100) / 100;
  wallets[userId] = newBalance;
  saveJson(WALLETS_FILE, wallets);

  addTransaction({
    userId,
    type: "PURCHASE",
    amount: -num,
    oldBalance,
    newBalance,
    note: reason,
    meta,
    createdBy: userId,
  });

  return { userId, balance: newBalance };
}

export function addTransaction(tx) {
  const transactions = loadJson(TRANSACTIONS_FILE, []);
  const record = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...tx,
    timestamp: new Date().toISOString(),
  };
  transactions.unshift(record);
  saveJson(TRANSACTIONS_FILE, transactions.slice(0, 500));
  return record;
}

export function getTransactions(userId = null) {
  const transactions = loadJson(TRANSACTIONS_FILE, []);
  if (!userId || userId === "admin" || userId === "u_admin") {
    return transactions;
  }
  return transactions.filter((t) => t.userId === userId);
}

/**
 * Xử lý Webhook thanh toán tự động từ Ngân hàng (VietQR / SePay / Casso / PayOS)
 */
export function processBankWebhook(payload) {
  const bank = getBankConfig();
  const content = (payload.description || payload.content || payload.msg || "").toUpperCase();
  const amountVnd = parseFloat(payload.amount || payload.transferAmount || 0);

  if (!content || amountVnd <= 0) {
    throw new Error("Dữ liệu webhook ngân hàng không hợp lệ");
  }

  // Bóc tách Username từ nội dung chuyển khoản: NAP <username>
  const regex = new RegExp(`${bank.prefix}\\s+([A-Za-z0-9_]+)`, "i");
  const match = content.match(regex);
  if (!match) {
    throw new Error(`Nội dung chuyển khoản không khớp cú pháp [${bank.prefix} USERNAME]`);
  }

  const targetUsername = match[1].toLowerCase();
  const users = loadUsers();
  const user = users.find((u) => u.username.toLowerCase() === targetUsername);
  if (!user) {
    throw new Error(`Không tìm thấy người dùng [${targetUsername}] tương ứng với cú pháp chuyển khoản`);
  }

  // Quy đổi VND sang Xu (100.000 VNĐ = 100 Xu => 1 Xu = 1.000 VNĐ)
  const amountXu = Math.round(amountVnd / 1000);
  const topupRes = topupBalance(
    user.id,
    amountXu,
    `Tự động nạp ${amountXu.toLocaleString("vi-VN")} Xu qua QR Ngân Hàng (${amountVnd.toLocaleString("vi-VN")} VNĐ) - Ref: ${payload.referenceCode || payload.id || "BANK_AUTO"}`,
    "AUTO_WEBHOOK"
  );

  return {
    success: true,
    user: user.username,
    amountVnd,
    amountXu,
    newBalance: topupRes.balance,
  };
}
