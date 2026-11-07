import { initialLanguage, translate } from '@/context/language-context';
import type { StringKey } from '@/i18n/strings';

/** Codes the server sends for its own plain-words sentences; each has `err.<CODE>` in every language. */
const CODES = [
  'TOO_MANY_REQUESTS', 'FILE_TOO_LARGE', 'SERVER_ERROR', 'SERVICE_BUSY', 'ALREADY_EXISTS', 'NOT_FOUND_ANYMORE', 'LINKED',
  'TOO_LONG', 'TRY_AGAIN', 'BAD_INPUT', 'UNREADABLE', 'SESSION_ENDED', 'NOT_AVAILABLE', 'RECEIPT_FAILED',
];

/** Exact English sentences the server sends for common mistakes, so people reading another language still get theirs. */
const KNOWN: Array<[RegExp, StringKey]> = [
  [/^Enter an amount greater than zero\.?$/i, 'srv.amount'],
  [/amount is too large/i, 'srv.amountBig'],
  [/not in the future/i, 'srv.future'],
  [/^Choose a valid date\.?$/i, 'srv.date'],
  [/^Choose a category\.?$/i, 'srv.category'],
  [/spent or money you received/i, 'srv.kind'],
  [/wallet is archived/i, 'srv.archived'],
  [/^Give the wallet a name\.?$/i, 'srv.walletName'],
  [/40 characters/i, 'srv.walletNameLong'],
  [/bank or mobile money/i, 'srv.bank'],
  [/valid currency/i, 'srv.currency'],
  [/valid balance/i, 'srv.balance'],
  [/who the money is with/i, 'srv.person'],
];

type Err = { response?: { status?: number; data?: { message?: unknown; code?: unknown } }; code?: string; message?: string };

const say = (key: StringKey) => translate(initialLanguage(), key);
const textOf = (m: unknown) => (Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : '');

/** True when the request never reached the server (no internet, server asleep, timeout). */
export const isOffline = (e: unknown): boolean => {
  const x = e as Err;
  return !!x && typeof x === 'object' && x.response === undefined && (x.code === 'ERR_NETWORK' || x.code === 'ECONNABORTED' || x.code === 'ETIMEDOUT' || /network error|timeout/i.test(x.message ?? ''));
};

/** The translated sentence for what the server said, or null when its own words are already fine to show. */
export function serverSentence(e: unknown): string | null {
  const r = (e as Err)?.response;
  if (!r) return null;
  const code = typeof r.data?.code === 'string' ? r.data.code : '';
  if (CODES.includes(code)) return say(`err.${code}` as StringKey);
  const status = r.status ?? 0;
  if (status === 429) return say('err.TOO_MANY_REQUESTS');
  if (status === 413) return say('err.FILE_TOO_LARGE');
  if (status >= 500) return say('err.SERVER_ERROR');
  const text = textOf(r.data?.message);
  const hit = KNOWN.find(([re]) => re.test(text));
  return hit ? say(hit[1]) : null;
}

/** Whatever went wrong, as one short sentence a non-technical person understands. */
export function friendlyMessage(e: unknown, fallback?: string): string {
  if (isOffline(e)) return say(/timeout/i.test((e as Err).message ?? '') || (e as Err).code === 'ECONNABORTED' ? 'err.timeout' : 'err.offline');
  const fromServer = serverSentence(e);
  if (fromServer) return fromServer;
  const text = textOf((e as Err)?.response?.data?.message);
  if (text) return text;
  return fallback || say('err.tryAgain');
}

/** Called by the HTTP client on every failure: puts the plain sentence where screens read the server's message. */
export function friendlyize(error: unknown): void {
  const x = error as Err;
  const r = x?.response;
  if (r) {
    const s = serverSentence(error);
    if (s) {
      if (!r.data || typeof r.data !== 'object') r.data = {};
      r.data.message = s;
    }
  }
  try {
    const status = r?.status;
    const kind = isOffline(error) ? 'offline' : status === 429 ? 'busy' : status !== undefined && status >= 500 ? 'server' : null;
    if (kind && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ax-notice', { detail: kind }));
  } catch { /* the banner is a convenience */ }
}

/** A translated sentence in the saved language, for places without access to the language hook (alerts, helpers). */
export const plain = (key: StringKey, vars?: Record<string, string | number>): string => translate(initialLanguage(), key, vars);
