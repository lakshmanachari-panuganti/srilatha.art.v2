'use client';
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useGoogleClientId } from '@/components/runtime/RuntimeConfigProvider';
import { authRefresh, authLogout } from '@/lib/api';

const TOKEN_KEY = 'google_auth_token';

// Refresh the session when the token has less than this much life left.
// 24h TTL minus 4h gives us ample headroom for active users; idle users
// will be refreshed lazily on next mount via the grace window.
const REFRESH_HEADROOM_MS = 4 * 60 * 60 * 1000;

/**
 * Whether Google sign-in is usable in the current session. The Google OAuth
 * client ID is delivered at runtime from `/api/config/public` (Azure Function
 * App > Configuration > GOOGLE_CLIENT_ID) — not baked into the static build.
 */
export function useIsGoogleAuthConfigured(): boolean {
  return Boolean(useGoogleClientId());
}

export interface User {
  email: string;
  name: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  login: (credential: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule a silent refresh well before the current token expires. The
  // backend's /api/auth/refresh accepts a recently-expired token within
  // ~7 days too, so an offline user re-mounting after a long gap also
  // recovers cleanly via tryRefresh below.
  const scheduleRefresh = (token: string) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    try {
      const decoded = jwtDecode<{ exp?: number }>(token);
      if (!decoded?.exp) return;
      const expMs = decoded.exp * 1000;
      const delay = Math.max(60_000, expMs - Date.now() - REFRESH_HEADROOM_MS);
      refreshTimerRef.current = setTimeout(() => { void tryRefresh(); }, delay);
    } catch {
      // ignore — token will be cleared lazily if invalid
    }
  };

  const tryRefresh = async () => {
    const current = localStorage.getItem(TOKEN_KEY);
    if (!current) return;
    try {
      const res = await authRefresh(current);
      localStorage.setItem(TOKEN_KEY, res.token);
      setUser({ email: res.user.email, name: res.user.name, picture: res.user.picture });
      scheduleRefresh(res.token);
    } catch {
      // Refresh denied — server has revoked or the grace window elapsed.
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const decoded = jwtDecode<{ email?: string; name?: string; picture?: string; exp?: number }>(token);
      const nowMs = Date.now();
      const expMs = (decoded.exp ?? 0) * 1000;

      if (expMs > nowMs) {
        // Still live — restore state and schedule the next refresh.
        if (decoded.email) {
          setUser({ email: decoded.email, name: decoded.name ?? '', picture: decoded.picture });
        }
        scheduleRefresh(token);
      } else {
        // Expired in localStorage but maybe within the server's grace window.
        // Try a refresh; falls back to logout if rejected.
        void tryRefresh();
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY);
    }
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (credential: string) => {
    try {
      const decoded = jwtDecode<{ email?: string; name?: string; picture?: string }>(credential);
      if (decoded.email) {
        setUser({ email: decoded.email, name: decoded.name ?? '', picture: decoded.picture });
      }
      localStorage.setItem(TOKEN_KEY, credential);
      scheduleRefresh(credential);
    } catch (err) {
      console.error('Failed to decode token', err);
    }
  };

  const logout = () => {
    const current = localStorage.getItem(TOKEN_KEY);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    // Best-effort server-side revoke; intentionally not awaited so UX is
    // immediate even when the network is slow or offline.
    if (current) {
      void authLogout(current);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
