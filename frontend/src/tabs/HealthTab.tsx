import React, { useState } from 'react';
import api, { apiError } from '../services/api.js';
import type { HealthReport } from '../types/index.js';
import { Stethoscope, Wrench, ShieldAlert, CheckCircle2, XCircle, Activity } from 'lucide-react';

export const HealthTab: React.FC = () => {
  const [domain, setDomain] = useState('autotest-6888.top');
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [result, setResult] = useState<HealthReport | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInspect = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!domain) return;
    setLoading(true);
    setRepairMessage(null);
    setError(null);

    try {
      const res = await api.post('/inspect-health', { domain });
      if (res.data.success) {
        setResult(res.data.report || res.data.reports?.[0] || null);
      } else {
        setError(res.data.error || 'Kiểm tra thất bại');
      }
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAutoRepair = async () => {
    if (!domain) return;
    setRepairing(true);
    setRepairMessage(null);
    setError(null);

    try {
      const res = await api.post('/fix-domain', { domain });
      if (res.data.success) {
        setRepairMessage(res.data.message || '✅ Đã chạy 1-Click Auto Fix');
        if (res.data.report) setResult(res.data.report);
        else await handleInspect();
      } else {
        setRepairMessage(`❌ ${res.data.error || 'Sửa thất bại'}`);
      }
    } catch (err: any) {
      setRepairMessage(`❌ ${apiError(err)}`);
    } finally {
      setRepairing(false);
    }
  };

  const statusColor =
    result?.overallStatus === 'HEALTHY'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : result?.overallStatus === 'DEGRADED'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-300';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
          <Stethoscope className="h-4 w-4" />
          Kiểm Tra & Tự Sửa Lỗi
        </div>
        <h2 className="mt-1 text-2xl font-extrabold text-white">Chẩn Đoán Sức Khỏe & 1-Click Auto Fix</h2>
        <p className="mt-1 text-xs text-gray-400">
          Rà soát DNS, Zone Cloudflare, SSL, HTTP, Pages Attachment và link đích thực tế.
        </p>
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center gap-3 text-xs text-emerald-300">
        <ShieldAlert className="h-5 w-5 text-emerald-400 shrink-0" />
        <div>
          <span className="font-bold">An Toàn:</span> Test kiểm tra/sửa với{' '}
          <code className="bg-emerald-950/80 px-1.5 py-0.5 rounded font-mono font-bold text-emerald-200">autotest-6888.top</code>.
          Auto Fix sẽ đụng DNS/Pages — chỉ bấm khi bạn chủ động muốn sửa miền đó.
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6">
        <form onSubmit={handleInspect} className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              required
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Nhập tên miền kiểm tra (vd: autotest-6888.top)"
              className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50"
          >
            <Activity className="h-4 w-4" />
            {loading ? 'Đang kiểm tra...' : 'Chạy Chẩn Đoán'}
          </button>
        </form>
        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</div>
        )}
      </div>

      {repairMessage && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-xs font-semibold text-cyan-300">
          {repairMessage}
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2 font-mono">
                Báo Cáo: {result.domain}
              </h3>
              <p className="text-xs text-gray-400">
                Điểm {result.healthScore}/{result.maxScore}
                {result.timestamp ? ` · ${new Date(result.timestamp).toLocaleString('vi-VN')}` : ''}
              </p>
              {result.detectedLink && (
                <p className="text-xs text-cyan-300 mt-1 truncate">Link phát hiện: {result.detectedLink}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className={`rounded-xl px-3 py-1 text-xs font-bold border ${statusColor}`}>
                {result.overallStatus}
              </span>

              <button
                onClick={handleAutoRepair}
                disabled={repairing}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-1.5 text-xs font-bold text-black shadow hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50"
              >
                <Wrench className="h-3.5 w-3.5" />
                {repairing ? 'Đang tự sửa...' : '1-Click Auto Fix'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {(result.checklist || []).map((item) => (
              <div key={item.id} className="rounded-xl bg-[#161d31] p-4 border border-gray-800">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <span className="font-bold text-white">{item.title}</span>
                  {item.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  )}
                </div>
                <p className="text-gray-300">{item.statusText}</p>
                {item.detail && <p className="text-gray-500 mt-1">{item.detail}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
