import React, { useState, useEffect } from 'react';
import api, { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useWallet } from '../context/WalletContext.js';
import type { LandingTemplate, DomainCheckResult } from '../types/index.js';
import { ShoppingCart, Sparkles, Send, ShieldAlert } from 'lucide-react';

interface BuyDomainTabProps {
  preselectedTemplate?: LandingTemplate | null;
}

export const BuyDomainTab: React.FC<BuyDomainTabProps> = ({ preselectedTemplate }) => {
  const { user } = useAuth();
  const { balance, refreshBalance } = useWallet();

  const [domain, setDomain] = useState('');
  const [targetUrl, setTargetUrl] = useState('https://google.com');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(preselectedTemplate?.id || '');
  const [note, setNote] = useState('');

  const [templates, setTemplates] = useState<LandingTemplate[]>([]);
  const [checkResult, setCheckResult] = useState<DomainCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (preselectedTemplate) {
      setSelectedTemplateId(preselectedTemplate.id);
    }
  }, [preselectedTemplate]);

  useEffect(() => {
    api.get('/templates').then((res) => {
      if (res.data.success) {
        const list = res.data.templates || [];
        setTemplates(list);
        if (!selectedTemplateId && list[0]) setSelectedTemplateId(list[0].id);
      }
    });
  }, []);

  const selectedTpl = templates.find((t) => t.id === selectedTemplateId) || null;

  const handleCheckDomain = async (domainToCheck?: string) => {
    const d = domainToCheck || domain;
    if (!d || !d.includes('.')) {
      setMessage({ type: 'error', text: 'Vui lòng nhập tên miền hợp lệ (vd: autotest-6888.top)' });
      return;
    }
    setChecking(true);
    setMessage(null);

    try {
      const res = await api.post('/check-domain', { domain: d });
      const data = res.data;
      setCheckResult({
        domain: data.domain,
        available: !!data.isAvailable,
        isAvailable: data.isAvailable,
        isBuyable: data.isBuyable,
        statusMessage: data.statusMessage,
        priceXu: data.priceXu,
        priceVnd: data.priceVnd,
        priceUsd: data.priceUsd,
        ruleApplied: data.ruleApplied,
        pricing: {
          regXu: data.priceXu,
          renewXu: data.priceXu,
          regUsd: data.priceUsd,
          renewUsd: data.renewPriceUsd || data.priceUsd,
          regVnd: data.priceVnd,
          renewVnd: data.priceVnd,
          ruleApplied: data.ruleApplied || '',
        },
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: apiError(err) });
    } finally {
      setChecking(false);
    }
  };

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setMessage({ type: 'error', text: 'Vui lòng đăng nhập để tiếp tục' });
      return;
    }

    if (!domain || !domain.includes('.')) {
      setMessage({ type: 'error', text: 'Vui lòng nhập tên miền hợp lệ' });
      return;
    }
    if (!selectedTemplateId || !targetUrl) {
      setMessage({ type: 'error', text: 'Chọn mẫu LP và nhập link đích' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      if (user.role === 'admin') {
        const res = await api.post('/tasks/buy-and-deploy', {
          domain,
          link: targetUrl,
          tele: telegramUrl,
          templateId: selectedTemplateId,
          isBuy: true,
          mode: 'LP',
        });
        if (res.data.success) {
          setMessage({
            type: 'success',
            text: `🎉 Task mua & deploy [${domain}] đã vào hàng đợi (${res.data.jobId || 'ok'}). Xem tab Tasks. CNAME: ${selectedTpl?.cnameTarget || ''}`,
          });
          refreshBalance();
        }
      } else {
        const metaNote = [
          note,
          `templateId=${selectedTemplateId}`,
          `link=${targetUrl}`,
          telegramUrl ? `tele=${telegramUrl}` : '',
        ]
          .filter(Boolean)
          .join(' | ');
        const res = await api.post('/domain-orders', {
          domain,
          note: metaNote,
        });
        if (res.data.success) {
          setMessage({
            type: 'success',
            text: `✅ Đã tạo đơn đặt mua [${domain}] — chờ Admin duyệt (chưa trừ Xu).`,
          });
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: apiError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
              <ShoppingCart className="h-4 w-4" />
              Đăng Ký Tên Miền Tự Động
            </div>
            <h2 className="mt-1 text-2xl font-extrabold text-white">Mua & Tự Động Cấu Hình Tên Miền</h2>
            <p className="mt-1 text-xs text-gray-400">
              Hệ thống tự động tra cứu bảng giá, đăng ký qua Spaceship API, cấu hình Cloudflare DNS và gắn Landing Page.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
            <span className="font-bold">Bảng Giá Xu Tự Động:</span>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded bg-[#0a0d18] px-2 py-0.5 font-mono">Gốc &lt; 2$: 200 Xu</span>
              <span className="rounded bg-[#0a0d18] px-2 py-0.5 font-mono">Gốc 2-5$: 250 Xu</span>
              <span className="rounded bg-[#0a0d18] px-2 py-0.5 font-mono">.COM: 350 Xu</span>
              <span className="rounded bg-[#0a0d18] px-2 py-0.5 font-mono">.NET: 400 Xu</span>
            </div>
          </div>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center gap-3 text-xs text-emerald-300">
        <ShieldAlert className="h-5 w-5 text-emerald-400 shrink-0" />
        <div>
          <span className="font-bold">Chế độ Test An Toàn Tuyệt Đối:</span> Đối với mọi kiểm thử chức năng mua & trỏ, chỉ thực hiện thao tác với miền{' '}
          <code className="bg-emerald-950/80 px-1.5 py-0.5 rounded font-mono font-bold text-emerald-200">autotest-6888.top</code>. Không can thiệp miền sản xuất của khách hàng.
        </div>
      </div>

      {/* Main Buy Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-gray-800 bg-[#101626] p-6">
          <form onSubmit={handleOrderSubmit} className="space-y-4">
            {message && (
              <div
                className={`rounded-xl border p-3.5 text-xs ${
                  message.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Domain input */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Tên Miền Cần Mua <span className="text-cyan-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onBlur={() => domain && handleCheckDomain()}
                  placeholder="Ví dụ: autotest-6888.top, gg88vip.net..."
                  className="flex-1 rounded-xl border border-gray-800 bg-[#161d31] px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleCheckDomain()}
                  disabled={checking}
                  className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                >
                  {checking ? 'Đang kiểm tra...' : 'Kiểm Tra Giá'}
                </button>
              </div>
            </div>

            {/* Template Selector */}
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

            {/* Target URL & Telegram */}
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

            {/* Ghi chú */}
            {user?.role !== 'admin' && (
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Ghi chú cho Admin (Tuỳ chọn)
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Nhập ghi chú yêu cầu thêm cho đơn hàng..."
                  className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-4 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-indigo-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                'Đang xử lý...'
              ) : user?.role === 'admin' ? (
                <>
                  <ShoppingCart className="h-4 w-4" /> Mua & Triển Khai Ngay Tức Thì (Admin)
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Gửi Đơn Đặt Mua (Chờ Admin Duyệt)
                </>
              )}
            </button>
          </form>
        </div>

        {/* Pricing Summary Sidebar */}
        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            Chi Tiết Báo Giá Tên Miền
          </h3>

          {checkResult ? (
            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-400">Tên miền:</span>
                <span className="font-mono font-bold text-white">{checkResult.domain}</span>
              </div>

              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-400">Trạng thái:</span>
                <span
                  className={`font-semibold ${
                    checkResult.available ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {checkResult.available ? 'Có thể đăng ký' : 'Đã đăng ký / Có sẵn'}
                </span>
              </div>

              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-400">Quy tắc định giá:</span>
                <span className="font-semibold text-cyan-300">
                  {checkResult.pricing.ruleApplied}
                </span>
              </div>

              <div className="rounded-xl bg-[#161d31] p-3 space-y-1.5 border border-cyan-500/20">
                <div className="flex justify-between font-bold text-white">
                  <span>Giá thanh toán:</span>
                  <span className="text-cyan-400 text-sm">
                    {checkResult.pricing.regXu} Xu
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-400">
                  <span>Quy đổi VNĐ:</span>
                  <span>{checkResult.pricing.regVnd.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-gray-400">
                Ví hiện có:{' '}
                <span className="font-bold text-amber-400">{balance.toLocaleString('vi-VN')} Xu</span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-xs text-gray-400">
              Nhập tên miền và ấn <span className="text-cyan-400 font-semibold">"Kiểm Tra Giá"</span> để xem chi tiết chi phí và tính khả dụng.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
