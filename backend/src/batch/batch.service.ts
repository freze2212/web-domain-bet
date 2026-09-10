import { Injectable } from '@nestjs/common';
import { DomainsService } from '../domains/domains.service.js';
import { TemplatesService } from '../templates/templates.service.js';

export interface ParsedBatchLine {
  id: string;
  originalText: string;
  domain: string;
  targetUrl: string;
  telegramUrl: string;
  cnameTarget: string;
  isValid: boolean;
  error?: string;
}

@Injectable()
export class BatchService {
  constructor(
    private readonly domainsService: DomainsService,
    private readonly templatesService: TemplatesService,
  ) {}

  parseBatchInput(rawText: string, defaultCname = 'lp-gg88-vip-2.pages.dev'): {
    items: ParsedBatchLine[];
    validCount: number;
    invalidCount: number;
    summary: string;
  } {
    if (!rawText || !rawText.trim()) {
      return { items: [], validCount: 0, invalidCount: 0, summary: 'Vui lòng nhập danh sách dữ liệu' };
    }

    const lines = rawText.split('\n');
    const items: ParsedBatchLine[] = [];

    let lineIndex = 0;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;
      lineIndex++;

      // Clean leading numbers (e.g. "1. ", "2) ", "1 - ")
      let cleaned = line.replace(/^\d+[\.\)\-:\s]+\s*/, '').trim();

      // Normalize all delimiters (->, =>, |, ;, \t, ,) into unified separator
      const normalized = cleaned
        .replace(/->|=>|\||;|\t/g, ' ')
        .replace(/,/g, ' ');

      const tokens = normalized.split(/\s+/).map((t) => t.trim()).filter(Boolean);

      let rawDomain = '';
      let targetUrl = '';
      let teleUrl = '';
      let cnameTarget = defaultCname;

      for (const tok of tokens) {
        const cleanTok = tok.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');

        if (tok.includes('t.me/') || tok.includes('telegram') || tok.startsWith('@')) {
          teleUrl = tok;
        } else if (cleanTok.endsWith('.pages.dev')) {
          cnameTarget = cleanTok;
        } else if (tok.startsWith('http://') || tok.startsWith('https://')) {
          if (!targetUrl) {
            targetUrl = tok;
          } else if (!teleUrl) {
            teleUrl = tok;
          }
        } else if (!rawDomain && /^[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]{2,}$/.test(cleanTok)) {
          rawDomain = cleanTok;
        } else if (!targetUrl && cleanTok.includes('.')) {
          targetUrl = `https://${cleanTok}`;
        }
      }

      // If domain still empty, look at first token
      if (!rawDomain && tokens.length > 0) {
        rawDomain = tokens[0].replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
      }

      // Strict domain check: must have a dot, at least 2 chars TLD, and valid hostname chars
      const domainRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+\.[a-zA-Z]{2,}$|^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
      const isDomainValid = domainRegex.test(rawDomain);
      const isValid = isDomainValid && !!rawDomain;
      const error = !isDomainValid ? 'Tên miền không đúng định dạng (thiếu phần mở rộng TLD)' : undefined;

      items.push({
        id: `line_${lineIndex}_${Math.random().toString(36).slice(2, 6)}`,
        originalText: line,
        domain: rawDomain.toLowerCase(),
        targetUrl: targetUrl || 'https://google.com',
        telegramUrl: teleUrl || '',
        cnameTarget: cnameTarget || defaultCname,
        isValid,
        error,
      });
    }

    const validCount = items.filter((i) => i.isValid).length;
    const invalidCount = items.length - validCount;

    return {
      items,
      validCount,
      invalidCount,
      summary: `Đã phân tích thành công ${validCount}/${items.length} dòng hợp lệ.`,
    };
  }

  async executeBatch({
    items,
    mode = 'point',
    user,
  }: {
    items: ParsedBatchLine[];
    mode: 'buy' | 'point';
    user: any;
  }) {
    const results: any[] = [];
    const validItems = items.filter((i) => i.isValid);

    for (const item of validItems) {
      try {
        if (mode === 'buy') {
          const res = await this.domainsService.buyAndConfigureDomain({
            domain: item.domain,
            cnameTarget: item.cnameTarget,
            targetUrl: item.targetUrl,
            telegramUrl: item.telegramUrl,
            user,
          });
          results.push({ domain: item.domain, success: true, result: res });
        } else {
          const res = await this.domainsService.pointExistingDomain({
            domain: item.domain,
            cnameTarget: item.cnameTarget,
            targetUrl: item.targetUrl,
            telegramUrl: item.telegramUrl,
            user,
          });
          results.push({ domain: item.domain, success: true, result: res });
        }
      } catch (err: any) {
        results.push({ domain: item.domain, success: false, error: err.message });
      }
    }

    return {
      total: validItems.length,
      successCount: results.filter((r) => r.success).length,
      failCount: results.filter((r) => !r.success).length,
      results,
    };
  }
}
