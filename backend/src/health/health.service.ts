import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import { CloudflareService } from '../cloudflare/cloudflare.service.js';
import { TemplatesService } from '../templates/templates.service.js';

export interface HealthCheckResult {
  domain: string;
  dns: { ok: boolean; ips: string[]; error?: string };
  zone: { ok: boolean; status?: string; nameservers?: string[] };
  ssl: { ok: boolean; error?: string };
  http: { ok: boolean; statusCode?: number; finalUrl?: string; error?: string };
  pagesAttached: { ok: boolean; status?: string };
  targetUrl: { ok: boolean; configuredTarget?: string; templateId?: string };
  overallOk: boolean;
  checkedAt: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly cloudflareService: CloudflareService,
    private readonly templatesService: TemplatesService,
  ) {}

  async inspectDomain(domain: string): Promise<HealthCheckResult> {
    const norm = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    const result: HealthCheckResult = {
      domain: norm,
      dns: { ok: false, ips: [] },
      zone: { ok: false },
      ssl: { ok: false },
      http: { ok: false },
      pagesAttached: { ok: false },
      targetUrl: { ok: false },
      overallOk: false,
      checkedAt: new Date().toISOString(),
    };

    // 1. DNS Resolution
    try {
      const addresses = await dns.resolve4(norm);
      result.dns = { ok: addresses.length > 0, ips: addresses };
    } catch (err: any) {
      result.dns = { ok: false, ips: [], error: err.message };
    }

    // 2. Cloudflare Zone Check
    try {
      const zone = await this.cloudflareService.findZoneByName(norm);
      if (zone) {
        result.zone = {
          ok: zone.status === 'active',
          status: zone.status,
          nameservers: zone.name_servers,
        };
      } else {
        result.zone = { ok: false, status: 'not_found' };
      }
    } catch (err: any) {
      result.zone = { ok: false, status: err.message };
    }

    // 3 & 4. HTTP & SSL Handshake
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`https://${norm}`, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);

      result.ssl = { ok: true };
      result.http = {
        ok: res.status >= 200 && res.status < 400,
        statusCode: res.status,
        finalUrl: res.url,
      };
    } catch (err: any) {
      result.ssl = { ok: false, error: err.message };
      result.http = { ok: false, error: err.message };
    }

    // 5. Template match
    const tpl = this.templatesService.findTemplateByDomain(norm);
    if (tpl) {
      result.pagesAttached = { ok: true, status: 'attached' };
      result.targetUrl = { ok: true, templateId: tpl.id };
    } else {
      result.pagesAttached = { ok: false, status: 'unlinked' };
      result.targetUrl = { ok: false };
    }

    result.overallOk = result.dns.ok && result.ssl.ok && result.http.ok;
    return result;
  }

  async autoRepairDomain(domain: string, targetCname: string) {
    const norm = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    const cleanCname = targetCname || 'lp-gg88-vip-2.pages.dev';

    // 1. Re-assert CNAME
    const cnameRes = await this.cloudflareService.ensurePagesCname(norm, cleanCname);

    // 2. Re-attach Pages Custom Domain
    const tpl = this.templatesService.getTemplate(cleanCname);
    const projectName = tpl?.pagesProject || cleanCname.replace('.pages.dev', '');
    const pagesRes = await this.cloudflareService.addPagesDomain(norm, projectName).catch(() => ({}));

    return {
      success: true,
      domain: norm,
      cnameRes,
      pagesRes,
      message: `Đã tự động sửa chữa cấu hình cho ${norm} thành công!`,
    };
  }
}
