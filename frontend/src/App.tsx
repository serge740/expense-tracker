import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ThemePreferenceProvider, useAppTheme } from '@/theme/theme-context';
import { AlertHost } from '@/rn';
import { watchFrame } from '@/rn/platform';
import { AppSplash } from '@/components/app-splash';
import { router } from '@/router/router';
import { createRoutes } from '@/routes';
import { createAppRouter } from '@/router/router';
import { getToken } from '@/services/client-auth.service';
import { setSessionLostHandler } from '@/lib/api';
import { CurrencyProvider } from '@/context/currency-context';
import { PreferencesProvider } from '@/context/preferences-context';
import { LanguageProvider } from '@/context/language-context';
import { PwaInstallProvider } from '@/context/pwa-install-context';

function Shell() {
  const theme = useAppTheme();
  const frame = useRef<HTMLDivElement>(null);
  const appRouter = useMemo(() => createAppRouter(createRoutes()), []);
  // Sample-data mode (development only) skips the opening animation so screens can be looked at straight away.
  const [splashDone, setSplashDone] = useState(() => { try { return (import.meta.env.DEV || import.meta.env.VITE_MOCK === '1') && sessionStorage.getItem('mock') === '1'; } catch { return false; } });

  useEffect(() => (frame.current ? watchFrame(frame.current) : undefined), []);

  // The session ended (a refresh failed): go back to sign in.
  useEffect(() => {
    setSessionLostHandler(() => router.replace('/(auth)/login'));
    return () => setSessionLostHandler(null);
  }, []);

  // Like the phone app: when the splash ends, a signed-in user goes straight to the dashboard.
  const onSplashDone = useCallback(() => {
    setSplashDone(true);
    if (getToken() && window.location.pathname === '/') router.replace('/(dashboard)');
  }, []);

  return (
    <div id="phone" ref={frame} style={{ background: theme.background }}>
      <RouterProvider router={appRouter} />
      <AlertHost />
      {!splashDone && <AppSplash onComplete={onSplashDone} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemePreferenceProvider>
      <CurrencyProvider>
        <PreferencesProvider>
          <LanguageProvider>
            <PwaInstallProvider>
              <Shell />
            </PwaInstallProvider>
          </LanguageProvider>
        </PreferencesProvider>
      </CurrencyProvider>
    </ThemePreferenceProvider>
  );
}
