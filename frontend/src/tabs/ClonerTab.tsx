import React, { useState } from 'react';
import api, { apiError } from '../services/api.js';
import { Download, Sparkles, CheckCircle2 } from 'lucide-react';

export const ClonerTab: React.FC = () => {
  const [targetUrl, setTargetUrl] = useState('');
  const [cleanJs, setCleanJs] = useState(true);
  const [downloadAssets, setDownloadAssets] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl || !targetUrl.startsWith('http')) {
      setError('Vui lòng nhập URL hợp lệ bắt đầu bằng http:// hoặc https://');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.post('/tasks/clone-web', {
        url: targetUrl,
        cleanJs,
        downloadAssets,
      });
      if (res.data.success) {
        setResult(res.data);
      } else {
        setError(res.data.error || 'Lỗi khi sao chép website');
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
          <Sparkles className="h-4 w-4" />
          VIP Web Cloner Pro
        </div>
        <h2 className="mt-1 text-2xl font-extrabold text-white">Sao Chép & Bóc Tách Mã Nguồn Landing Page</h2>
        <p className="mt-1 text-xs text-gray-400">
          Chạy ngầm qua task queue (User thường trừ 100 Xu / lượt). Theo dõi tiến trình ở tab Tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-gray-800 bg-[#101626] p-6">
          <form onSubmit={handleClone} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                URL Website Cần Sao Chép <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                required
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example-landingpage.com"
                className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanJs}
                  onChange={(e) => setCleanJs(e.target.checked)}
                  className="rounded border-gray-700 bg-gray-900 text-cyan-500 focus:ring-cyan-500 h-4 w-4"
                />
                <span>Lọc sạch mã JavaScript theo dõi / popup không mong muốn</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={downloadAssets}
                  onChange={(e) => setDownloadAssets(e.target.checked)}
                  className="rounded border-gray-700 bg-gray-900 text-cyan-500 focus:ring-cyan-500 h-4 w-4"
                />
                <span>Tải trọn bộ Assets cục bộ (hình ảnh, fonts, stylesheet)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-xs font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              {loading ? 'Đang tạo task...' : 'Bắt Đầu Sao Chép Website'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Kết Quả</h3>
          {result ? (
            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">
                <CheckCircle2 className="h-4 w-4 inline mr-1 text-emerald-400" />
                {result.message}
              </div>

              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-400">Job ID:</span>
                <span className="font-mono text-cyan-400">{result.jobId}</span>
              </div>

              <p className="text-gray-400">Mở tab Tasks để xem log clone realtime.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-xs text-gray-400">
              Nhập URL và bấm sao chép để tạo task ngầm.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
