import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext.js';
import { WalletProvider } from './context/WalletContext.js';
import { Header } from './components/Header.js';
import { NavTabs } from './components/NavTabs.js';
import type { TabType } from './components/NavTabs.js';

import { TemplatesTab } from './tabs/TemplatesTab.js';
import { BuyDomainTab } from './tabs/BuyDomainTab.js';
import { PointDomainTab } from './tabs/PointDomainTab.js';
import { ClonerTab } from './tabs/ClonerTab.js';
import { BatchTab } from './tabs/BatchTab.js';
import { DomainsTab } from './tabs/DomainsTab.js';
import { TasksTab } from './tabs/TasksTab.js';
import { HealthTab } from './tabs/HealthTab.js';
import { WalletTab } from './tabs/WalletTab.js';
import { HistoryTab } from './tabs/HistoryTab.js';
import { SettingsTab } from './tabs/SettingsTab.js';
import type { LandingTemplate } from './types/index.js';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('templates');
  const [selectedTemplateForBuy, setSelectedTemplateForBuy] = useState<LandingTemplate | null>(null);

  const handleApplyTemplate = (tpl: LandingTemplate) => {
    setSelectedTemplateForBuy(tpl);
    setActiveTab('buy');
  };

  return (
    <div className="min-h-screen bg-[#070913] text-gray-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 space-y-6">
        <NavTabs activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="animate-fade-in">
          {activeTab === 'templates' && <TemplatesTab onApplyTemplate={handleApplyTemplate} />}
          {activeTab === 'buy' && <BuyDomainTab preselectedTemplate={selectedTemplateForBuy} />}
          {activeTab === 'point' && <PointDomainTab />}
          {activeTab === 'cloner' && <ClonerTab />}
          {activeTab === 'batch' && <BatchTab />}
          {activeTab === 'domains' && <DomainsTab />}
          {activeTab === 'tasks' && <TasksTab />}
          {activeTab === 'health' && <HealthTab />}
          {activeTab === 'wallet' && <WalletTab />}
          {activeTab === 'history' && <HistoryTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>

      <footer className="border-t border-gray-800/80 bg-[#0a0d18] py-4 text-center text-xs text-gray-500">
        <p>© 2026 FREZE Hub · All-in-One Automated Domain & Landing Page Management System</p>
      </footer>
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <WalletProvider>
        <AppContent />
      </WalletProvider>
    </AuthProvider>
  );
}

export default App;
