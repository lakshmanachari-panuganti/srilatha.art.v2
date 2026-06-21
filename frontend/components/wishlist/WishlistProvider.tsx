'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

// Wishlist is persisted per-user in localStorage under a namespaced key so a
// customer's wishlist survives sign-out and is restored on the next sign-in,
// while a different customer signing in on the same browser sees their own
// (empty or otherwise) wishlist — not the previous user's items.
const keyFor = (email: string) => `srilatha_wishlist::${email.toLowerCase()}`;

interface WishlistContextValue {
  ids: string[];
  count: number;
  isWishlisted: (productId: string) => boolean;
  toggle: (productId: string) => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<string[]>([]);

  // Hydrate (or clear) whenever the signed-in user changes. On sign-out,
  // `user` becomes null and the in-memory list resets to []; the per-user
  // entry in localStorage is left intact so it can be restored next time
  // that user signs in.
  useEffect(() => {
    if (!user) { setIds([]); return; }
    try {
      const raw = localStorage.getItem(keyFor(user.email));
      const parsed = raw ? JSON.parse(raw) : [];
      setIds(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      setIds([]);
    }
  }, [user]);

  // Persist changes to the active user's namespaced key. No writes happen
  // when logged out — `requireAuth` gates the only mutating entry point.
  useEffect(() => {
    if (!user) return;
    try { localStorage.setItem(keyFor(user.email), JSON.stringify(ids)); } catch { /* ignore */ }
  }, [ids, user]);

  const isWishlisted = useCallback((productId: string) => ids.includes(productId), [ids]);

  const toggle = useCallback((productId: string) => {
    setIds(prev => prev.includes(productId) ? prev.filter(x => x !== productId) : [...prev, productId]);
  }, []);

  return (
    <WishlistContext.Provider value={{ ids, count: ids.length, isWishlisted, toggle }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within <WishlistProvider>');
  return ctx;
}
