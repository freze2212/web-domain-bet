import React, { useState, useEffect } from 'react';
import api from '../services/api.js';
import type { HistoryRecord } from '../types/index.js';
import { History, RefreshCw } from 'lucide-react';

export const HistoryTab: React.FC = () => {
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/history');
      if (res.data.success) {
        setHistory(res.data.history || []);
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
              <History className="h-4 w-4" />
              Nhật Ký Thao Tác Hệ Thống
            </div>
            <h2 className="mt-1 text-2xl font-extrabold text-white">Lịch Sử Mua & Cấu Hình Tên Miền</h2>
            <p className="mt-1 text-xs text-gray-400">
              Toàn bộ nhật ký kiểm tra, mua miền, trỏ DNS và gán Landing Page được lưu vết chi tiết.
            </p>
          </div>

          <button
            onClick={fetchHistory}
            className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-[#161d31] px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Làm mới
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-800 text-gray-400">
              <tr>
                <th className="py-2.5 px-3">Mã Nhật Ký</th>
                <th className="py-2.5 px-3">Hành Động</th>
                <th className="py-2.5 px-3">Tên Miền</th>
                <th className="py-2.5 px-3">Landing Page</th>
                <th className="py-2.5 px-3">Người Thực Hiện</th>
                <th className="py-2.5 px-3">Trạng Thái</th>
                <th className="py-2.5 px-3">Thời Gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-mono">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    Chưa có lịch sử thao tác nào
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-gray-400">{h.id}</td>
                    <td className="py-2.5 px-3 font-sans font-bold text-white">{h.action}</td>
                    <td className="py-2.5 px-3 font-bold text-cyan-300">{h.domain}</td>
                    <td className="py-2.5 px-3 text-emerald-400">{h.cname || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-300 font-sans">@{h.user || 'system'}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          h.status === 'SUCCESS'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {h.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-400">
                      {new Date(h.timestamp).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
