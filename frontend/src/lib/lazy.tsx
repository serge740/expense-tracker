import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { ActivityIndicator, View } from '@/rn';
import { useAppTheme } from '@/theme/theme-context';

/**
 * Screens are loaded the first time they are opened, not all at start-up, so the app opens faster. Each screen is its own
 * file in the build (a "chunk"); this loads it, and remembers how to load it early (preload) for the screens people
 * open most.
 */
type Loader<T extends ComponentType<any>> = () => Promise<{ default: T }>;
export type LazyScreen<T extends ComponentType<any>> = LazyExoticComponent<T> & { preload: () => void };

const RELOADED = 'abyex:chunk-reload';

/** A new version of the app replaces the numbered files, so a chunk the old page asks for can be gone: reload once to get the new page. */
function load<T extends ComponentType<any>>(factory: Loader<T>): Promise<{ default: T }> {
  return factory().then(
    m => { try { sessionStorage.removeItem(RELOADED); } catch { /* private window */ } return m; },
    err => {
      let again = false;
      try { again = sessionStorage.getItem(RELOADED) === '1'; sessionStorage.setItem(RELOADED, '1'); } catch { /* private window */ }
      if (!again && typeof window !== 'undefined') { window.location.reload(); return new Promise<never>(() => undefined); }
      throw err;
    },
  );
}

export function lazyScreen<T extends ComponentType<any>>(factory: Loader<T>): LazyScreen<T> {
  let started: Promise<{ default: T }> | null = null;
  const once = () => (started ??= load(factory));
  const Component = lazy(once) as LazyScreen<T>;
  Component.preload = () => { void once().catch(() => undefined); };
  return Component;
}

/** What is shown while a screen's file is on its way: the background and a small spinner (the tab bar stays where it is). */
export function ScreenFallback() {
  const theme = useAppTheme();
  return (
    <View testID="screen-loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

/** Loads the given screens in the background once the browser is idle, so the first tap on them is instant. */
export function preloadWhenIdle(screens: Array<{ preload: () => void }>) {
  const run = () => screens.forEach(s => s.preload());
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
