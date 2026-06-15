'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { adminApi, clearAdminToken, setAdminToken, AdminApiError } from '@/lib/adminApi';

interface AdminUser { email: string; name: string; role: 'admin' | 'super_admin' }

interface AdminAuthValue {
  admin: AdminUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const TOKEN_KEY = 'srilatha_admin_token';
const USER_KEY = 'srilatha_admin_user';

const Ctx = createContext<AdminAuthValue>({
  admin: null, ready: false, login: async () => {}, logout: () => {},
});

interface JwtPayload { sub: string; name?: string; role?: string; exp: number }

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const part = token.split('.')[1];
    const padded = part + '==='.slice(0, (4 - (part.length % 4)) % 4);
    const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JwtPayload;
  } catch { return null; }
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const stored = localStorage.getItem(USER_KEY);
      if (token && stored) {
        const payload = decodeJwtPayload(token);
        if (payload && payload.exp * 1000 > Date.now()) {
          setAdmin(JSON.parse(stored));
        } else {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        }
      }
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await adminApi.login(email, password);
      setAdminToken(res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.admin));
      setAdmin(res.admin);
    } catch (err) {
      if (err instanceof AdminApiError) throw err;
      throw new AdminApiError('Login failed', 0, err);
    }
  };

  const logout = () => {
    clearAdminToken();
    localStorage.removeItem(USER_KEY);
    setAdmin(null);
  };

  return <Ctx.Provider value={{ admin, ready, login, logout }}>{children}</Ctx.Provider>;
}

export const useAdminAuth = () => useContext(Ctx);
