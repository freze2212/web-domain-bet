export interface User {
  id: string;
  userId?: string;
  username: string;
  role: 'admin' | 'user';
  fullName?: string;
  createdAt?: string;
  lastLogin?: string;
}

export interface LandingTemplate {
  id: string;
  name: string;
  title: string;
  folder: string;
  path: string;
  pagesProject: string;
  cnameTarget: string;
  sampleDomain?: string;
  sampleUrl?: string;
  totalDomains?: number;
  brand: string;
  brandLabel: string;
  previewUrl?: string;
}

export interface DomainCheckResult {
  domain: string;
  available: boolean;
  isAvailable?: boolean;
  isBuyable?: boolean;
  pricing: {
    regXu: number;
    renewXu: number;
    regUsd: number;
    renewUsd: number;
    regVnd: number;
    renewVnd: number;
    ruleApplied: string;
  };
  priceXu?: number;
  priceVnd?: number;
  priceUsd?: number;
  ruleApplied?: string;
  statusMessage?: string;
}

export interface DomainRecord {
  id?: string;
  domain: string;
  name?: string;
  status?: string;
  sourceType?: string;
  templateId?: string | null;
  templateName?: string | null;
  brand?: string | null;
  cnameTarget?: string | null;
  owner?: string | { userId: string; username: string } | null;
  primaryFolder?: string;
  repos?: string[];
}

export interface DomainOrder {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  domain: string;
  note: string;
  priceXu: number;
  priceVnd: number;
  priceUsd: number;
  ruleApplied: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  rejectReason: string | null;
  deductedAmount: number;
  userCurrentBalance?: number;
  hasEnoughBalance?: boolean;
}

export interface ParsedBatchLine {
  id: string;
  originalText: string;
  domain: string;
  targetUrl: string;
  telegramUrl: string;
  cnameTarget: string;
  templateId?: string;
  isValid: boolean;
  error?: string;
}

export interface HealthChecklistItem {
  id: string;
  title: string;
  passed: boolean;
  statusText: string;
  detail?: string;
  severity?: string;
}

export interface HealthReport {
  domain: string;
  overallStatus: string;
  healthScore: number;
  maxScore: number;
  healthPercent?: number;
  checklist: HealthChecklistItem[];
  issues?: string[];
  detectedLink?: string | null;
  detectedTemplate?: { id: string; name: string; target?: string } | null;
  timestamp?: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'TOPUP' | 'PURCHASE' | 'REFUND' | string;
  amount: number;
  oldBalance: number;
  newBalance: number;
  note: string;
  meta?: any;
  createdBy?: string;
  timestamp: string;
}

export interface BackgroundTask {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'success' | string;
  progress: number;
  message: string;
  logs: any[];
  createdAt: string;
  updatedAt: string;
  title?: string;
  domain?: string;
}

export interface HistoryRecord {
  id: string;
  action?: string;
  actionType?: string;
  actionLabel?: string;
  domain: string;
  cname?: string;
  cnameTarget?: string;
  targetUrl?: string;
  link?: string;
  user?: string;
  status: string;
  details?: any;
  timestamp: string;
}
