import React, { useState, useEffect } from 'react';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { Settings, Save, CreditCard } from 'lucide-react';

export const SettingsTab: React.FC = () => {
  const { user } = useAuth();
  const [bankConfig, setBankConfig] = useState<any>({
    bankId: 'MB',
    bankName: 'MBBank (Ngân Hàng Quân Đội)',
    accountNumber: '0988889999',
    accountName: 'NGUYEN VAN FREZE',
    vndRate: 25400,
    prefix: 'NAP',
  });
  const [savingBank, setSavingBank] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      api.get('/admin/bank-config').then((res) => {
        if (res.data.success && (res.data.bank || res.data.config)) {
          setBankConfig(res.data.bank || res.data.config);
        }
      });
    }
  }, [user]);

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBank(true);
    setMessage(null);

    try {
      const res = await api.post('/admin/bank-config', bankConfig);
      if (res.data.success) {
        setMessage({ type: 'success', text: '✅ Đã lưu cấu hình ngân hàng thành công!' });
        if (res.data.bank) setBankConfig(res.data.bank);
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || err.response?.data?.message || err.message,
      });
    } finally {
      setSavingBank(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
          <Settings className="h-4 w-4" />
          Cài Đặt & Cấu Hình Hệ Thống
        </div>
        <h2 className="mt-1 text-2xl font-extrabold text-white">Cấu Hình Ngân Hàng & Tỷ Giá</h2>
        <p className="mt-1 text-xs text-gray-400">
          Thiết lập thông tin tài khoản thụ hưởng VietQR, cú pháp chuyển khoản và tỷ giá nạp Xu.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-4 text-xs font-medium ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {user?.role === 'admin' ? (
        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 max-w-2xl">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4 border-b border-gray-800 pb-3">
            <CreditCard className="h-4 w-4 text-cyan-400" />
            Cấu Hình Ngân Hàng Thụ Hưởng VietQR
          </h3>

          <form onSubmit={handleSaveBank} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-gray-300 mb-1">Mã Ngân Hàng (Bank ID)</label>
                <input
                  type="text"
                  required
                  value={bankConfig.bankId}
                  onChange={(e) => setBankConfig({ ...bankConfig, bankId: e.target.value })}
                  placeholder="MB, VCB, TCB, ACB..."
                  className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3.5 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-300 mb-1">Tên Đầy Đủ Ngân Hàng</label>
                <input
                  type="text"
                  required
                  value={bankConfig.bankName}
                  onChange={(e) => setBankConfig({ ...bankConfig, bankName: e.target.value })}
                  placeholder="MBBank (Ngân Hàng Quân Đội)"
                  className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3.5 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-gray-300 mb-1">Số Tài Khoản</label>
                <input
                  type="text"
                  required
                  value={bankConfig.accountNumber}
                  onChange={(e) => setBankConfig({ ...bankConfig, accountNumber: e.target.value })}
                  placeholder="0988889999"
                  className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3.5 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-300 mb-1">Tên Chủ Tài Khoản</label>
                <input
                  type="text"
                  required
                  value={bankConfig.accountName}
                  onChange={(e) => setBankConfig({ ...bankConfig, accountName: e.target.value })}
                  placeholder="NGUYEN VAN FREZE"
                  className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3.5 py-2 text-white uppercase focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-gray-300 mb-1">Cú Pháp Nạp (Prefix)</label>
                <input
                  type="text"
                  required
                  value={bankConfig.prefix}
                  onChange={(e) => setBankConfig({ ...bankConfig, prefix: e.target.value })}
                  placeholder="NAP"
                  className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3.5 py-2 text-white uppercase font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-300 mb-1">Tỷ Giá USD/VNĐ</label>
                <input
                  type="number"
                  required
                  value={bankConfig.vndRate}
                  onChange={(e) => setBankConfig({ ...bankConfig, vndRate: parseFloat(e.target.value) || 25400 })}
                  placeholder="25400"
                  className="w-full rounded-xl border border-gray-800 bg-[#161d31] px-3.5 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingBank}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {savingBank ? 'Đang lưu...' : 'Lưu Thay Đổi Cấu Hình'}
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-8 text-center text-xs text-gray-400">
          Chức năng cài đặt API & ngân hàng chỉ dành cho tài khoản Quản trị viên (Admin).
        </div>
      )}
    </div>
  );
};
