import React, { useState, useEffect } from 'react';
import api from '../services/api.js';
import type { LandingTemplate } from '../types/index.js';
import { Search, ExternalLink, Rocket, Sparkles, ShieldCheck } from 'lucide-react';

interface TemplatesTabProps {
  onApplyTemplate: (template: LandingTemplate) => void;
}

export const TemplatesTab: React.FC<TemplatesTabProps> = ({ onApplyTemplate }) => {
  const [templates, setTemplates] = useState<LandingTemplate[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/templates');
      if (res.data.success) {
        setTemplates(res.data.templates || []);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const brands = [
    { id: 'ALL', label: 'Tất cả' },
    { id: 'GG88', label: '⭐ GG88' },
    { id: 'MM88', label: '💎 MM88' },
    { id: 'LLWIN', label: '🚀 LLWIN' },
    { id: 'XX88', label: '👑 XX88' },
  ];

  const filteredTemplates = templates.filter((tpl) => {
    const matchesBrand = selectedBrand === 'ALL' || tpl.brand?.toUpperCase() === selectedBrand.toUpperCase();
    const query = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !query ||
      tpl.name?.toLowerCase().includes(query) ||
      tpl.title?.toLowerCase().includes(query) ||
      tpl.cnameTarget?.toLowerCase().includes(query) ||
      tpl.folder?.toLowerCase().includes(query) ||
      tpl.brand?.toLowerCase().includes(query);
    return matchesBrand && matchesQuery;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
              <Sparkles className="h-4 w-4" />
              Kho Mẫu Landing Page Trực Quan
            </div>
            <h2 className="mt-1 text-2xl font-extrabold text-white">
              Kho Giao Diện Landing Page Chuẩn Quốc Tế
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              Duyệt xem ảnh thực tế toàn bộ mẫu giao diện, xem Live Demo và gán tên miền chỉ với 1 cú click.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-300">
              Tổng số mẫu: {templates.length}
            </span>
          </div>
        </div>
      </div>

      {/* Controls: Search & Brand Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Brand Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBrand(b.id)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                selectedBrand === b.id
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                  : 'border border-gray-800 bg-[#121829] text-gray-400 hover:border-gray-700 hover:text-white'
              }`}
            >
              {b.label} ({templates.filter((t) => b.id === 'ALL' || t.brand?.toUpperCase() === b.id.toUpperCase()).length})
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm mẫu theo tên, CNAME, thương hiệu..."
            className="w-full rounded-xl border border-gray-800 bg-[#121829] pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="py-20 text-center text-sm text-gray-400 animate-pulse">
          Đang tải danh sách mẫu Landing Page...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 p-12 text-center text-gray-400">
          Không tìm thấy mẫu Landing Page nào phù hợp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-800/80 bg-[#101626] transition-all hover:-translate-y-1 hover:border-cyan-500/50 hover:shadow-[0_10px_30px_rgba(6,182,212,0.15)]"
            >
              {/* Card Header & Brand Badge */}
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-lg px-2.5 py-0.5 text-[10px] font-extrabold uppercase border ${
                      tpl.brand === 'GG88'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : tpl.brand === 'MM88'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : tpl.brand === 'LLWIN'
                        ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                        : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                    }`}
                  >
                    {tpl.brand}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-gray-400 font-mono">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    Verified Active
                  </span>
                </div>

                <h3 className="mt-3 text-sm font-bold text-white group-hover:text-cyan-400 transition-colors line-clamp-2">
                  {tpl.name}
                </h3>

                <div className="mt-3">
                  <a
                    href={`https://${tpl.cnameTarget}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Mở trang mẫu live"
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10"
                  >
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Mẫu
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-cyan-300">
                      {tpl.pagesProject || String(tpl.cnameTarget || '').replace(/\.pages\.dev$/i, '')}
                    </span>
                    <span className="shrink-0 text-cyan-400/80">↗</span>
                  </a>
                  {tpl.sampleDomain && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5 text-[11px] text-gray-500">
                      <span>Demo</span>
                      <span className="truncate font-mono text-gray-400">{tpl.sampleDomain}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[1.15fr_0.85fr] gap-2 border-t border-gray-800/80 bg-[#0d1220] p-4">
                <button
                  onClick={() => onApplyTemplate(tpl)}
                  className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2 text-xs font-bold text-white shadow-md shadow-cyan-500/20 transition-all hover:from-cyan-400 hover:to-blue-500"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Áp dụng
                </button>
                <a
                  href={tpl.sampleUrl || `https://${tpl.cnameTarget}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-transparent py-2 text-xs font-semibold text-gray-400 transition-all hover:border-cyan-500/45 hover:bg-cyan-500/10 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-cyan-400" />
                  Mở web
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
