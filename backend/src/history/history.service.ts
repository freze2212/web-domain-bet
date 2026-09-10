import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { appConfig } from '../config/env.config.js';

export interface HistoryRecord {
  id: string;
  action: string;
  domain: string;
  cname?: string;
  targetUrl?: string;
  user?: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  details?: any;
  timestamp: string;
}

@Injectable()
export class HistoryService {
  private getFilePath(): string {
    return path.join(appConfig.dataDir, 'history.json');
  }

  private loadHistory(): HistoryRecord[] {
    const file = this.getFilePath();
    if (!fs.existsSync(file)) {
      if (!fs.existsSync(appConfig.dataDir)) {
        fs.mkdirSync(appConfig.dataDir, { recursive: true });
      }
      fs.writeFileSync(file, JSON.stringify([], null, 2), 'utf8');
      return [];
    }
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  }

  private saveHistory(data: HistoryRecord[]): void {
    const file = this.getFilePath();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  addRecord(record: Omit<HistoryRecord, 'id' | 'timestamp'>): HistoryRecord {
    const history = this.loadHistory();
    const entry: HistoryRecord = {
      id: `his_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...record,
      timestamp: new Date().toISOString(),
    };
    history.unshift(entry);
    this.saveHistory(history.slice(0, 500));
    return entry;
  }

  getHistory(userId?: string): HistoryRecord[] {
    const list = this.loadHistory();
    if (!userId || userId === 'admin' || userId === 'u_admin') {
      return list;
    }
    return list.filter((h) => h.user === userId);
  }
}
