'use client';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: string; type: ToastType; message: string; }

type Listener = (toast: Toast) => void;
const listeners = new Set<Listener>();

function emit(toast: Toast) { listeners.forEach(l => l(toast)); }

export const toast = {
  success: (message: string) => emit({ id: Date.now().toString(), type: 'success', message }),
  error:   (message: string) => emit({ id: Date.now().toString(), type: 'error',   message }),
  info:    (message: string) => emit({ id: Date.now().toString(), type: 'info',     message }),
};

const ICONS: Record<ToastType, string> = { success: '✓', error: '✕', info: 'ℹ' };

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const listener = (toast: Toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => dismiss(toast.id), 3000);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [dismiss]);

  if (!mounted) return null;

  return createPortal(
    <div className="toast-container" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type} toast--enter`} role={t.type === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon">{ICONS[t.type]}</span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>,
    document.body
  );
}

export function useToast() {
  return { toast };
}
