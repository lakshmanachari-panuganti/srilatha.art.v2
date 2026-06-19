'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { getPublicConfig, type PublicConfig } from '@/lib/api';

interface RuntimeConfigContextValue {
  config: PublicConfig | null;
  loading: boolean;
}

const RuntimeConfigContext = createContext<RuntimeConfigContextValue>({
  config: null,
  loading: true,
});

export function RuntimeConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPublicConfig()
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setConfig({ googleClientId: '' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RuntimeConfigContext.Provider value={{ config, loading }}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

export function useRuntimeConfig(): RuntimeConfigContextValue {
  return useContext(RuntimeConfigContext);
}

export function useGoogleClientId(): string {
  return useContext(RuntimeConfigContext).config?.googleClientId ?? '';
}
