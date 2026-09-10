import { Injectable, Logger } from '@nestjs/common';
import { appConfig } from '../config/env.config.js';

const BACKUP_TOKENS = [
  process.env.CLOUDFLARE_API_TOKEN,
  process.env.CLOUDFLARE_ADMIN_API_TOKEN,
].filter(Boolean) as string[];

@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

  async cfRequestFull(path: string, { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: any } = {}) {
    const url = `${this.baseUrl}${path}`;
    const customAuth = headers?.Authorization || headers?.authorization;
    const customToken = customAuth ? customAuth.replace(/^Bearer\s+/i, '').trim() : null;

    const primaryToken = customToken || appConfig.cfToken;
    const tokensToTry = [...new Set([primaryToken, ...BACKUP_TOKENS])].filter(Boolean);

    let lastError: any = null;
    for (const token of tokensToTry) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        const data: any = await response.json();
        if (response.ok && data.success !== false) {
          return data;
        }
        const errors = data.errors?.map((e: any) => e.message).join('; ') || response.statusText;
        lastError = new Error(`Cloudflare API ${response.status}: ${errors}`);
        if (response.status !== 401 && response.status !== 403 && !errors.includes('Unauthorized') && !errors.includes('not found')) {
          throw lastError;
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Không thể kết nối Cloudflare API');
  }

  async cfRequest(path: string, options: any = {}) {
    const full = await this.cfRequestFull(path, options);
    return full?.result;
  }

  async findZoneByName(domain: string) {
    const norm = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const allTokens = [...new Set([
      appConfig.cfToken,
      process.env.CLOUDFLARE_API_TOKEN,
      process.env.CLOUDFLARE_ADMIN_API_TOKEN,
      ...BACKUP_TOKENS,
    ])].filter(Boolean);

    for (const tok of allTokens) {
      try {
        const response = await fetch(`${this.baseUrl}/zones?name=${encodeURIComponent(norm)}`, {
          headers: {
            Authorization: `Bearer ${tok}`,
            'Content-Type': 'application/json',
          },
        });
        const data: any = await response.json();
        if (data.success && Array.isArray(data.result) && data.result.length > 0) {
          const activeZone = data.result.find((z: any) => z.status === 'active');
          const pendingZone = data.result.find((z: any) => z.status === 'pending' || z.status === 'initializing');
          const found = activeZone || pendingZone || data.result[0];
          if (found) {
            found._token = tok;
            return found;
          }
        }
      } catch {}
    }
    return null;
  }

  async createZone(domain: string) {
    return this.cfRequest('/zones', {
      method: 'POST',
      body: {
        name: domain,
        jump_start: false,
      },
    });
  }

  async getOrCreateZone(domain: string) {
    let zone = await this.findZoneByName(domain);
    if (zone) {
      if (zone.status === 'moved' || zone.status === 'deactivated') {
        this.logger.log(`[Cloudflare] Zone ${domain} trạng thái ${zone.status}, tạo lại...`);
        await this.cfRequest(`/zones/${zone.id}`, { method: 'DELETE' }).catch(() => {});
        zone = await this.createZone(domain);
      }
      return zone;
    }
    zone = await this.createZone(domain);
    return zone;
  }

  getZoneNameservers(zone: any): string[] {
    if (Array.isArray(zone)) return zone;
    const hosts = zone?.name_servers || zone?.result?.name_servers;
    if (Array.isArray(hosts) && hosts.length > 0) {
      return hosts;
    }
    return ['cody.ns.cloudflare.com', 'paislee.ns.cloudflare.com'];
  }

  async listDnsRecords(zoneId: string) {
    return this.cfRequest(`/zones/${zoneId}/dns_records?per_page=100`);
  }

  async createDnsRecord(zoneId: string, record: { type: string; name: string; content: string; ttl?: number; proxied?: boolean }) {
    return this.cfRequest(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: record,
    });
  }

  async updateDnsRecord(zoneId: string, recordId: string, record: { type: string; name: string; content: string; ttl?: number; proxied?: boolean }) {
    return this.cfRequest(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'PUT',
      body: record,
    });
  }

  async deleteDnsRecord(zoneId: string, recordId: string) {
    return this.cfRequest(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    });
  }

  async ensurePagesCname(domain: string, targetCname: string) {
    const zone = await this.getOrCreateZone(domain);
    const records = await this.listDnsRecords(zone.id);

    const norm = domain.trim().toLowerCase().replace(/^www\./, '');
    const cleanTarget = targetCname.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    // For root domain (@) and www
    const subdomains = ['@', 'www'];
    const results: any[] = [];

    for (const sub of subdomains) {
      const recName = sub === '@' ? norm : `www.${norm}`;
      const existing = records.find((r: any) => (r.name === recName || r.name === `${recName}.`) && (r.type === 'CNAME' || r.type === 'A'));

      if (existing) {
        if (existing.type === 'CNAME' && existing.content === cleanTarget && existing.proxied === true) {
          results.push({ name: recName, status: 'unchanged', record: existing });
        } else {
          // Delete old record if it was A or different target
          await this.deleteDnsRecord(zone.id, existing.id).catch(() => {});
          const created = await this.createDnsRecord(zone.id, {
            type: 'CNAME',
            name: sub,
            content: cleanTarget,
            proxied: true,
            ttl: 1,
          });
          results.push({ name: recName, status: 'updated', record: created });
        }
      } else {
        const created = await this.createDnsRecord(zone.id, {
          type: 'CNAME',
          name: sub,
          content: cleanTarget,
          proxied: true,
          ttl: 1,
        });
        results.push({ name: recName, status: 'created', record: created });
      }
    }

    return { zone, results };
  }

  async addPagesDomain(domain: string, projectName: string) {
    const cleanProj = projectName.replace('.pages.dev', '').trim();
    const accountId = appConfig.cfAccountId;

    const names = [domain, `www.${domain}`];
    const results: any[] = [];

    for (const name of names) {
      try {
        const res = await this.cfRequest(
          `/accounts/${accountId}/pages/projects/${encodeURIComponent(cleanProj)}/domains`,
          {
            method: 'POST',
            body: { name },
          },
        );
        results.push({ name, success: true, result: res });
      } catch (err: any) {
        if (/already exists|duplicate|already been added/i.test(err.message)) {
          results.push({ name, success: true, status: 'already_exists' });
        } else {
          results.push({ name, success: false, error: err.message });
        }
      }
    }

    return {
      projectName: cleanProj,
      canonicalSubdomain: `${cleanProj}.pages.dev`,
      results,
    };
  }

  async listAllZones() {
    return this.cfRequest('/zones?per_page=50');
  }
}
