import React, { useState, useEffect } from 'react';
import api, { apiError, parseBatchText } from '../services/api.js';
import type { ParsedBatchLine, LandingTemplate } from '../types/index.js';
import { Wand2, Clipboard, Trash2, Lightbulb, Play, ShieldAlert, CheckCircle2, XCircle, AlertCircle, FileText } from 'lucide-react';

export const BatchTab: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [defaultTemplateId, setDefaultTemplateId] = useState('');
  const [templates, setTemplates] = useState<LandingTemplate[]>([]);
  const [parsedItems, setParsedItems] = useState<ParsedBatchLine[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const [mode, setMode] = useState<'point' | 'buy'>('point');
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);

  useEffect(() => {
    api.get('/templates').then((res) => {
      if (res.data.success) {
        const list = res.data.templates || [];
        setTemplates(list);
        if (list[0]) setDefaultTemplateId(list[0].id);
      }
    });
  }, []);

  const parseText = (textToParse?: string, templateOverride?: string) => {
    const text = textToParse !== undefined ? textToParse : inputText;
    const tplId = templateOverride || defaultTemplateId;
    if (!text || !text.trim()) {
      setFeedback({ type: 'warning', message: 'Vui lòng nhập danh sách dữ liệu để phân tích!' });
      setParsedItems([]);
      return;
    }

    const parsed = parseBatchText(text, tplId);
    const items = parsed.items.map((item) => {
      const byCname = item.cnameTarget
        ? templates.find((t) => t.cnameTarget === item.cnameTarget)
        : null;
      const tpl = byCname || templates.find((t) => t.id === (item.templateId || tplId));
      return {
        ...item,
        templateId: tpl?.id || tplId,
        cnameTarget: tpl?.cnameTarget || item.cnameTarget || '',
      };
    });
    setParsedItems(items);

    if (parsed.validCount > 0 && parsed.invalidCount === 0) {
      setFeedback({
        type: 'success',
        message: `🎉 Đã phân tích thành công ${parsed.validCount} tên miền hợp lệ.`,
      });
    } else if (parsed.validCount > 0 && parsed.invalidCount > 0) {
      setFeedback({
        type: 'warning',
        message: `⚠️ ${parsed.validCount} dòng hợp lệ, ${parsed.invalidCount} dòng sai cú pháp.`,
      });
    } else {
      setFeedback({
        type: 'error',
        message: `❌ Không tìm thấy tên miền hợp lệ nào.`,
      });
    }
  };

  const handlePasteExample = () => {
    const example = `1. autotest-6888.top -> https://google.com | @freze_tele
2. domain2-demo.xyz -> https://fb.com
3. domain3-demo.net   https://zalo.me`;
    setInputText(example);
    parseText(example);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
        parseText(text);
      }
    } catch {
      // Clipboard denied
    }
  };

  const handleClear = () => {
    setInputText('');
    setParsedItems([]);
    setFeedback(null);
    setExecutionResult(null);
  };

  const handleExecute = async () => {
    const validItems = parsedItems.filter((i) => i.isValid && i.templateId);
    if (validItems.length === 0) {
      setFeedback({ type: 'error', message: 'Không có dòng dữ liệu hợp lệ nào để xử lý!' });
      return;
    }

    setExecuting(true);
    setExecutionResult(null);

    const results: any[] = [];
    for (const item of validItems) {
      try {
        if (mode === 'buy') {
          const res = await api.post('/tasks/buy-and-deploy', {
            domain: item.domain,
            link: item.targetUrl,
            tele: item.telegramUrl,
            templateId: item.templateId,
            isBuy: true,
            mode: 'LP',
          });
          results.push({
            domain: item.domain,
            success: !!res.data.success,
            error: res.data.error,
            jobId: res.data.jobId,
          });
        } else {
          const res = await api.post('/deploy-lp', {
            domain: item.domain,
            link: item.targetUrl,
            tele: item.telegramUrl,
            templateId: item.templateId,
            isBuy: false,
          });
          results.push({
            domain: item.domain,
            success: !!res.data.success,
            error: res.data.error,
          });
        }
      } catch (err: any) {
        results.push({ domain: item.domain, success: false, error: apiError(err) });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    setExecutionResult({ total: results.length, successCount, results });
    setFeedback({
      type: successCount === results.length ? 'success' : successCount > 0 ? 'warning' : 'error',
      message: `Hoàn tất ${successCount}/${results.length}. Xem tab Tasks nếu dùng chế độ Mua.`,
    });
    setExecuting(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
          <Wand2 className="h-4 w-4" />
          Xử Lý Hàng Loạt Thông Minh
        </div>
        <h2 className="mt-1 text-2xl font-extrabold text-white">Nhập Văn Bản & Cấu Hình Hàng Loạt</h2>
        <p className="mt-1 text-xs text-gray-400">
          Parse local → Point dùng /api/deploy-lp · Buy dùng /api/tasks/buy-and-deploy.
        </p>
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center gap-3 text-xs text-emerald-300">
        <ShieldAlert className="h-5 w-5 text-emerald-400 shrink-0" />
        <div>
          <span className="font-bold">An Toàn:</span> Khi test chỉ dùng{' '}
          <code className="bg-emerald-950/80 px-1.5 py-0.5 rounded font-mono font-bold text-emerald-200">autotest-6888.top</code>.
          Không chạy hàng loạt lên domain live trừ khi bạn chủ động.
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-xs font-bold text-gray-300 flex items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-400" />
            Dán danh sách vào đây
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePasteExample}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-all"
            >
              <Lightbulb className="h-3.5 w-3.5" /> Dán Ví Dụ Mẫu
            </button>
            <button
              onClick={handlePasteClipboard}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-all"
            >
              <Clipboard className="h-3.5 w-3.5" /> Dán Từ Clipboard
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" /> Xoá
            </button>
          </div>
        </div>

        <textarea
          rows={6}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            if (e.target.value) parseText(e.target.value);
            else {
              setParsedItems([]);
              setFeedback(null);
            }
          }}
          placeholder={`autotest-6888.top -> https://gg88.com | @telebot\ndomain2.com  https://target2.com`}
          className="w-full rounded-xl border border-gray-800 bg-[#161d31] p-4 text-xs font-mono text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
        />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-gray-800">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs text-gray-400">Mẫu mặc định:</span>
            <select
              value={defaultTemplateId}
              onChange={(e) => {
                const next = e.target.value;
                setDefaultTemplateId(next);
                if (inputText) parseText(inputText, next);
              }}
              className="rounded-xl border border-gray-800 bg-[#161d31] px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.brand}] {t.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => parseText()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all"
          >
            <Wand2 className="h-4 w-4" /> Phân Tích Thông Minh
          </button>
        </div>

        {feedback && (
          <div
            className={`rounded-xl border p-4 text-xs font-medium flex items-center gap-3 transition-all ${
              feedback.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : feedback.type === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            ) : feedback.type === 'warning' ? (
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {parsedItems.length > 0 && (
        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white">Bảng Kết Quả ({parsedItems.length} dòng)</h3>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-xl bg-[#161d31] p-1 border border-gray-800">
                <button
                  onClick={() => setMode('point')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    mode === 'point' ? 'bg-cyan-500 text-black shadow' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Trỏ Miền
                </button>
                <button
                  onClick={() => setMode('buy')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    mode === 'buy' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Mua Miền
                </button>
              </div>

              <button
                onClick={handleExecute}
                disabled={executing}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-500 transition-all disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {executing ? 'Đang chạy...' : `Chạy (${parsedItems.filter((i) => i.isValid).length})`}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-800 text-gray-400">
                <tr>
                  <th className="py-2.5 px-3">STT</th>
                  <th className="py-2.5 px-3">Tên Miền</th>
                  <th className="py-2.5 px-3">Link Đích</th>
                  <th className="py-2.5 px-3">Telegram</th>
                  <th className="py-2.5 px-3">Template</th>
                  <th className="py-2.5 px-3">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono">
                {parsedItems.map((item, index) => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-gray-500">{index + 1}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{item.domain}</td>
                    <td className="py-2.5 px-3 text-cyan-300 truncate max-w-xs">{item.targetUrl}</td>
                    <td className="py-2.5 px-3 text-gray-400">{item.telegramUrl || '—'}</td>
                    <td className="py-2.5 px-3 text-emerald-400">{item.templateId || item.cnameTarget}</td>
                    <td className="py-2.5 px-3">
                      {item.isValid ? (
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/20">
                          Hợp Lệ
                        </span>
                      ) : (
                        <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-400 border border-rose-500/20">
                          {item.error || 'Lỗi'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {executionResult && (
        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Kết Quả: {executionResult.successCount}/{executionResult.total} Thành Công
          </h3>
          <div className="space-y-2">
            {executionResult.results?.map((r: any, idx: number) => (
              <div
                key={idx}
                className={`flex items-center justify-between rounded-xl p-3 text-xs border ${
                  r.success
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}
              >
                <span className="font-mono font-bold">{r.domain}</span>
                <span>{r.success ? `✅ OK${r.jobId ? ` (${r.jobId})` : ''}` : `❌ ${r.error}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
