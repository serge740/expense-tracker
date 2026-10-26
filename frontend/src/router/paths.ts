/**
 * The Expo app navigates with paths like "/(dashboard)/(settings)/notifications" where "(group)" folders
 * are invisible in the URL. On the web the dashboard needs its own prefix (its home would otherwise collide
 * with the welcome page), so every Expo path is translated here and the ported screens keep their router calls.
 *
 *   /(auth)/login                       → /login
 *   /(dashboard)                        → /app
 *   /(dashboard)/(settings)/devices     → /app/devices
 */
export type Href = string | { pathname: string; params?: Record<string, string | number | boolean | undefined | null> };

const isGroup = (seg: string) => /^\(.+\)$/.test(seg);

export function toWebPath(href: Href): string {
  const raw = typeof href === 'string' ? href : href.pathname;
  const [pathAndQuery, hash] = raw.split('#');
  const [path, query] = pathAndQuery.split('?');
  const segments = path.split('/').filter(Boolean);
  const dashboard = segments.includes('(dashboard)');
  const clean = segments.filter(seg => !isGroup(seg));
  let out = '/' + [...(dashboard ? ['app'] : []), ...clean].join('/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);

  const search = new URLSearchParams(query ?? '');
  if (typeof href !== 'string' && href.params) {
    for (const [k, v] of Object.entries(href.params)) if (v !== undefined && v !== null) search.set(k, String(v));
  }
  const qs = search.toString();
  return out + (qs ? `?${qs}` : '') + (hash ? `#${hash}` : '');
}

/** The reverse, used to know which Expo-style path a URL belongs to (for tab highlighting). */
export function stripAppPrefix(pathname: string): string {
  if (pathname === '/app') return '/';
  return pathname.startsWith('/app/') ? pathname.slice(4) : pathname;
}
