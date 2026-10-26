/** Browser versions of the phone APIs the Expo app uses: size, safe areas, haptics, links, sharing, clipboard. */
import { useEffect, useSyncExternalStore } from 'react';

export const PHONE_MAX_WIDTH = 430;

export const Platform = {
  OS: 'web' as 'web' | 'ios' | 'android',
  /** The app was designed on a phone; on the web the default branch is used, falling back to iOS. */
  select<T>(spec: { web?: T; default?: T; ios?: T; android?: T; native?: T }): T | undefined {
    return spec.web ?? spec.default ?? spec.ios ?? spec.native ?? spec.android;
  },
};

// ── Window size: the app lives in a phone-width frame, so that frame's size is the "window" ──────────
type Size = { width: number; height: number; scale: number; fontScale: number };
let size: Size = read();
const sizeListeners = new Set<() => void>();

function read(): Size {
  if (typeof window === 'undefined') return { width: PHONE_MAX_WIDTH, height: 800, scale: 1, fontScale: 1 };
  const frame = document.getElementById('phone');
  return {
    width: Math.round(frame?.clientWidth || Math.min(window.innerWidth, PHONE_MAX_WIDTH)),
    height: Math.round(frame?.clientHeight || window.innerHeight),
    scale: window.devicePixelRatio || 1,
    fontScale: 1,
  };
}
function refreshSize() {
  const next = read();
  if (next.width === size.width && next.height === size.height) return;
  size = next;
  sizeListeners.forEach(l => l());
}
if (typeof window !== 'undefined') {
  window.addEventListener('resize', refreshSize);
  window.addEventListener('orientationchange', refreshSize);
}
/** Call once the frame element exists. */
export const watchFrame = (el: HTMLElement) => {
  refreshSize();
  const ro = new ResizeObserver(refreshSize);
  ro.observe(el);
  return () => ro.disconnect();
};

export const Dimensions = {
  get: (_: 'window' | 'screen') => size,
  addEventListener: (_: 'change', cb: (v: { window: Size }) => void) => {
    const l = () => cb({ window: size });
    sizeListeners.add(l);
    return { remove: () => sizeListeners.delete(l) };
  },
};
export function useWindowDimensions(): Size {
  return useSyncExternalStore(
    cb => { sizeListeners.add(cb); return () => sizeListeners.delete(cb); },
    () => size,
    () => size,
  );
}

// ── Safe areas ───────────────────────────────────────────────────────────────────────────────────────
type Insets = { top: number; right: number; bottom: number; left: number };
let insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const insetListeners = new Set<() => void>();
function readInsets() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const next = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  if (JSON.stringify(next) !== JSON.stringify(insets)) { insets = next; insetListeners.forEach(l => l()); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => requestAnimationFrame(readInsets));
  window.addEventListener('load', readInsets);
  setTimeout(readInsets, 0);
}
export function useSafeAreaInsets(): Insets {
  return useSyncExternalStore(cb => { insetListeners.add(cb); return () => insetListeners.delete(cb); }, () => insets, () => insets);
}

// ── Haptics ──────────────────────────────────────────────────────────────────────────────────────────
const vibrate = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
export const Haptics = {
  impactAsync: async (_style?: unknown) => vibrate(10),
  notificationAsync: async (_type?: unknown) => vibrate([12, 40, 12]),
  selectionAsync: async () => vibrate(6),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
};

// ── Links, sharing, clipboard ────────────────────────────────────────────────────────────────────────
export const Linking = {
  openURL: async (url: string) => {
    if (/^(tel:|mailto:|sms:)/.test(url)) window.location.href = url;
    else window.open(url, '_blank', 'noopener,noreferrer');
  },
  canOpenURL: async (_url: string) => true,
};

export const Share = {
  share: async (content: { message?: string; url?: string; title?: string }) => {
    const text = [content.message, content.url].filter(Boolean).join('\n');
    if (navigator.share) {
      try { await navigator.share({ title: content.title, text }); return { action: 'sharedAction' as const }; }
      catch { return { action: 'dismissedAction' as const }; }
    }
    await Clipboard.setStringAsync(text);
    return { action: 'sharedAction' as const };
  },
};

export const Clipboard = {
  setStringAsync: async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  },
  getStringAsync: async () => { try { return await navigator.clipboard.readText(); } catch { return ''; } },
};

// ── App state (foreground / background) ──────────────────────────────────────────────────────────────
type AppStateStatus = 'active' | 'background';
export const AppState = {
  get currentState(): AppStateStatus { return document.visibilityState === 'visible' ? 'active' : 'background'; },
  addEventListener(_: 'change', cb: (s: AppStateStatus) => void) {
    const handler = () => cb(AppState.currentState);
    document.addEventListener('visibilitychange', handler);
    return { remove: () => document.removeEventListener('visibilitychange', handler) };
  },
};

// ── Back button: Escape closes the top-most handler, like the phone's back key ──────────────────────
const backHandlers: Array<() => boolean | null | undefined> = [];
export const BackHandler = {
  addEventListener(_: 'hardwareBackPress', cb: () => boolean | null | undefined) {
    backHandlers.push(cb);
    return { remove: () => { const i = backHandlers.indexOf(cb); if (i >= 0) backHandlers.splice(i, 1); } };
  },
  exitApp: () => {},
};
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    for (let i = backHandlers.length - 1; i >= 0; i--) if (backHandlers[i]()) { e.preventDefault(); return; }
  });
}

/** Sets the browser's theme-colour meta, the web counterpart of StatusBar. */
export function useThemeColorMeta(color?: string) {
  useEffect(() => {
    if (!color) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    const previous = meta?.getAttribute('content');
    meta?.setAttribute('content', color);
    return () => { if (previous) meta?.setAttribute('content', previous); };
  }, [color]);
}
