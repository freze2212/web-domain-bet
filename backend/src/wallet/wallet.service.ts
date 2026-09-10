import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { appConfig } from '../config/env.config.js';

export interface BankConfig {
  bankId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  vndRate: number;
  prefix: string;
}

export interface PricingConfig {
  currency: string;
  vndRate: number;
  defaultPrice: number;
  maxAutoBuyPriceUsd: number;
  tldPrices: Record<string, number | { reg: number; renew: number }>;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'TOPUP' | 'PURCHASE' | 'REFUND';
  amount: number;
  oldBalance: number;
  newBalance: number;
  note: string;
  meta?: any;
  createdBy?: string;
  timestamp: string;
}

const DEFAULT_BANK_CONFIG: BankConfig = {
  bankId: 'MB',
  bankName: 'MBBank (Ngân Hàng Quân Đội)',
  accountNumber: '0988889999',
  accountName: 'NGUYEN VAN FREZE',
  vndRate: 25400,
  prefix: 'NAP',
};

const DEFAULT_PRICING: PricingConfig = {
  currency: 'USD',
  vndRate: 25400,
  defaultPrice: 4.98,
  maxAutoBuyPriceUsd: 12.00,
  tldPrices: {
    '.top': { reg: 1.40, renew: 3.85 },
    '.com': { reg: 8.88, renew: 9.98 },
    '.net': { reg: 10.98, renew: 12.98 },
    '.org': { reg: 8.88, renew: 9.98 },
    '.xyz': { reg: 1.80, renew: 10.98 },
    '.shop': { reg: 1.48, renew: 29.98 },
    '.online': { reg: 2.15, renew: 21.38 },
    '.site': { reg: 1.48, renew: 29.98 },
    '.store': { reg: 1.78, renew: 49.98 },
    '.space': { reg: 1.48, renew: 24.98 },
    '.icu': { reg: 1.88, renew: 7.98 },
    '.cyou': { reg: 1.88, renew: 7.98 },
    '.cfd': { reg: 1.88, renew: 7.98 },
    '.fun': { reg: 1.88, renew: 19.98 },
    '.uno': { reg: 1.88, renew: 9.98 },
    '.click': { reg: 1.98, renew: 10.98 },
    '.club': { reg: 2.98, renew: 14.98 },
    '.tech': { reg: 2.48, renew: 44.98 },
    '.work': { reg: 2.98, renew: 10.98 },
    '.live': { reg: 2.07, renew: 25.88 },
    '.pw': { reg: 2.88, renew: 6.50 },
    '.pro': { reg: 2.98, renew: 18.98 },
    '.vip': { reg: 3.62, renew: 4.70 },
    '.us': { reg: 3.50, renew: 8.98 },
    '.info': { reg: 3.68, renew: 19.98 },
    '.link': { reg: 3.98, renew: 11.98 },
    '.biz': { reg: 4.50, renew: 17.98 },
    '.co': { reg: 4.98, renew: 31.05 },
    '.me': { reg: 4.98, renew: 17.98 },
    '.cc': { reg: 5.98, renew: 9.98 },
    '.win': { reg: 2.88, renew: 28.98 },
    '.bet': { reg: 14.88, renew: 18.98 },
    '.app': { reg: 14.50, renew: 16.50 },
    '.dev': { reg: 14.50, renew: 16.50 },
    '.io': { reg: 32.00, renew: 36.00 },
    '.ai': { reg: 159.96, renew: 79.98 },
    '.inc': { reg: 999.00, renew: 999.00 },
  },
};

@Injectable()
export class WalletService {
  private getPath(filename: string): string {
    return path.join(appConfig.dataDir, filename);
  }

