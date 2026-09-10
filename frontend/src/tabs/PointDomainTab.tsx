import React, { useState, useEffect } from 'react';
import api, { apiError } from '../services/api.js';
import type { LandingTemplate } from '../types/index.js';
import { Globe, ShieldAlert, CheckCircle2, Server } from 'lucide-react';

export const PointDomainTab: React.FC = () => {
  const [domain, setDomain] = useState('');
  const [targetUrl, setTargetUrl] = useState('https://google.com');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templates, setTemplates] = useState<LandingTemplate[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/templates').then((res) => {
      if (res.data.success) {
        const list = res.data.templates || [];
        setTemplates(list);
        if (list[0]) setSelectedTemplateId(list[0].id);
      }
    });
  }, []);

  const selectedTpl = templates.find((t) => t.id === selectedTemplateId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain || !domain.includes('.')) {
      setError('Vui lòng nhập tên miền hợp lệ');
      return;
    }
    if (!selectedTemplateId || !targetUrl) {
      setError('Chọn mẫu LP và nhập link đích');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.post('/deploy-lp', {
        domain,
        link: targetUrl,
        tele: telegramUrl,
        templateId: selectedTemplateId,
        isBuy: false,
      });
      if (res.data.success) {
        setResult(res.data);
      } else {
        setError(res.data.error || 'Có lỗi xảy ra');
      }
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
          <Globe className="h-4 w-4" />
          Trỏ Tên Miền Có Sẵn
        </div>
        <h2 className="mt-1 text-2xl font-extrabold text-white">Gán Mẫu Landing Page Vào Miền Có Sẵn</h2>
        <p className="mt-1 text-xs text-gray-400">
          Bạn đã sở hữu tên miền từ trước? Chỉ cần nhập tên miền, hệ thống sẽ cấp cặp Nameservers để bạn trỏ về máy chủ Cloudflare Pages cực nhanh.
        </p>
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center gap-3 text-xs text-emerald-300">
        <ShieldAlert className="h-5 w-5 text-emerald-400 shrink-0" />
        <div>
          <span className="font-bold">Chế độ Test An Toàn:</span> Mọi hành động test cấu hình hãy sử dụng miền{' '}
          <code className="bg-emerald-950/80 px-1.5 py-0.5 rounded font-mono font-bold text-emerald-200">autotest-6888.top</code>.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-gray-800 bg-[#101626] p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Tên Miền Đang Có <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Ví dụ: autotest-6888.top, domaincuaban.com..."
                className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Chọn Mẫu Landing Page Gắn Liền <span className="text-cyan-400">*</span>
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-4 py-2.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.brand}] {t.name} (CNAME: {t.cnameTarget})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Link Đích Nút Chơi Ngay (Target URL)
                </label>
                <input
                  type="text"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://google.com"
                  className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Link Telegram CSKH (Nếu có)
                </label>
                <input
                  type="text"
                  value={telegramUrl}
                  onChange={(e) => setTelegramUrl(e.target.value)}
                  placeholder="https://t.me/cskh_bot"
                  className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-xs font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'Đang trỏ tên miền...' : 'Cấu Hình & Nhận Cặp Nameservers'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Server className="h-4 w-4 text-cyan-400" />
            Kết Quả / Nameservers
          </h3>

          {result ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 inline mr-1 text-emerald-400" />
                {result.message || 'Đã cấu hình thành công!'}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Domain</span>
                  <span className="font-mono text-white">{result.domain}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">Mẫu</span>
                  <span className="text-cyan-300">{result.templateName || selectedTpl?.name}</span>
                </div>
                <div className="flex justify-between border-b border-gray-800 pb-2">
                  <span className="text-gray-400">CNAME</span>
                  <span className="font-mono text-emerald-300">{result.cnameTarget}</span>
                </div>
              </div>

              {result.nameservers?.length > 0 && (
                <div className="space-y-2">
                  {result.nameservers.map((ns: string, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-[#161d31] p-3 border border-cyan-500/30 font-mono text-cyan-300 text-xs font-bold"
                    >
                      <span>NS {idx + 1}:</span>
                      <span>{ns}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-gray-400">
                Sau khi đổi NS tại nhà cung cấp tên miền, Cloudflare sẽ kích hoạt SSL và LP trong vài phút.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-xs text-gray-400">
              Điền thông tin và ấn <span className="text-cyan-400 font-semibold">"Cấu Hình & Nhận Cặp Nameservers"</span>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
