import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { appConfig } from '../config/env.config.js';

export interface DomainOwnershipRecord {
  domain: string;
  userId: string;
  assignedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  username?: string;
  fullName?: string;
  orderId?: string;
  purchasedWithXu?: number;
  [key: string]: any;
}

@Injectable()
export class OwnershipService {
  private getFilePath(): string {
    return path.join(appConfig.dataDir, 'domain_ownership.json');
  }

  private loadOwnership(): Record<string, DomainOwnershipRecord> {
    const file = this.getFilePath();
    if (!fs.existsSync(file)) {
      if (!fs.existsSync(appConfig.dataDir)) {
        fs.mkdirSync(appConfig.dataDir, { recursive: true });
      }
      fs.writeFileSync(file, JSON.stringify({}, null, 2), 'utf8');
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  }

  private saveOwnership(data: Record<string, DomainOwnershipRecord>): void {
    const file = this.getFilePath();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  assignDomain(domain: string, userId: string, meta: Record<string, any> = {}): DomainOwnershipRecord {
    const norm = domain.trim().toLowerCase().replace(/^www\./, '');
    const map = this.loadOwnership();
    const record: DomainOwnershipRecord = {
      domain: norm,
      userId,
      assignedAt: new Date().toISOString(),
      ...meta,
    };
    map[norm] = record;
    this.saveOwnership(map);
    return record;
  }

  unassignDomain(domain: string): boolean {
    const norm = domain.trim().toLowerCase().replace(/^www\./, '');
    const map = this.loadOwnership();
    delete map[norm];
    this.saveOwnership(map);
    return true;
  }

  getDomainOwner(domain: string): DomainOwnershipRecord | null {
    const norm = domain.trim().toLowerCase().replace(/^www\./, '');
    const map = this.loadOwnership();
    return map[norm] || null;
  }

  canUserManageDomain(user: { id?: string; userId?: string; username?: string; role?: string }, domain: string): boolean {
    if (!user) return false;
    if (user.role === 'admin' || user.userId === 'u_admin' || user.id === 'u_admin' || user.username === 'admin') {
      return true;
    }
    const norm = domain.trim().toLowerCase().replace(/^www\./, '');
    const owner = this.getDomainOwner(norm);
    const uId = user.userId || user.id;
    return !!(owner && owner.userId === uId);
  }

  listUserDomainNames(userId?: string): string[] | null {
    if (!userId || userId === 'admin' || userId === 'u_admin') {
      return null; // All domains allowed for admin
    }
    const map = this.loadOwnership();
    return Object.keys(map).filter((d) => map[d].userId === userId);
  }

  getUserDomainsDetails(userId: string): DomainOwnershipRecord[] {
    const map = this.loadOwnership();
    return Object.values(map).filter((item) => item.userId === userId);
  }

  listAllAssignments(): Record<string, DomainOwnershipRecord> {
    return this.loadOwnership();
  }
}
