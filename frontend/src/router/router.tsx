/**
 * Navigation for the ported screens, built on react-router-dom's own hooks. The router itself is the standard
 * <BrowserRouter> (see App.tsx); nothing here creates one. Screens that call `router.push('/(dashboard)/wallets')`
 * (as they did on the phone) use the very same `navigate` function that react-router gives to components.
 */
import { Navigate, useLocation, useNavigate, useParams, type NavigateFunction } from 'react-router-dom';
import { useEffect, useMemo, type ReactElement } from 'react';
import { toWebPath, type Href } from './paths';

let navigateFn: NavigateFunction | null = null;

/** Mount once, inside <BrowserRouter>: hands react-router's `navigate` to the `router` object below. */
export function NavigationBridge(): null {
  navigateFn = useNavigate();
  return null;
}

/** Before the router has mounted (it should not happen), fall back to a normal page load. */
const go = (to: string, replace: boolean) => {
  if (navigateFn) navigateFn(to, { replace });
  else if (replace) window.location.replace(to);
  else window.location.assign(to);
};

export const router = {
  push: (href: Href) => go(toWebPath(href), false),
  navigate: (href: Href) => go(toWebPath(href), false),
  replace: (href: Href) => go(toWebPath(href), true),
  back: () => { if (navigateFn) navigateFn(-1); else window.history.back(); },
  canGoBack: () => (window.history.state?.idx ?? 0) > 0,
  dismiss: () => { if (navigateFn) navigateFn(-1); else window.history.back(); },
};

export const useRouter = () => router;

/** Route params and query string together, like expo-router's. */
export function useLocalSearchParams<T extends Record<string, string> = Record<string, string>>(): T {
  const params = useParams();
  const { search } = useLocation();
  return useMemo(() => {
    const out: Record<string, string> = {};
    new URLSearchParams(search).forEach((v, k) => { out[k] = v; });
    for (const [k, v] of Object.entries(params)) if (v !== undefined) out[k] = v;
    return out as T;
  }, [params, search]);
}

export const usePathname = () => useLocation().pathname;

/**
 * Runs when the screen comes into view. Screens are unmounted when you leave them on the web,
 * so "focus" is mounting; the cleanup runs when you leave.
 */
export function useFocusEffect(effect: () => void | (() => void)) {
  useEffect(effect, [effect]);
}

export function Redirect({ href }: { href: Href }): ReactElement {
  return <Navigate to={toWebPath(href)} replace />;
}
