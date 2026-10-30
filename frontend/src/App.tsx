import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import ITSupportApp from '@/it-support/ITSupportApp';
import { ThemePreferenceProvider, useAppTheme } from '@/theme/theme-context';
import { AlertHost } from '@/rn';
import { watchFrame } from '@/rn/platform';
import { AppSplash } from '@/components/app-splash';
import { router, NavigationBridge } from '@/router/router';
import { AppRoutes } from '@/routes';
import { getToken } from '@/services/client-auth.service';
import { setSessionLostHandler } from '@/lib/api';
import { CurrencyProvider } from '@/context/currency-context';
import { PreferencesProvider } from '@/context/preferences-context';
import { LanguageProvider } from '@/context/language-context';
import { PwaInstallProvider } from '@/context/pwa-install-context';
import { AppUpdateProvider } from '@/context/app-update-context';

function Shell() {
  const theme = useAppTheme();
  const frame = useRef<HTMLDivElement>(null);
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
    <>
      <NavigationBridge />
      <div id="phone" ref={frame} style={{ background: theme.background }}>
        <AppRoutes />
        <AlertHost />
        {!splashDone && <AppSplash onComplete={onSplashDone} />}
      </div>
    </>
  );
}

/** The consumer app's own providers + phone frame, unchanged — just pulled out so it can sit
 * as one branch alongside /it-support below, instead of owning the whole BrowserRouter itself. */
function ConsumerApp() {
  return (
    <ThemePreferenceProvider>
      <CurrencyProvider>
        <PreferencesProvider>
          <LanguageProvider>
            <PwaInstallProvider>
              <AppUpdateProvider>
                <Shell />
              </AppUpdateProvider>
            </PwaInstallProvider>
          </LanguageProvider>
        </PreferencesProvider>
      </CurrencyProvider>
    </ThemePreferenceProvider>
  );
}

/**
 * /it-support is matched here, BEFORE the consumer app's own routing/providers/phone-frame ever
 * mount — so the IT Support portal never inherits the phone-sized layout or any Client-auth
 * context, and the consumer app is otherwise 100% unchanged (same providers, same Shell, same
 * #phone frame, same routes.tsx).
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/it-support/*" element={<ITSupportApp />} />
        <Route path="*" element={<ConsumerApp />} />
      </Routes>
    </BrowserRouter>
  );
}
