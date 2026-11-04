import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DomainError } from '../lib/errors';
import { createServices, type Services } from '../services';
import { seed } from '../services/seed';

interface Ctx {
  s: Services;
  /** Re-render subscribers after the in-memory store changes. */
  version: number;
  notice: { kind: 'error' | 'success'; text: string } | null;
  clearNotice: () => void;
  /** Runs a mutation; shows the domain error message instead of throwing. Returns undefined on failure. */
  act: <T>(fn: () => T, successText?: string) => T | undefined;
}
const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children, services, withSeed = true }: { children: ReactNode; services?: Services; withSeed?: boolean }) {
  const s = useMemo(() => {
    if (services) return services;
    // Demo clock: a Monday morning so seeded doctors are bookable immediately.
    const created = createServices();
    if (withSeed) seed(created);
    return created;
  }, [services, withSeed]);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<Ctx['notice']>(null);

  const act = useCallback(<T,>(fn: () => T, successText?: string): T | undefined => {
    try {
      const out = fn();
      setNotice(successText ? { kind: 'success', text: successText } : null);
      return out;
    } catch (e) {
      if (e instanceof DomainError) {
        setNotice({ kind: 'error', text: e.message });
        return undefined;
      }
      throw e;
    } finally {
      setVersion((v) => v + 1);
    }
  }, []);

  const value = useMemo(() => ({ s, version, notice, clearNotice: () => setNotice(null), act }), [s, version, notice, act]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside <AppProvider>');
  return c;
}
