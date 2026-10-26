import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { storage } from '@/lib/storage';
import { CHECK_EVERY_MS, CURRENT_BUILD, RECHECK_AFTER_MS, fetchLatestBuild, isNewBuild, type Build } from '@/lib/app-update';

const AUTO_KEY = 'appUpdateAuto';

interface AppUpdateValue {
  current: Build;
  latest: Build | null;
  status: 'idle' | 'checking' | 'error';
  /** A newer build than the one running has been published. */
  available: boolean;
  lastChecked: number | null;
  autoCheck: boolean;
  setAutoCheck: (on: boolean) => void;
  check: () => Promise<void>;
  /** Loads the new version (reloads the page; the page itself is never cached, so it comes back new). */
  apply: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateValue | null>(null);

/**
 * Checks for a newer version of the app: shortly after it opens, when you come back to it, and every 30 minutes while it
 * is open (unless switched off). The page for managing updates and the "new version" banner both read from here.
 */
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [latest, setLatest] = useState<Build | null>(null);
  const [status, setStatus] = useState<AppUpdateValue['status']>('idle');
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [autoCheck, setAuto] = useState(() => storage.get(AUTO_KEY) !== '0');
  const checking = useRef(false);
  const last = useRef<number | null>(null);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setStatus('checking');
    try {
      setLatest(await fetchLatestBuild());
      setStatus('idle');
    } catch {
      setStatus('error');
    } finally {
      checking.current = false;
      last.current = Date.now();
      setLastChecked(last.current);
    }
  }, []);

  useEffect(() => {
    if (!autoCheck) return;
    const first = setTimeout(() => { void check(); }, 3000);
    const every = setInterval(() => { if (document.visibilityState === 'visible') void check(); }, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (last.current === null || Date.now() - last.current > RECHECK_AFTER_MS)) void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', onVisible); };
  }, [autoCheck, check]);

  const apply = useCallback(async () => {
    // Let the service worker look for its own new version first, then load the new page.
    try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* the page reload below is what matters */ }
    window.location.reload();
  }, []);

  const setAutoCheck = useCallback((on: boolean) => { storage.set(AUTO_KEY, on ? '1' : '0'); setAuto(on); }, []);

  const value = useMemo<AppUpdateValue>(() => ({
    current: CURRENT_BUILD, latest, status, available: !!latest && isNewBuild(CURRENT_BUILD, latest), lastChecked, autoCheck, setAutoCheck, check, apply,
  }), [latest, status, lastChecked, autoCheck, setAutoCheck, check, apply]);

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

export function useAppUpdate(): AppUpdateValue {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) throw new Error('useAppUpdate must be used inside an AppUpdateProvider');
  return ctx;
}
