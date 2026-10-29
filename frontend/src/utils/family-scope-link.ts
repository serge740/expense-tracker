// Ported from expo_app/utils/family-scope-link.ts
/**
 * The link between the scope the person is standing in and the network layer. Kept free of any screen or framework code
 * so the phone app and the web app share it unchanged (the web gets it through scripts/port.mjs).
 *
 *  - which requests carry the family header (an allow-list: only the routes that understand it),
 *  - the family currently active (set by the scope provider, read by the request interceptor),
 *  - what happens when the server says "you are not a member of that family",
 *  - what happens when the session is lost.
 */
export const FAMILY_HEADER = 'X-Family-Id';

/** The routes that read the family header. Everything else (auth, family, debts, scheduled, reminders, notifications, receipts) never gets it. */
export const SCOPED_PREFIXES = ['/wallets', '/transactions', '/budget', '/reports', '/home'] as const;

/** The path part of a request address, without the host or the query. */
export function requestPath(url?: string): string {
  if (!url) return '';
  return url.replace(/^https?:\/\/[^/]+/i, '').split('?')[0].split('#')[0];
}

export function isScopedPath(url?: string): boolean {
  const path = requestPath(url);
  return SCOPED_PREFIXES.some(p => path === p || path.startsWith(`${p}/`));
}

let activeFamilyId: string | null = null;
export const getActiveFamilyId = () => activeFamilyId;
export const setActiveFamilyId = (id: string | null) => { activeFamilyId = id; };

/** The header value for this request: the active family on a scoped route, otherwise nothing (that means Personal). */
export function familyHeaderFor(url?: string): string | null {
  return activeFamilyId && isScopedPath(url) ? activeFamilyId : null;
}

type Handler = (familyId: string) => void;
let notAMemberHandler: Handler | null = null;
export const setNotAMemberHandler = (fn: Handler | null) => { notAMemberHandler = fn; };

const sentHeader = (config: any): string | null => {
  const h = config?.headers;
  if (!h) return null;
  const v = typeof h.get === 'function' ? h.get(FAMILY_HEADER) : h[FAMILY_HEADER];
  return typeof v === 'string' && v ? v : null;
};

/**
 * Call with every failed request. When the server answers `403 NOT_A_MEMBER` to a request that carried the family that is
 * active right now, the person lost access: the handler is told once and the family is cleared at once, so late answers
 * from the old scope cannot trigger it a second time. Returns true when it was such an error.
 */
export function handleScopeError(error: any): boolean {
  if (error?.response?.status !== 403 || error?.response?.data?.code !== 'NOT_A_MEMBER') return false;
  const sent = sentHeader(error.config);
  if (sent && sent === activeFamilyId) {
    activeFamilyId = null;
    notAMemberHandler?.(sent);
  }
  return true;
}

type Listener = () => void;
const sessionLostListeners = new Set<Listener>();
/** Be told when the session is lost (the login could not be renewed): the saved scope must go. Returns an unsubscribe. */
export function onSessionLost(fn: Listener): () => void {
  sessionLostListeners.add(fn);
  return () => { sessionLostListeners.delete(fn); };
}
/** Called by the network layer when a token refresh fails, and by logout. */
export function clearScopeOnSessionLoss(): void {
  activeFamilyId = null;
  sessionLostListeners.forEach(fn => { try { fn(); } catch { /* one listener must not stop the others */ } });
}
