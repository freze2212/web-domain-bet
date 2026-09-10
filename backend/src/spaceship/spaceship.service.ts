import { Injectable, Logger } from '@nestjs/common';
import { appConfig } from '../config/env.config.js';

@Injectable()
export class SpaceshipService {
  private readonly logger = new Logger(SpaceshipService.name);
  private readonly baseUrl = 'https://developer.spaceship.com';

  private async spaceshipRequest(endpoint: string, { method = 'GET', body }: { method?: string; body?: any } = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'X-API-Key': appConfig.spaceshipApiKey,
      'X-API-Secret': appConfig.spaceshipApiSecret,
      Accept: 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const asyncId = response.headers.get('spaceship-async-operationid');
    const text = await response.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok && response.status !== 202) {
      const detail = data?.detail || data?.message || data?.title || text || response.statusText;
      throw new Error(`Spaceship API ${response.status}: ${detail}`);
    }

    return { response, data, asyncId };
  }

  async checkDomainAvailability(domain: string) {
    const { data } = await this.spaceshipRequest(`/v1/domains/${encodeURIComponent(domain)}/available`);
    return data;
  }

  async getDomainInfo(domain: string) {
    const { data } = await this.spaceshipRequest(`/v1/domains/${encodeURIComponent(domain)}`);
    return data;
  }

  async listDomains(take = 1, skip = 0) {
    const { data } = await this.spaceshipRequest(`/v1/domains?take=${take}&skip=${skip}`);
    return data;
  }

  async getAsyncOperation(operationId: string) {
    const { data } = await this.spaceshipRequest(`/v1/async-operations/${encodeURIComponent(operationId)}`);
    return data;
  }

  async waitForAsyncOperation(operationId: string, maxRetries = 30, delayMs = 3000) {
    for (let i = 0; i < maxRetries; i++) {
      const op = await this.getAsyncOperation(operationId);
      if (op?.status === 'success') {
        return op;
      }
      if (op?.status === 'failed') {
        throw new Error(`Spaceship operation failed: ${JSON.stringify(op.details ?? op)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error(`Spaceship operation timed out after ${maxRetries * delayMs}ms`);
  }

  async registerDomain(domain: string, explicitContactId?: string) {
    const norm = domain.trim().toLowerCase();
    const contactId = await this.resolveContactId(explicitContactId);

    const noPrivacyTlds = ['.uk', '.co.uk', '.me.uk', '.org.uk', '.us', '.in', '.ca', '.de', '.nl', '.eu'];
    const isNoPrivacy = noPrivacyTlds.some((tld) => norm.endsWith(tld));

    let contactAttributes: string[] = [];
    if (norm.endsWith('.us')) {
      try {
        const { data: attrData } = await this.spaceshipRequest('/v1/contacts/attributes', {
          method: 'PUT',
          body: {
            contact: contactId,
            type: 'us',
            nexusCategory: 'C31',
            appPurpose: 'P1',
            nexusCountry: 'VN',
          },
        });
        const attrId = attrData?.contactId || contactId;
        if (attrId) {
          contactAttributes = [attrId];
        }
      } catch (attrErr: any) {
        this.logger.warn(`Cảnh báo tạo US Nexus attributes: ${attrErr.message}`);
      }
    }

    const createBody = (usePrivacy: boolean) => {
      const b: any = {
        autoRenew: false,
        years: 1,
        contacts: {
          registrant: contactId,
          admin: contactId,
          tech: contactId,
          billing: contactId,
        },
      };
      if (contactAttributes.length > 0) {
        b.contacts.attributes = contactAttributes;
      }
      if (usePrivacy) {
        b.privacyProtection = {
          level: 'high',
          userConsent: true,
        };
      } else {
        b.privacyProtection = {
          level: 'public',
          userConsent: true,
        };
      }
      return b;
    };

    const reqBody = createBody(!isNoPrivacy);

    try {
      const { response, asyncId } = await this.spaceshipRequest(
        `/v1/domains/${encodeURIComponent(domain)}`,
        { method: 'POST', body: reqBody },
      );

      if (response.status === 202 && asyncId) {
        await this.waitForAsyncOperation(asyncId);
        return { purchased: true, async: true };
      }

      return { purchased: true, async: false };
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (
        msg.includes('already registered') ||
        msg.includes('not available for registration') ||
        msg.includes('already exists') ||
        msg.includes('already owned')
      ) {
        try {
          const info = await this.getDomainInfo(domain);
          if (info && !info.error) {
            this.logger.log(`ℹ️ Tên miền [${domain}] đã có sẵn trong tài khoản Spaceship. Tiếp tục bước cấu hình.`);
            return { purchased: true, alreadyRegistered: true };
          }
        } catch {}
        this.logger.log(`ℹ️ Tên miền [${domain}] đã được đăng ký trước đó. Bỏ qua bước mua và tiếp tục bước cấu hình.`);
        return { purchased: true, alreadyRegistered: true };
      }
      throw err;
    }
  }

  async updateNameservers(domain: string, hosts: string[]) {
    const body = {
      provider: 'custom',
      hosts,
    };

    const { response, asyncId } = await this.spaceshipRequest(
      `/v1/domains/${encodeURIComponent(domain)}/nameservers`,
      { method: 'PUT', body },
    );

    if (response.status === 202 && asyncId) {
      await this.waitForAsyncOperation(asyncId);
    }

    return { updated: true, hosts };
  }

  async resolveContactId(explicitContactId?: string): Promise<string> {
    if (explicitContactId) return explicitContactId;
    if (process.env.SPACESHIP_CONTACT_ID) return process.env.SPACESHIP_CONTACT_ID;

    const list = await this.listDomains(1, 0);
    const first = list?.items?.[0];
    const contactId = first?.contacts?.registrant;
    if (!contactId) {
      return 'admin_default_contact';
    }
    return contactId;
  }
}
