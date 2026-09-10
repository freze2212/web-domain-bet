import React, { useState, useEffect } from 'react';
import api, { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useWallet } from '../context/WalletContext.js';
import type { Transaction, DomainOrder } from '../types/index.js';
import { Coins, QrCode, ShieldCheck, UserPlus } from 'lucide-react';

export const WalletTab: React.FC = () => {
  const { user } = useAuth();
  const { balance, openTopup, refreshBalance } = useWallet();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<DomainOrder[]>([]);

  // Admin Topup Form
  const [topupTargetUser, setTopupTargetUser] = useState('');
  const [topupAmount, setTopupAmount] = useState<number>(100);
  const [topupNote, setTopupNote] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    if (!user) return;
    try {
      const txRes = await api.get('/wallet/transactions');
      if (txRes.data.success) {
        setTransactions(txRes.data.transactions || []);
      }

      const ordRes = await api.get('/domain-orders');
      if (ordRes.data.success) {
        setOrders(ordRes.data.orders || []);
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleApproveOrder = async (orderId: string) => {
    try {
      const res = await api.post(`/admin/domain-orders/${orderId}/approve`);
      if (res.data.success) {
        setActionMsg({ type: 'success', text: `✅ Đã duyệt đơn hàng #${orderId} thành công!` });
        fetchData();
        refreshBalance();
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: apiError(err) });
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    const reason = prompt('Nhập lý do từ chối đơn hàng:');
    if (reason === null) return;

    try {
      const res = await api.post(`/admin/domain-orders/${orderId}/reject`, { reason });
      if (res.data.success) {
        setActionMsg({ type: 'success', text: `Đã từ chối đơn hàng #${orderId}` });
        fetchData();
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: apiError(err) });
    }
  };

  const handleAdminTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topupTargetUser || topupAmount <= 0) return;

    try {
      const res = await api.post('/admin/wallet/topup', {
        userId: topupTargetUser,
        username: topupTargetUser,
        amount: topupAmount,
        note: topupNote || 'Admin nạp Xu trực tiếp',
      });
      if (res.data.success) {
        setActionMsg({
          type: 'success',
          text: `✅ Đã nạp thành công ${topupAmount} Xu cho ${topupTargetUser}!`,
        });
        setTopupTargetUser('');
        fetchData();
        refreshBalance();
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: apiError(err) });
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-[#111827] via-[#0d1f38] to-[#111827] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
              <Coins className="h-4 w-4" />
              Ví Xu & Quản Trị Thành Viên
            </div>
            <h2 className="mt-1 text-2xl font-extrabold text-white">Quản Lý Ví Xu & Đơn Đặt Mua</h2>
            <p className="mt-1 text-xs text-gray-400">
              Kiểm tra số dư, quét mã VietQR nạp tự động và quản lý đơn đặt mua tên miền.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
              <span className="text-xs text-gray-400">Số Dư Khả Dụng:</span>
              <div className="text-xl font-extrabold text-amber-400">{balance.toLocaleString('vi-VN')} Xu</div>
            </div>

            <button
              onClick={openTopup}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-xs font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all"
            >
              <QrCode className="h-5 w-5" /> Nạp Xu VietQR
            </button>
          </div>
        </div>
      </div>

      {actionMsg && (
        <div
          className={`rounded-xl border p-4 text-xs font-medium ${
            actionMsg.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Admin Section: Pending Domain Orders */}
      {user?.role === 'admin' && (
        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                Danh Sách Đơn Đặt Mua Tên Miền (Admin Duyệt)
              </h3>
              <p className="text-xs text-gray-400">Duyệt đơn để tự động trừ Xu của User và kích hoạt mua tên miền</p>
            </div>
            <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300 border border-amber-500/20">
              {orders.filter((o) => o.status === 'pending').length} Chờ Duyệt
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-800 text-gray-400">
                <tr>
                  <th className="py-2.5 px-3">Mã Đơn</th>
                  <th className="py-2.5 px-3">Người Đặt</th>
                  <th className="py-2.5 px-3">Tên Miền</th>
                  <th className="py-2.5 px-3">Giá (Xu)</th>
                  <th className="py-2.5 px-3">Số Dư User</th>
                  <th className="py-2.5 px-3">Trạng Thái</th>
                  <th className="py-2.5 px-3 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-gray-500">
                      Chưa có đơn đặt mua nào
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 text-gray-400">{o.id}</td>
                      <td className="py-2.5 px-3 font-sans font-semibold text-white">
                        @{o.username} ({o.fullName})
                      </td>
                      <td className="py-2.5 px-3 font-bold text-cyan-300">{o.domain}</td>
                      <td className="py-2.5 px-3 font-bold text-amber-400">{o.priceXu} Xu</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span
                          className={o.hasEnoughBalance ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}
                        >
                          {o.userCurrentBalance?.toLocaleString('vi-VN')} Xu
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            o.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : o.status === 'rejected'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {o.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {o.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApproveOrder(o.id)}
                              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-2.5 py-1 text-[11px] font-bold text-black transition-colors"
                            >
                              Duyệt & Trừ Xu
                            </button>
                            <button
                              onClick={() => handleRejectOrder(o.id)}
                              className="rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 px-2.5 py-1 text-[11px] font-bold transition-colors"
                            >
                              Từ Chối
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-[11px]">Đã xử lý</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Admin Section: Topup User */}
      {user?.role === 'admin' && (
        <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-cyan-400" />
            Nạp Xu Thủ Công Cho Thành Viên (Admin Only)
          </h3>
          <form onSubmit={handleAdminTopup} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              required
              value={topupTargetUser}
              onChange={(e) => setTopupTargetUser(e.target.value)}
              placeholder="User ID (vd: u_admin, u_xxx)"
              className="rounded-xl border border-gray-800 bg-[#161d31] px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none font-mono"
            />
            <input
              type="number"
              required
              min={1}
              value={topupAmount}
              onChange={(e) => setTopupAmount(parseFloat(e.target.value) || 0)}
              placeholder="Số lượng Xu"
              className="rounded-xl border border-gray-800 bg-[#161d31] px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none font-mono"
            />
            <input
              type="text"
              value={topupNote}
              onChange={(e) => setTopupNote(e.target.value)}
              placeholder="Ghi chú nạp"
              className="rounded-xl border border-gray-800 bg-[#161d31] px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2 text-xs font-bold text-black shadow hover:from-amber-400 hover:to-orange-400 transition-all"
            >
              + Nạp Xu Cho User
            </button>
          </form>
        </div>
      )}

      {/* Transaction History */}
      <div className="rounded-2xl border border-gray-800 bg-[#101626] p-6 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-400" />
          Lịch Sử Giao Dịch Ví ({transactions.length})
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-800 text-gray-400">
              <tr>
                <th className="py-2.5 px-3">Mã GD</th>
                <th className="py-2.5 px-3">Loại GD</th>
                <th className="py-2.5 px-3">Biến Động</th>
                <th className="py-2.5 px-3">Số Dư Sau GD</th>
                <th className="py-2.5 px-3">Nội Dung</th>
                <th className="py-2.5 px-3">Thời Gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 font-mono">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    Chưa có giao dịch nào
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-gray-400">{t.id}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          t.type === 'TOPUP'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold">
                      {t.amount > 0 ? (
                        <span className="text-emerald-400">+{t.amount} Xu</span>
                      ) : (
                        <span className="text-rose-400">{t.amount} Xu</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-white font-bold">{t.newBalance} Xu</td>
                    <td className="py-2.5 px-3 text-gray-300 font-sans">{t.note}</td>
                    <td className="py-2.5 px-3 text-gray-400">
                      {new Date(t.timestamp).toLocaleString('vi-VN')}
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
