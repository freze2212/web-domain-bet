import { describe, it, expect } from 'vitest';
import { WalletService } from '../src/wallet/wallet.service.js';
import { BatchService } from '../src/batch/batch.service.js';
import { TemplatesService, ACTIVE_TEMPLATES } from '../src/templates/templates.service.js';
import { OwnershipService } from '../src/ownership/ownership.service.js';

describe('Pricing Rules Engine', () => {
  const walletService = new WalletService();

  it('should price .com domains at 350 Xu (350k)', () => {
    const res = walletService.calculateDomainPriceRule('testdomain123.com');
    expect(res.priceXu).toBe(350);
    expect(res.priceVnd).toBe(350000);
  });

  it('should price .net domains at 400 Xu (400k)', () => {
    const res = walletService.calculateDomainPriceRule('testdomain123.net');
    expect(res.priceXu).toBe(400);
    expect(res.priceVnd).toBe(400000);
  });

  it('should price < $2.00 domains at 200 Xu (e.g. .top)', () => {
    const res = walletService.calculateDomainPriceRule('autotest-6888.top');
    expect(res.priceXu).toBe(200);
    expect(res.priceVnd).toBe(200000);
  });

  it('should price $2.00 - < $5.00 domains at 250 Xu (e.g. .vip)', () => {
    const res = walletService.calculateDomainPriceRule('testdomain123.vip');
    expect(res.priceXu).toBe(250);
    expect(res.priceVnd).toBe(250000);
  });
});

describe('Batch Smart Parser', () => {
  const batchService = new BatchService(null as any, null as any);

  it('should parse tab/spaced/arrow lines accurately', () => {
    const input = `
1. autotest-6888.top -> https://gg88.com | @telebot
2) mysite.net   https://mysite.com   lp-gg88-vip-2.pages.dev
domain3.xyz, https://target.com
    `;
    const res = batchService.parseBatchInput(input, 'lp-gg88-vip-2.pages.dev');
    expect(res.validCount).toBe(3);
    expect(res.items[0].domain).toBe('autotest-6888.top');
    expect(res.items[0].targetUrl).toBe('https://gg88.com');
    expect(res.items[0].telegramUrl).toBe('@telebot');
    expect(res.items[1].domain).toBe('mysite.net');
    expect(res.items[1].cnameTarget).toBe('lp-gg88-vip-2.pages.dev');
  });

  it('should flag invalid domains', () => {
    const input = `invalid_domain_without_tld -> https://target.com`;
    const res = batchService.parseBatchInput(input);
    expect(res.validCount).toBe(0);
    expect(res.invalidCount).toBe(1);
  });
});

describe('Templates Verification', () => {
  const templatesService = new TemplatesService(null as any);

  it('should list all active templates with brand filter', () => {
    const all = templatesService.listTemplates('ALL');
    expect(all.length).toBe(ACTIVE_TEMPLATES.length);

    const gg88 = templatesService.listTemplates('GG88');
    expect(gg88.every((t) => t.brand === 'GG88')).toBe(true);

    const mm88 = templatesService.listTemplates('MM88');
    expect(mm88.every((t) => t.brand === 'MM88')).toBe(true);
  });
});
