import React from 'react';
import {
  Sparkles,
  ShoppingCart,
  Globe,
  UserCheck,
  Wand2,
  Layers,
  Clock,
  Stethoscope,
  Coins,
  History,
  Settings,
} from 'lucide-react';

export type TabType =
  | 'templates'
  | 'buy'
  | 'point'
  | 'cloner'
  | 'batch'
  | 'domains'
  | 'tasks'
  | 'health'
  | 'wallet'
  | 'history'
  | 'settings';

interface NavTabsProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  domainCount?: number;
  historyCount?: number;
}

export const NavTabs: React.FC<NavTabsProps> = ({
  activeTab,
  setActiveTab,
  domainCount,
  historyCount,
}) => {
  const tabs: { id: TabType; label: string; icon: any; badge?: string | number; badgeColor?: string }[] = [
    { id: 'templates', label: 'Mẫu Landing Page', icon: Sparkles },
    { id: 'buy', label: 'Mua Tên Miền', icon: ShoppingCart },
    { id: 'point', label: 'Trỏ Miền Có Sẵn', icon: Globe },
    { id: 'cloner', label: 'VIP Web Cloner', icon: UserCheck, badge: 'Pro', badgeColor: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' },
    { id: 'batch', label: 'Chạy Hàng Loạt', icon: Wand2 },
    { id: 'domains', label: 'Quản Lý Domain', icon: Layers, badge: domainCount },
    { id: 'tasks', label: 'Tiến Trình Ngầm', icon: Clock },
    { id: 'health', label: 'Kiểm Tra & Tự Sửa', icon: Stethoscope },
    { id: 'wallet', label: 'Ví & Thành Viên', icon: Coins },
    { id: 'history', label: 'Lịch Sử', icon: History, badge: historyCount },
    { id: 'settings', label: 'Cài Đặt & API', icon: Settings },
  ];

  return (
    <div className="overflow-x-auto pb-1 scrollbar-thin">
      <div className="flex items-center gap-1.5 min-w-max border-b border-gray-800/80 pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                isActive
                  ? 'border border-cyan-500/40 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                  : 'border border-transparent text-gray-400 hover:border-gray-800 hover:bg-[#121829] hover:text-gray-200'
              }`}
            >
              <Icon
                className={`h-4 w-4 transition-transform group-hover:scale-110 ${
                  isActive ? 'text-cyan-400' : 'text-gray-400'
                }`}
              />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                    tab.badgeColor || 'bg-gray-800 text-gray-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
