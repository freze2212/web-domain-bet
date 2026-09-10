import React, { useState, useEffect } from 'react';
import api, { apiError } from '../services/api.js';
import type { DomainRecord, LandingTemplate } from '../types/index.js';
import { Layers, Search, ExternalLink, RefreshCw, Link2, RefreshCcw, X } from 'lucide-react';

function domainName(d: DomainRecord) {
  return d.domain || d.name || '';
}

function ownerLabel(d: DomainRecord) {
  if (!d.owner) return 'Hệ thống';
  if (typeof d.owner === 'string') return d.owner;
  return d.owner.username || d.owner.userId || 'Hệ thống';
}

export const DomainsTab: React.FC = () => {
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [templates, setTemplates] = useState<LandingTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [editDomain, setEditDomain] = useState<DomainRecord | null>(null);
  const [newLink, setNewLink] = useState('');
  const [newTele, setNewTele] = useState('');
  const [savingLink, setSavingLink] = useState(false);

  const [switchDomain, setSwitchDomain] = useState<DomainRecord | null>(null);
  const [toMode, setToMode] = useState<'LP' | '302'>('LP');
  const [switchLink, setSwitchLink] = useState('');
  const [switchTemplateId, setSwitchTemplateId] = useState('');
  const [switching, setSwitching] = useState(false);

  const fetchDomains = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.get('/domains');
      if (res.data.success) {
        setDomains(res.data.domains || []);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: apiError(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDomains();
    api.get('/templates').then((res) => {
      if (res.data.success) {
        const tpls = res.data.templates || [];
        setTemplates(tpls);
        if (tpls[0]) setSwitchTemplateId(tpls[0].id);
      }
    });
  }, []);

  const filtered = domains.filter((d) => {
    const q = search.toLowerCase().trim();
    const name = domainName(d).toLowerCase();
    return (
      !q ||
      name.includes(q) ||
      ownerLabel(d).toLowerCase().includes(q) ||
      (d.templateName || '').toLowerCase().includes(q) ||
      (d.cnameTarget || '').toLowerCase().includes(q)
    );
  });

  const openSetLink = (d: DomainRecord) => {
    setEditDomain(d);
    setNewLink('');
    setNewTele('');
    setMessage(null);
  };

  const submitSetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDomain || !newLink) return;
    setSavingLink(true);
    try {
      const res = await api.post('/set-link', {
        domain: domainName(editDomain),
        link: newLink,
        tele: newTele,
      });
      if (res.data.success) {
        setMessage({
          type: 'success',
          text: `✅ Đã cập nhật link cho [${domainName(editDomain)}] (mode: ${res.data.mode || 'auto'})`,
        });
        setEditDomain(null);
        fetchDomains();
      } else {
        setMessage({ type: 'error', text: res.data.error || 'Thất bại' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: apiError(err) });
    } finally {
      setSavingLink(false);
    }
  };

  const openSwitch = (d: DomainRecord) => {
    setSwitchDomain(d);
    setToMode(d.sourceType === 'redirect_302' ? 'LP' : '302');
    setSwitchLink('');
    setMessage(null);
  };

  const submitSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!switchDomain || !switchLink) return;
    setSwitching(true);
    try {
      const res = await api.post('/tasks/switch-mode', {
        domain: domainName(switchDomain),
        toMode,
        targetUrl: switchLink,
        templateId: toMode === 'LP' ? switchTemplateId : null,
      });
      if (res.data.success) {
        setMessage({
          type: 'success',
          text: `✅ Đã tạo task chuyển [${domainName(switchDomain)}] → ${toMode}. Xem tab Tasks.`,
        });
        setSwitchDomain(null);
      } else {
        setMessage({ type: 'error', text: res.data.error || 'Thất bại' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: apiError(err) });
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
              <Layers className="h-4 w-4" />
              Quản Trị Danh Sách Tên Miền
            </div>
            <h2 className="mt-1 text-2xl font-extrabold text-white">Quản Lý Tên Miền Đã Cấu Hình</h2>
            <p className="mt-1 text-xs text-gray-400">
              Đổi link (set-link), chuyển LP ↔ 302, xem live. Không đụng DNS hàng loạt từ đây.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-300">
              Tổng số miền: {domains.length}
            </span>
            <button
              onClick={fetchDomains}
              className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-[#161d31] px-3.5 py-2 text-xs font-semibold text-gray-300 hover:text-white transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Làm mới
            </button>
          </div>
        </div>
      </div>

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

      <div className="relative w-full max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm theo tên miền, owner, mẫu..."
          className="w-full rounded-xl border border-gray-800 bg-[#121829] pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#101626]">
        {loading ? (
          <div className="py-20 text-center text-xs text-gray-400 animate-pulse">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-gray-400">Không tìm thấy tên miền nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-800 bg-[#0d1220] text-gray-400">
                <tr>
                  <th className="py-3 px-4">Tên Miền</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Mẫu / CNAME</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filtered.map((d) => {
                  const name = domainName(d);
                  return (
                    <tr key={name} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white">{name}</td>
                      <td className="py-3 px-4">
                        <span className="rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase border border-gray-700 text-gray-300">
                          {d.sourceType === 'redirect_302' ? '302' : 'LP'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-cyan-300">
                        <div className="font-sans text-white text-[11px]">{d.templateName || '—'}</div>
                        <div className="font-mono text-[10px] text-gray-500">{d.cnameTarget || '—'}</div>
                      </td>
                      <td className="py-3 px-4 font-sans text-gray-300">{ownerLabel(d)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            onClick={() => openSetLink(d)}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-sans font-medium text-cyan-300 hover:bg-cyan-500/20"
                          >
                            <Link2 className="h-3 w-3" /> Đổi Link
                          </button>
                          <button
                            onClick={() => openSwitch(d)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-sans font-medium text-amber-300 hover:bg-amber-500/20"
                          >
                            <RefreshCcw className="h-3 w-3" /> LP↔302
                          </button>
                          <a
                            href={`https://${name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-[#161d31] px-2.5 py-1 text-[11px] font-sans font-medium text-gray-300 hover:text-white"
                          >
                            <ExternalLink className="h-3 w-3" /> Live
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={submitSetLink}
            className="w-full max-w-md rounded-2xl border border-gray-700 bg-[#101626] p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Đổi link · {domainName(editDomain)}</h3>
              <button type="button" onClick={() => setEditDomain(null)} className="text-gray-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              required
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="https://affiliate..."
              className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3 py-2 text-xs text-white"
            />
            <input
              value={newTele}
              onChange={(e) => setNewTele(e.target.value)}
              placeholder="Telegram (tuỳ chọn)"
              className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3 py-2 text-xs text-white"
            />
            <button
              disabled={savingLink}
              className="w-full rounded-xl bg-cyan-600 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {savingLink ? 'Đang lưu...' : 'Lưu set-link'}
            </button>
          </form>
        </div>
      )}

      {switchDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={submitSwitch}
            className="w-full max-w-md rounded-2xl border border-gray-700 bg-[#101626] p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Chuyển mode · {domainName(switchDomain)}</h3>
              <button type="button" onClick={() => setSwitchDomain(null)} className="text-gray-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <select
              value={toMode}
              onChange={(e) => setToMode(e.target.value as 'LP' | '302')}
              className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3 py-2 text-xs text-white"
            >
              <option value="LP">Sang Landing Page (Git)</option>
              <option value="302">Sang 302 Redirect</option>
            </select>
            {toMode === 'LP' && (
              <select
                value={switchTemplateId}
                onChange={(e) => setSwitchTemplateId(e.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3 py-2 text-xs text-white"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.brand}] {t.name}
                  </option>
                ))}
              </select>
            )}
            <input
              required
              value={switchLink}
              onChange={(e) => setSwitchLink(e.target.value)}
              placeholder="Link đích https://..."
              className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3 py-2 text-xs text-white"
            />
            <button
              disabled={switching}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-black disabled:opacity-50"
            >
              {switching ? 'Đang tạo task...' : 'Chạy switch-mode'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
