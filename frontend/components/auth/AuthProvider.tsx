'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useGoogleClientId } from '@/components/runtime/RuntimeConfigProvider';

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

  useEffect(() => {
    // Check local storage on mount
    const token = localStorage.getItem('google_auth_token');
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        // Ensure token is not expired
        if (decoded.exp * 1000 > Date.now()) {
          setUser({ email: decoded.email, name: decoded.name, picture: decoded.picture });
        } else {
          localStorage.removeItem('google_auth_token');
        }
      } catch (err) {
        localStorage.removeItem('google_auth_token');
      }
    }
  }, []);

  const login = (credential: string) => {
    try {
      const decoded: any = jwtDecode(credential);
      setUser({ email: decoded.email, name: decoded.name, picture: decoded.picture });
      localStorage.setItem('google_auth_token', credential);
    } catch (err) {
      console.error('Failed to decode token', err);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('google_auth_token');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
