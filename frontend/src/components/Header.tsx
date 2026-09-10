import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useWallet } from '../context/WalletContext.js';
import { AuthModal } from './AuthModal.js';
import { TopupModal } from './TopupModal.js';
import { Coins, LogIn, LogOut, Zap } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { balance, openTopup } = useWallet();
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gray-800/80 bg-[#0a0d18]/90 backdrop-blur-xl px-6 py-3.5 shadow-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30">
              <Zap className="h-5 w-5 text-white" />
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[#0a0d18] animate-ping" />
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[#0a0d18]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-wider text-white">
                  FREZE<span className="text-cyan-400">.HUB</span>
                </span>
                <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400 border border-cyan-500/20">
                  PRO 2026
                </span>
              </div>
              <p className="text-[11px] text-gray-400">Hệ Thống Tự Động Quản Trị Tên Miền & Landing Page</p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {/* Wallet Balance Badge */}
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                  <Coins className="h-4 w-4 text-amber-400 animate-pulse" />
                  <div className="text-xs">
                    <span className="text-gray-400">Ví Xu: </span>
                    <span className="font-extrabold text-amber-400">{balance.toLocaleString('vi-VN')} Xu</span>
                  </div>
                  <button
                    onClick={openTopup}
                    className="ml-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-[11px] font-bold text-black hover:from-amber-400 hover:to-orange-400 transition-all shadow"
                  >
                    + Nạp
                  </button>
                </div>

                {/* User Dropdown Profile */}
                <div className="flex items-center gap-2.5 rounded-xl border border-gray-800 bg-[#13192b] px-3.5 py-1.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-xs">
                    {user.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      {user.username}
                      {user.role === 'admin' && (
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.2 text-[9px] font-bold text-rose-300 border border-rose-500/30">
                          ADMIN
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={logout}
                    title="Đăng xuất"
                    className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-rose-400 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all"
              >
                <LogIn className="h-4 w-4" />
                Đăng Nhập / Đăng Ký
              </button>
            )}
          </div>
        </div>
      </header>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <TopupModal />
    </>
  );
};
