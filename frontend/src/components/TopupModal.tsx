import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext.js';
import { useAuth } from '../context/AuthContext.js';
import api, { apiError } from '../services/api.js';
import { X, Copy, Check, QrCode, RefreshCw } from 'lucide-react';

export const TopupModal: React.FC = () => {
  const { isTopupOpen, closeTopup, refreshBalance } = useWallet();
  const { user } = useAuth();
  const [amountXu, setAmountXu] = useState<number>(200);
  const [qrData, setQrData] = useState<any>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQrInfo = async (xu: number) => {
    if (!user) return;
    setError(null);
    try {
      const res = await api.get(`/wallet/qr-code?amount=${xu}&username=${encodeURIComponent(user.username)}`);
      if (res.data.success) {
        setQrData(res.data);
      } else {
        setError(res.data.error || 'Không lấy được mã QR');
      }
    } catch (err: any) {
      setError(apiError(err));
    }
  };

  useEffect(() => {
    if (isTopupOpen && user) {
      fetchQrInfo(amountXu);
    }
  }, [isTopupOpen, amountXu, user]);

  if (!isTopupOpen) return null;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-cyan-500/30 bg-[#0f1422] p-6 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Nạp Xu Tự Động VietQR
                <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs font-semibold text-cyan-300">
                  100k = 100 Xu
                </span>
              </h3>
              <p className="text-xs text-gray-400">Quét mã QR bằng App Ngân Hàng để nạp tự động</p>
            </div>
          </div>
          <button
            onClick={closeTopup}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Chọn gói nạp nhanh:
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[100, 200, 350, 500].map((val) => (
              <button
                key={val}
                onClick={() => setAmountXu(val)}
                className={`rounded-xl border py-2 text-xs font-bold transition-all ${
                  amountXu === val
                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                    : 'border-gray-800 bg-[#161d31] text-gray-300 hover:border-gray-700'
                }`}
              >
                {val} Xu
                <span className="block text-[10px] font-normal text-gray-400">
                  {(val * 1000).toLocaleString('vi-VN')} đ
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</div>
        )}

        {qrData && (
          <div className="flex flex-col md:flex-row gap-4 items-center bg-[#13192b] border border-gray-800 rounded-xl p-4">
            <div className="flex flex-col items-center">
              <div className="relative rounded-lg bg-white p-2 shadow-md">
                <img src={qrData.qrUrl} alt="VietQR Code" className="h-44 w-44 object-contain" />
              </div>
              <span className="mt-1 text-[11px] text-gray-400">Tự động điền số tiền & nội dung</span>
            </div>

            <div className="flex-1 space-y-2.5 text-xs w-full">
              <div>
                <span className="text-gray-400">Ngân hàng:</span>
                <p className="font-semibold text-white">
                  {qrData.bankName} ({qrData.bankId})
                </p>
              </div>

              <div>
                <span className="text-gray-400">Số tài khoản:</span>
                <div className="flex items-center justify-between rounded bg-[#0b0e18] px-2.5 py-1.5 border border-gray-800">
                  <span className="font-mono font-bold text-cyan-400 text-sm">{qrData.accountNumber}</span>
                  <button onClick={() => copyToClipboard(qrData.accountNumber, 'acc')} className="text-gray-400 hover:text-white">
                    {copiedField === 'acc' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-gray-400">Chủ tài khoản:</span>
                <p className="font-semibold text-white">{qrData.accountName}</p>
              </div>

              <div>
                <span className="text-gray-400">Nội dung chuyển khoản (Bắt buộc):</span>
                <div className="flex items-center justify-between rounded bg-[#0b0e18] px-2.5 py-1.5 border border-cyan-500/30">
                  <span className="font-mono font-bold text-amber-400 text-xs">{qrData.transferContent}</span>
                  <button
                    onClick={() => copyToClipboard(qrData.transferContent, 'content')}
                    className="text-gray-400 hover:text-white"
                  >
                    {copiedField === 'content' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between pt-3 border-t border-gray-800">
          <button
            onClick={() => refreshBalance()}
            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Kiểm tra số dư
          </button>
          <button
            onClick={closeTopup}
            className="rounded-xl bg-cyan-500 hover:bg-cyan-400 px-5 py-2 text-xs font-bold text-black transition-colors"
          >
            Đã chuyển khoản xong
          </button>
        </div>
      </div>
    </div>
  );
};
