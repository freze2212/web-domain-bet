import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('freze_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('freze_auth_token');
    }
    return Promise.reject(error);
  },
);

export function apiError(err: any): string {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'Có lỗi xảy ra'
  );
}

/** Client-side batch line parser: domain -> url [| tele] [cname] */
export function parseBatchText(text: string, defaultTemplateId = '') {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items = lines.map((originalText, idx) => {
    const cleaned = originalText.replace(/^\d+[\).\-\:]?\s*/, '');
    const parts = cleaned.split(/\s*(?:->|=>|,|\|)\s*/).map((p) => p.trim()).filter(Boolean);
    // Also support spaces between domain and url
    let domain = '';
    let targetUrl = '';
    let telegramUrl = '';
    let templateHint = '';

    if (parts.length >= 2) {
      domain = parts[0];
      targetUrl = parts[1];
      telegramUrl = parts[2] && parts[2].startsWith('http') ? parts[2] : parts[2]?.startsWith('@') ? `https://t.me/${parts[2].slice(1)}` : parts[2] || '';
      templateHint = parts.find((p) => p.includes('.pages.dev')) || '';
    } else {
      const m = cleaned.match(/^(\S+)\s+(https?:\/\/\S+)(?:\s+(\S+))?/i);
      if (m) {
        domain = m[1];
        targetUrl = m[2];
        telegramUrl = m[3] || '';
      }
    }

    domain = (domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const isValid = !!domain && domain.includes('.') && !!targetUrl && /^https?:\/\//i.test(targetUrl);

    return {
      id: `row_${idx}_${Date.now()}`,
      originalText,
      domain,
      targetUrl,
      telegramUrl: telegramUrl.startsWith('@') ? `https://t.me/${telegramUrl.slice(1)}` : telegramUrl,
      cnameTarget: templateHint,
      templateId: defaultTemplateId,
      isValid,
      error: isValid ? undefined : 'Thiếu domain hoặc URL hợp lệ',
    };
  });

  return {
    items,
    validCount: items.filter((i) => i.isValid).length,
    invalidCount: items.filter((i) => !i.isValid).length,
  };
}

export default api;
