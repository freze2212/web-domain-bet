import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api.js';
import type { User } from '../types/index.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<any>;
  register: (username: string, password: string, fullName?: string) => Promise<any>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(raw: any): User | null {
  if (!raw) return null;
  const id = raw.id || raw.userId;
  if (!id) return null;
  return {
    ...raw,
    id,
    userId: raw.userId || id,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('freze_auth_token'));
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const currentToken = localStorage.getItem('freze_auth_token');
    if (!currentToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/auth/me');
      if (res.data.success && res.data.user) {
        setUser(normalizeUser(res.data.user));
      } else {
        setUser(null);
        localStorage.removeItem('freze_auth_token');
        setToken(null);
      }
    } catch {
      setUser(null);
      localStorage.removeItem('freze_auth_token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshMe();
  }, [token]);

  const login = async (username: string, password: string) => {
    const res = await api.post('/auth/login', { username, password });
    if (res.data.success && res.data.token) {
      localStorage.setItem('freze_auth_token', res.data.token);
      setToken(res.data.token);
      setUser(normalizeUser(res.data.user));
      return res.data;
    }
    throw new Error(res.data.error || 'Đăng nhập thất bại');
  };

  const register = async (username: string, password: string, fullName?: string) => {
    const res = await api.post('/auth/register', { username, password, fullName });
    if (res.data.success && res.data.token) {
      localStorage.setItem('freze_auth_token', res.data.token);
      setToken(res.data.token);
      setUser(normalizeUser(res.data.user));
      return res.data;
    }
    throw new Error(res.data.error || 'Đăng ký thất bại');
  };

  const logout = () => {
    localStorage.removeItem('freze_auth_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