  private loadJson<T>(filename: string, defaultVal: T): T {
    const file = this.getPath(filename);
    if (!fs.existsSync(file)) {
      if (!fs.existsSync(appConfig.dataDir)) {
        fs.mkdirSync(appConfig.dataDir, { recursive: true });
      }
      fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2), 'utf8');
      return defaultVal;
    }
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return defaultVal;
    }
  }

  private saveJson(filename: string, data: any): void {
    const file = this.getPath(filename);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  getBankConfig(): BankConfig {
    return this.loadJson<BankConfig>('bank_config.json', DEFAULT_BANK_CONFIG);
  }

  updateBankConfig(newConfig: Partial<BankConfig>): BankConfig {
    const current = this.getBankConfig();
    const updated = { ...current, ...newConfig };
    this.saveJson('bank_config.json', updated);
    return updated;
  }

  generateVietQrInfo(username: string, amountXu = 100) {
    const bank = this.getBankConfig();
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

  getPricing(): PricingConfig {
    return this.loadJson<PricingConfig>('pricing.json', DEFAULT_PRICING);
  }

  updatePricing(newPricing: Partial<PricingConfig>): PricingConfig {
    const current = this.getPricing();
    const updated = { ...current, ...newPricing };
    this.saveJson('pricing.json', updated);
    return updated;
  }

  calculateDomainPriceDetail(domain: string) {
    if (!domain) return { regPrice: 4.98, renewPrice: 4.98, isUnlisted: false };
    const pricing = this.getPricing();
    const clean = domain.trim().toLowerCase();
    for (const [tld, val] of Object.entries(pricing.tldPrices || {})) {
      if (clean.endsWith(tld)) {
        if (typeof val === 'object' && val !== null) {
          return {
            regPrice: typeof val.reg === 'number' ? val.reg : parseFloat((val as any).reg || '4.98'),
            renewPrice: typeof val.renew === 'number' ? val.renew : parseFloat((val as any).renew || (val as any).reg || '4.98'),
            isUnlisted: false,
          };
        }
        const num = parseFloat(val as any) || 4.98;
        return { regPrice: num, renewPrice: num, isUnlisted: false };
      }
    }
    return {
      regPrice: null,
      renewPrice: null,
      isUnlisted: true,
      requiresApproval: true,
    };
  }

  calculateDomainPriceRule(domain: string) {
    if (!domain) return { priceXu: 250, priceVnd: 250000, priceUsd: 2.50, tld: '', ruleApplied: 'Mặc định' };
    const clean = domain.trim().toLowerCase().replace(/^www\./, '');

    // 1. .COM = 350 xu (350k)
    if (clean.endsWith('.com')) {
      return {
        priceXu: 350,
        priceVnd: 350000,
        priceUsd: 8.88,
        tld: '.com',
        ruleApplied: '.COM (350 Xu)',
      };
    }
    // 2. .NET = 400 xu (400k)
    if (clean.endsWith('.net')) {
      return {
        priceXu: 400,
        priceVnd: 400000,
        priceUsd: 10.98,
        tld: '.net',
        ruleApplied: '.NET (400 Xu)',
      };
    }

    // 3. Quy tắc theo giá gốc USD
    const detail = this.calculateDomainPriceDetail(clean);
    const regUsd = detail.regPrice !== null ? detail.regPrice : 4.98;

    // Dưới 2 USD => 200 xu (200k)
    if (regUsd < 2.00) {
      return {
        priceXu: 200,
        priceVnd: 200000,
        priceUsd: regUsd,
        tld: clean.slice(clean.lastIndexOf('.')),
        ruleApplied: 'Giá gốc < 2$ (200 Xu)',
      };
    }

    // Dưới 5 USD (2$ <= usd < 5$) => 250 xu (250k)
    if (regUsd < 5.00) {
      return {
        priceXu: 250,
        priceVnd: 250000,
        priceUsd: regUsd,
        tld: clean.slice(clean.lastIndexOf('.')),
        ruleApplied: 'Giá gốc 2$ - <5$ (250 Xu)',
      };
    }

    // Các đuôi đặc thù >= 5$ khác
    const specialXu = Math.round(regUsd * 30);
    return {
      priceXu: specialXu,
      priceVnd: specialXu * 1000,
      priceUsd: regUsd,
      tld: clean.slice(clean.lastIndexOf('.')),
      ruleApplied: `Đặc thù Registry (${specialXu} Xu)`,
    };
  }

  calculateDomainPriceInXu(domain: string) {
    const rule = this.calculateDomainPriceRule(domain);
    const detail = this.calculateDomainPriceDetail(domain);
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

  calculateDomainPrice(domain: string): number {
    const rule = this.calculateDomainPriceRule(domain);
    return rule.priceXu;
  }

  getBalance(userId: string): number {
    const wallets = this.loadJson<Record<string, number>>('wallets.json', { u_admin: 999999, u_member_demo: 500 });
    return typeof wallets[userId] === 'number' ? wallets[userId] : 0;
  }

  topupBalance(userId: string, amount: number, note = 'Nạp Xu vào ví', createdBy = 'admin') {
    const num = parseFloat(amount as any);
    if (isNaN(num) || num <= 0) {
      throw new BadRequestException('Số lượng Xu nạp không hợp lệ');
    }

    const wallets = this.loadJson<Record<string, number>>('wallets.json', {});
    const oldBalance = typeof wallets[userId] === 'number' ? wallets[userId] : 0;
    const newBalance = Math.round((oldBalance + num) * 100) / 100;
    wallets[userId] = newBalance;
    this.saveJson('wallets.json', wallets);

    this.addTransaction({
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      type: 'TOPUP',
      amount: num,
      oldBalance,
      newBalance,
      note,
      createdBy,
      timestamp: new Date().toISOString(),
    });

    return { userId, balance: newBalance };
  }

  deductBalance(userId: string, amount: number, reason = 'Mua tên miền / Dịch vụ', meta: any = {}) {
    const num = parseFloat(amount as any);
    if (isNaN(num) || num <= 0) {
      throw new BadRequestException('Số lượng Xu thanh toán không hợp lệ');
    }

    if (userId === 'u_admin' || userId === 'admin') {
      return { userId, balance: 999999 };
    }

    const wallets = this.loadJson<Record<string, number>>('wallets.json', {});
    const oldBalance = typeof wallets[userId] === 'number' ? wallets[userId] : 0;
    if (oldBalance < num) {
      throw new BadRequestException(
        `Số dư không đủ! (Ví hiện có: ${oldBalance.toLocaleString('vi-VN')} Xu, Cần thanh toán: ${num.toLocaleString('vi-VN')} Xu). Vui lòng nạp thêm Xu (100k = 100 Xu).`,
      );
    }

    const newBalance = Math.round((oldBalance - num) * 100) / 100;
    wallets[userId] = newBalance;
    this.saveJson('wallets.json', wallets);

    this.addTransaction({
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      type: 'PURCHASE',
      amount: -num,
      oldBalance,
      newBalance,
      note: reason,
      meta,
      createdBy: userId,
      timestamp: new Date().toISOString(),
    });

    return { userId, balance: newBalance };
  }

  addTransaction(tx: Transaction): Transaction {
    const transactions = this.loadJson<Transaction[]>('transactions.json', []);
    transactions.unshift(tx);
    this.saveJson('transactions.json', transactions.slice(0, 500));
    return tx;
  }

  getTransactions(userId?: string): Transaction[] {
    const transactions = this.loadJson<Transaction[]>('transactions.json', []);
    if (!userId || userId === 'admin' || userId === 'u_admin') {
      return transactions;
    }
    return transactions.filter((t) => t.userId === userId);
  }

  getAllWallets(): Record<string, number> {
    return this.loadJson<Record<string, number>>('wallets.json', {});
  }
}
