import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaInstallValue {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: () => boolean;
  install: () => Promise<'accepted' | 'dismissed' | null>;
}

const PwaInstallContext = createContext<PwaInstallValue | null>(null);

const isStandaloneNow = () =>
  window.matchMedia('(display-mode: standalone)').matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;

/**
 * Catches the browser's "this site can be installed" event (it fires once, in Chromium browsers that judge the
 * site installable) so it can be replayed from the install prompt or the Settings page. The event cannot be
 * stored as state, so it lives in a ref.
 */
export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const deferred = useRef<InstallEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(isStandaloneNow);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => { e.preventDefault(); deferred.current = e as InstallEvent; setCanInstall(true); };
    const onInstalled = () => { deferred.current = null; setCanInstall(false); setIsInstalled(true); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onBeforeInstall); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  const install = async () => {
    const event = deferred.current;
    if (!event) return null;
    deferred.current = null;
    setCanInstall(false);
    await event.prompt();
    return (await event.userChoice).outcome;
  };

  const value: PwaInstallValue = { canInstall, isInstalled, isIos: () => /iPhone|iPad/.test(navigator.userAgent), install };
  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall(): PwaInstallValue {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) throw new Error('usePwaInstall must be used inside a PwaInstallProvider');
  return ctx;
}
