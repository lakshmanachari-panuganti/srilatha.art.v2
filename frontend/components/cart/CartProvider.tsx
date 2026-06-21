'use client';
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { Product, formatPrice } from '@/lib/data';
import { useAuth } from '@/components/auth/AuthProvider';

// Cart is persisted per-user in localStorage under a namespaced key so the
// cart survives sign-out and is restored on the next sign-in (per the
// product requirement). Anonymous browsing has no cart — `requireAuth`
// gates the only mutating entry points.
const keyFor = (email: string) => `srilatha_cart::${email.toLowerCase()}`;

// ─── Types ─────────────────────────────────────────────────────────────────
export interface CartItem {
  product: Product;
  qty: number;
  variant?: string;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
}

type CartAction =
  | { type: 'ADD_ITEM'; product: Product; qty?: number; variant?: string }
  | { type: 'REMOVE_ITEM'; productId: string; variant?: string }
  | { type: 'UPDATE_QTY'; productId: string; qty: number; variant?: string }
  | { type: 'CLEAR_CART' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' }
  | { type: 'HYDRATE'; items: CartItem[] };

interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  itemCount: number;
  subtotal: number;
  formattedSubtotal: string;
  addItem: (product: Product, qty?: number, variant?: string) => void;
  removeItem: (productId: string, variant?: string) => void;
  updateQty: (productId: string, qty: number, variant?: string) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

// ─── Context ───────────────────────────────────────────────────────────────
const CartContext = createContext<CartContextValue | null>(null);

// ─── Reducer ───────────────────────────────────────────────────────────────
function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, items: action.items };

    case 'ADD_ITEM': {
      const key = `${action.product.id}::${action.variant ?? ''}`;
      const existing = state.items.find(
        i => `${i.product.id}::${i.variant ?? ''}` === key
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            `${i.product.id}::${i.variant ?? ''}` === key
              ? { ...i, qty: i.qty + (action.qty ?? 1) }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { product: action.product, qty: action.qty ?? 1, variant: action.variant }],
      };
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(
          i => !(i.product.id === action.productId && (i.variant ?? '') === (action.variant ?? ''))
        ),
      };

    case 'UPDATE_QTY':
      if (action.qty <= 0) {
        return {
          ...state,
          items: state.items.filter(
            i => !(i.product.id === action.productId && (i.variant ?? '') === (action.variant ?? ''))
          ),
        };
      }
      return {
        ...state,
        items: state.items.map(i =>
          i.product.id === action.productId && (i.variant ?? '') === (action.variant ?? '')
            ? { ...i, qty: action.qty }
            : i
        ),
      };

    case 'CLEAR_CART':
      return { ...state, items: [] };

    case 'OPEN_CART':
      return { ...state, isOpen: true };

    case 'CLOSE_CART':
      return { ...state, isOpen: false };

    default:
      return state;
  }
}

// ─── Provider ──────────────────────────────────────────────────────────────
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isOpen: false });
  const { user } = useAuth();

  // Hydrate from the active user's namespaced key whenever the signed-in
  // user changes. On sign-out (`user` -> null) the in-memory cart is wiped
  // and the drawer is closed; the previous user's items remain in
  // localStorage so they're restored the next time that user signs in.
  useEffect(() => {
    if (!user) {
      dispatch({ type: 'HYDRATE', items: [] });
      dispatch({ type: 'CLOSE_CART' });
      return;
    }
    try {
      const saved = localStorage.getItem(keyFor(user.email));
      const items = saved ? (JSON.parse(saved) as CartItem[]) : [];
      dispatch({ type: 'HYDRATE', items: Array.isArray(items) ? items : [] });
    } catch {
      dispatch({ type: 'HYDRATE', items: [] });
    }
  }, [user]);

  // Persist changes — but only while a user is signed in. Skipping the
  // write when logged out prevents the post-logout `HYDRATE [] ` above
  // from clobbering the just-restored per-user snapshot.
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(keyFor(user.email), JSON.stringify(state.items));
    } catch { /* ignore */ }
  }, [state.items, user]);

  // Lock body scroll when cart open
  useEffect(() => {
    document.body.style.overflow = state.isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [state.isOpen]);

  const itemCount = state.items.reduce((s, i) => s + i.qty, 0);
  const subtotal  = state.items.reduce((s, i) => s + i.product.price * i.qty, 0);

  const value: CartContextValue = {
    items: state.items,
    isOpen: state.isOpen,
    itemCount,
    subtotal,
    formattedSubtotal: formatPrice(subtotal),
    addItem:    (product, qty, variant) => dispatch({ type: 'ADD_ITEM', product, qty, variant }),
    removeItem: (productId, variant)    => dispatch({ type: 'REMOVE_ITEM', productId, variant }),
    updateQty:  (productId, qty, variant) => dispatch({ type: 'UPDATE_QTY', productId, qty, variant }),
    clearCart:  () => dispatch({ type: 'CLEAR_CART' }),
    openCart:   () => dispatch({ type: 'OPEN_CART' }),
    closeCart:  () => dispatch({ type: 'CLOSE_CART' }),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// ─── Hook ──────────────────────────────────────────────────────────────────
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
