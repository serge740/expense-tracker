/**
 * The search box understands a few words as filters: "wallet:momo", "cat:food", "type:income", "receipt:no", ">5000", "<200",
 * and "-cat:rent" to leave a category out. A word counts once it is finished (a space after it, or Enter); whatever is not
 * a filter stays as plain text. All pure, so it is tested.
 */
import type { FeedKind, HistoryFilter } from '@/utils/history';

export interface SearchContext {
  wallets: Array<{ id: string; name: string }>;
  /** Category slugs with their names in the person's language. */
  categories: Array<{ slug: string; name: string }>;
}

export interface SearchResult {
  filter: HistoryFilter;
  /** What is left to search as plain text. */
  rest: string;
  /** The words that became filters, as typed (for a hint). */
  applied: string[];
}

const KINDS: Record<string, FeedKind> = { income: 'income', expense: 'expense', transfer: 'transfer', debt: 'debt', credit: 'credit', scheduled: 'scheduled' };

/** Splits on spaces, keeping "quoted words" together. */
export function words(text: string): string[] {
  const out: string[] = [];
  const re = /(?:[^\s"]+|"[^"]*")+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[0]);
  return out;
}

const unquote = (v: string) => v.replace(/"/g, '').trim();

/** The best match by name: exact, then starts with, then contains. */
function best<T>(items: T[], name: (x: T) => string, want: string): T | null {
  const w = want.toLowerCase();
  return items.find(x => name(x).toLowerCase() === w) ?? items.find(x => name(x).toLowerCase().startsWith(w)) ?? items.find(x => name(x).toLowerCase().includes(w)) ?? null;
}

/** Turns finished words into filters. `final` also reads the last word (Enter pressed), otherwise it waits for a space. */
export function applySearchTokens(text: string, filter: HistoryFilter, ctx: SearchContext, final = false): SearchResult {
  const all = words(text);
  const endsOpen = !final && text.length > 0 && !/\s$/.test(text);
  const done = endsOpen ? all.slice(0, -1) : all;
  const open = endsOpen ? all.slice(-1) : [];
  let f = filter;
  const keep: string[] = [];
  const applied: string[] = [];

  for (const raw of done) {
    let used = false;
    const amount = /^(>=|<=|>|<)(\d+(?:[.,]\d+)?)$/.exec(raw);
    const kv = /^(-?)([a-z]+):(.+)$/i.exec(raw);
    if (amount) {
      const n = Number(amount[2].replace(',', '.'));
      f = amount[1].startsWith('>') ? { ...f, minAmount: n } : { ...f, maxAmount: n };
      used = true;
    } else if (kv) {
      const [, neg, key, value] = kv;
      const v = unquote(value);
      const k = key.toLowerCase();
      if ((k === 'wallet' || k === 'w') && !neg) {
        const w = best(ctx.wallets, x => x.name, v);
        if (w) { f = { ...f, walletIds: f.walletIds.includes(w.id) ? f.walletIds : [...f.walletIds, w.id] }; used = true; }
      } else if (k === 'cat' || k === 'category') {
        const c = best(ctx.categories, x => x.name, v) ?? best(ctx.categories, x => x.slug, v);
        if (c) {
          const p = { c: c.slug };
          f = neg ? { ...f, exclude: [...f.exclude.filter(x => x.c !== c.slug), p], include: f.include.filter(x => x.c !== c.slug) } : { ...f, include: [...f.include.filter(x => x.c !== c.slug), p], exclude: f.exclude.filter(x => x.c !== c.slug) };
          used = true;
        }
      } else if (k === 'type' && !neg && KINDS[v.toLowerCase()]) {
        const kind = KINDS[v.toLowerCase()];
        f = { ...f, kinds: f.kinds.includes(kind) ? f.kinds : [...f.kinds, kind] };
        used = true;
      } else if (k === 'receipt' && !neg) {
        const yes = ['yes', 'with', 'y'].includes(v.toLowerCase()), no = ['no', 'without', 'n'].includes(v.toLowerCase());
        if (yes || no) { f = { ...f, receipt: yes ? 'with' : 'without' }; used = true; }
      }
    }
    if (used) applied.push(raw); else keep.push(raw);
  }
  return { filter: f, rest: [...keep, ...open].join(' ').trim(), applied };
}

/** Wallets and categories whose name matches what is being typed, for the suggestions under the box. */
export function suggest(text: string, ctx: SearchContext, limit = 4): { wallets: SearchContext['wallets']; categories: SearchContext['categories'] } {
  const q = text.trim().toLowerCase();
  if (q.length < 1 || /^[<>]/.test(q) || q.includes(':')) return { wallets: [], categories: [] };
  const hit = (name: string) => name.toLowerCase().split(/[\s›-]+/).some(w => w.startsWith(q)) || name.toLowerCase().startsWith(q);
  return { wallets: ctx.wallets.filter(w => hit(w.name)).slice(0, limit), categories: ctx.categories.filter(c => hit(c.name)).slice(0, limit) };
}

/** Recent searches, newest first, no repeats, at most `max`. */
export function rememberSearch(list: string[], text: string, max = 6): string[] {
  const t = text.trim();
  if (t.length < 2) return list;
  return [t, ...list.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, max);
}
