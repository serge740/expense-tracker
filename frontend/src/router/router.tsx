/**
 * An expo-router look-alike on top of react-router: the same `router.push('/(dashboard)/wallets')` calls,
 * `useLocalSearchParams`, `useFocusEffect` and `Redirect`, so ported screens need no changes to navigate.
 */
import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useMemo, type ReactElement } from 'react';
import { toWebPath, type Href } from './paths';

type RouteObjects = Parameters<typeof createBrowserRouter>[0];

let instance: ReturnType<typeof createBrowserRouter> | null = null;

export function createAppRouter(routes: RouteObjects) {
  instance = createBrowserRouter(routes);
  return instance;
}

const nav = () => {
  if (!instance) throw new Error('The router has not been created yet');
  return instance;
};

export const router = {
  push: (href: Href) => { void nav().navigate(toWebPath(href)); },
  navigate: (href: Href) => { void nav().navigate(toWebPath(href)); },
  replace: (href: Href) => { void nav().navigate(toWebPath(href), { replace: true }); },
  back: () => { void nav().navigate(-1); },
  canGoBack: () => (window.history.state?.idx ?? 0) > 0,
  dismiss: () => { void nav().navigate(-1); },
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
