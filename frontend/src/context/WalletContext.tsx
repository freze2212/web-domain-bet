import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api.js';
import { useAuth } from './AuthContext.js';

interface WalletContextType {
  balance: number;
  loading: boolean;
  refreshBalance: () => Promise<void>;
  isTopupOpen: boolean;
  openTopup: () => void;
  closeTopup: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [isTopupOpen, setIsTopupOpen] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!user) {
      setBalance(0);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/wallet/balance');
      if (res.data.success && typeof res.data.balance === 'number') {
        setBalance(res.data.balance);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  return (
    <WalletContext.Provider
      value={{
        balance,
        loading,
        refreshBalance,
        isTopupOpen,
        openTopup: () => setIsTopupOpen(true),
        closeTopup: () => setIsTopupOpen(false),
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
