import { cleanTags } from './annotations';
/**
 * The History feed and its summary, as pure functions (no database), so the rules are easy to test.
 * The service does the queries; this file decides what a filter means, where the next page starts,
 * what the previous period is, and how rows add up per currency.
 */
import { parsePeriod, type Period } from '../../common/utils/period';
import { parseIncludeLoans } from '../../common/utils/loan-filter';
import { FEED_VIEWS } from '../../common/utils/feed-view';
import { LEGACY_CATEGORY, canonicalCategory } from '../../common/utils/categories';
import { CategorySlug } from '../../../generated/prisma';

export const FEED_PAGE_DEFAULT = 40;
export const FEED_PAGE_MAX = 100;
export const SERIES_POINTS = 12;
export const MAX_PICKS = 60;

export type FeedKind = (typeof FEED_VIEWS)[number] | 'transfer';
const KINDS: readonly string[] = [...FEED_VIEWS, 'transfer'];
export type Receipt = 'any' | 'with' | 'without';
export type Source = 'any' | 'schedule' | 'hand' | 'debt' | 'transfer';
export type Sort = 'newest' | 'oldest' | 'largest' | 'smallest';
/** Only the rows a schedule posted by itself, or the ones the person confirmed. */
export type SchedMode = 'any' | 'auto' | 'confirm';
export type Flag = 'duplicates' | 'uncategorised';
/** The groupings the server has to order for (day, week and month are the person's own calendar, done on the page). */
export type GroupBy = 'none' | 'category' | 'wallet' | 'member' | 'title';

/** One choice in the category filter: a whole category, one sub-category of it, or "that category, no sub-category". */
export interface Pick { c: string; s?: string; none?: boolean }

/** What the person asked to see. One shape for the list, the totals and the counts in the filter sheet. */
export interface FeedFilter {
  period: Period | null;
  /** Empty means every kind; several mean "any of these". */
  kinds: FeedKind[];
  includeLoans: boolean;
  walletIds: string[];
  /** Family only: show just what this member added. */
  memberId: string | null;
  search: string | null;
  include: Pick[];
  exclude: Pick[];
  minAmount: number | null;
  maxAmount: number | null;
  receipt: Receipt;
  source: Source;
  /** Posted by these schedules (empty: any). */
  schedules: string[];
  schedMode: SchedMode;
  flags: Flag[];
  /** Rows carrying any of these tags (empty: any). */
  tags: string[];
  groupBy: GroupBy;
  sort: Sort;
  limit: number;
  cursor: string | null;
  /** The currency of rows that have no wallet (the person's own display currency). */
  fallbackCurrency: string;
  /** Also give one converted figure in this currency. */
  convertTo: string | null;
}

export interface FeedQuery {
  month?: unknown; year?: unknown; from?: unknown; to?: unknown; all?: unknown;
  view?: unknown; kinds?: unknown; includeLoans?: unknown; walletIds?: unknown; memberId?: unknown; search?: unknown;
  categories?: unknown; excludeCategories?: unknown; minAmount?: unknown; maxAmount?: unknown; receipt?: unknown; source?: unknown; schedules?: unknown; schedMode?: unknown; flags?: unknown; tags?: unknown; groupBy?: unknown; sort?: unknown;
  limit?: unknown; cursor?: unknown; fallbackCurrency?: unknown; convertTo?: unknown;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const currencyOf = (v: unknown): string | null => { const s = str(v)?.toUpperCase(); return s && /^[A-Z]{3}$/.test(s) ? s : null; };
const amountOf = (v: unknown): number | null => { const n = typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n >= 0 && n < 1e13 ? n : null; };
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** A list of picks sent as JSON: anything that is not a clean pick is dropped (never an error). */
export function parsePicks(raw: unknown): Pick[] {
  const text = str(raw);
  if (!text || text.length > 6000) return [];
  let list: unknown;
  try { list = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const out: Pick[] = [];
  const valid = new Set<string>(Object.values(CategorySlug));
  for (const p of list.slice(0, MAX_PICKS)) {
    if (!p || typeof p !== 'object') continue;
    const c = (p as Pick).c;
    if (typeof c !== 'string' || !valid.has(c)) continue;
    const s = typeof (p as Pick).s === 'string' ? (p as Pick).s!.trim().slice(0, 40) : '';
    out.push(s ? { c, s } : (p as Pick).none === true ? { c, none: true } : { c });
  }
  return out;
}

/** Anything unknown or malformed is ignored, so an old or tampered link can never break the list. */
export function parseFeedFilter(q: FeedQuery, now = new Date()): FeedFilter {
  const limit = Math.floor(Number(q.limit));
  const ids = (str(q.walletIds) ?? '').split(',').map(s => s.trim()).filter(s => /^[\w-]{1,64}$/.test(s));
  const kinds = [...new Set([...(str(q.kinds) ?? '').split(','), str(q.view) ?? ''].map(s => s.trim()).filter(k => KINDS.includes(k) && k !== 'all'))] as FeedKind[];
  const min = amountOf(q.minAmount), max = amountOf(q.maxAmount);
  return {
    period: parsePeriod(q as never, now),
    kinds,
    includeLoans: parseIncludeLoans(typeof q.includeLoans === 'string' ? q.includeLoans : undefined),
    walletIds: [...new Set(ids)].slice(0, 50),
    memberId: str(q.memberId),
    search: (str(q.search) ?? '').slice(0, 200) || null,
    include: parsePicks(q.categories),
    exclude: parsePicks(q.excludeCategories),
    // A range typed the wrong way round still means "between these two".
    minAmount: min !== null && max !== null && min > max ? max : min,
    maxAmount: min !== null && max !== null && min > max ? min : max,
    receipt: oneOf(q.receipt, ['any', 'with', 'without'] as const, 'any'),
    source: oneOf(q.source, ['any', 'schedule', 'hand', 'debt', 'transfer'] as const, 'any'),
    schedules: [...new Set((str(q.schedules) ?? '').split(',').map(x => x.trim()).filter(x => /^[\w-]{1,64}$/.test(x)))].slice(0, 50),
    schedMode: oneOf(q.schedMode, ['any', 'auto', 'confirm'] as const, 'any'),
    flags: [...new Set((str(q.flags) ?? '').split(',').map(x => x.trim()).filter((x): x is Flag => x === 'duplicates' || x === 'uncategorised'))],
    tags: cleanTags(str(q.tags) ?? '').slice(0, 10),
    groupBy: oneOf(q.groupBy, ['none', 'category', 'wallet', 'member', 'title'] as const, 'none'),
    sort: oneOf(q.sort, ['newest', 'oldest', 'largest', 'smallest'] as const, 'newest'),
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(limit, FEED_PAGE_MAX) : FEED_PAGE_DEFAULT,
    cursor: str(q.cursor),
    fallbackCurrency: currencyOf(q.fallbackCurrency) ?? 'RWF',
    convertTo: currencyOf(q.convertTo),
  };
}

// ── Categories: a retired category still counts under the one it became ──────────────────────────

/** Every stored value that belongs to a category: itself and the retired ones that became it. */
export function slugsFor(category: string): string[] {
  const canon = canonicalCategory(category).category;
  return [canon, ...Object.entries(LEGACY_CATEGORY).filter(([, v]) => v.category === canon).map(([k]) => k)];
}

/** The retired values that carry this sub-category in their new home (groceries is Food › Groceries). */
export function legacyWithSub(category: string, sub: string): string[] {
  const canon = canonicalCategory(category).category;
  return Object.entries(LEGACY_CATEGORY).filter(([, v]) => v.category === canon && v.subCategory?.toLowerCase() === sub.toLowerCase()).map(([k]) => k);
}

// ── Paging ───────────────────────────────────────────────────────────────────────────────────────

export interface Cursor { d: string; i: string }

/** Date sorts page by "after this row" (a page never repeats or skips); amount sorts page by position. */
export const encodeCursor = (row: { date: Date; id: string }): string =>
  Buffer.from(JSON.stringify({ d: row.date.toISOString(), i: row.id } satisfies Cursor)).toString('base64url');

export const encodeOffset = (offset: number): string => Buffer.from(JSON.stringify({ o: offset })).toString('base64url');

export function decodeCursor(raw: string | null): { date: Date; id: string } | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    const date = new Date(c.d);
    return typeof c.i === 'string' && c.i.length <= 64 && !Number.isNaN(date.getTime()) ? { date, id: c.i } : null;
  } catch { return null; }
}

export function decodeOffset(raw: string | null): number {
  if (!raw) return 0;
  try {
    const o = (JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { o?: unknown }).o;
    return typeof o === 'number' && Number.isInteger(o) && o >= 0 && o < 1_000_000 ? o : 0;
  } catch { return 0; }
}

// ── The period before this one (for "+23% vs September") ─────────────────────────────────────────

/** The equal stretch of time just before, or null when there is none ("all time"). */
export function previousPeriod(p: Period | null): Period | null {
  if (!p || p.kind === 'all' || !p.from || !p.to) return null;
  if (p.kind === 'month') {
    const from = new Date(p.from.getFullYear(), p.from.getMonth() - 1, 1);
    return { kind: 'month', from, to: p.from, month: from.getMonth() + 1, year: from.getFullYear() };
  }
  if (p.kind === 'year') {
    const from = new Date(p.from.getFullYear() - 1, 0, 1);
    return { kind: 'year', from, to: p.from, month: 1, year: from.getFullYear() };
  }
  const days = Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000);
  const from = new Date(p.from.getFullYear(), p.from.getMonth(), p.from.getDate() - days);
  return { kind: 'range', from, to: p.from, month: from.getMonth() + 1, year: from.getFullYear() };
}

// ── Adding rows up ───────────────────────────────────────────────────────────────────────────────

export interface SumRow {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'DEBT';
  amount: number;
  date: Date;
  currency: string;
  debtRole: string | null;
}

export interface CurrencyTotals {
  currency: string;
  income: number;
  expense: number;
  net: number;
  /** Every row in this currency, transfers included (what the list shows). */
  count: number;
  /** Spending per equal slice of the period, for the little trend line. */
  series: number[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Income and expense per currency. Borrowed money is never income, and a transfer is neither income nor spending
 * (it only counts as a row). Currencies are never added together.
 */
export function totalsByCurrency(rows: SumRow[], span: { from: Date; to: Date } | null, points = SERIES_POINTS): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals>();
  const get = (c: string) => {
    let t = map.get(c);
    if (!t) { t = { currency: c, income: 0, expense: 0, net: 0, count: 0, series: new Array(points).fill(0) }; map.set(c, t); }
    return t;
  };
  const from = span?.from.getTime() ?? 0;
  const length = span ? Math.max(1, span.to.getTime() - span.from.getTime()) : 1;
  for (const r of rows) {
    const t = get(r.currency);
    t.count++;
    if (r.type === 'INCOME' && r.debtRole !== 'BORROW_IN') t.income += r.amount;
    else if (r.type === 'EXPENSE') {
      t.expense += r.amount;
      if (span) {
        const idx = Math.min(points - 1, Math.max(0, Math.floor(((r.date.getTime() - from) / length) * points)));
        t.series[idx] += r.amount;
      }
    }
  }
  return [...map.values()]
    .map(t => ({ ...t, income: round2(t.income), expense: round2(t.expense), net: round2(t.income - t.expense), series: t.series.map(round2) }))
    // The biggest currency first, so the first tab is the one that matters.
    .sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}

/** Spending change versus the previous period, in percent, or null when there is nothing to compare with. */
export function changePercent(now: number, before: number): number | null {
  if (!(before > 0)) return null;
  return Math.round(((now - before) / before) * 100);
}

/** The span to bucket the trend line over: the period itself, or from the oldest row to now for "all". */
export function seriesSpan(period: Period | null, oldest: Date | null, now = new Date()): { from: Date; to: Date } | null {
  if (period?.from && period.to) return { from: period.from, to: period.to < now ? period.to : new Date(now.getTime() + 1) };
  if (oldest) return { from: oldest, to: new Date(now.getTime() + 1) };
  return null;
}

// ── Facets: the used categories and sub-categories, merged the way the person sees them ─────────

export interface FacetRow { type: string; category: string; subCategory: string | null; count: number; lastUsed: Date | null }
export interface FacetSub { name: string; count: number; lastUsed: string | null }
export interface FacetCategory { category: string; kind: 'EXPENSE' | 'INCOME'; count: number; lastUsed: string | null; noSub: number; subs: FacetSub[] }

/**
 * Rows grouped by (type, category, sub-category) become one entry per category and kind: retired categories are folded
 * into the category they became, "pizza" and "Pizza" are one choice (the first spelling wins), income and spending
 * stay apart, and the busiest come first.
 */
export function buildFacets(rows: FacetRow[]): FacetCategory[] {
  const out = new Map<string, FacetCategory & { subMap: Map<string, FacetSub> }>();
  for (const r of rows) {
    if (r.type !== 'INCOME' && r.type !== 'EXPENSE') continue; // transfers have no category worth filtering by
    const canon = canonicalCategory(r.category);
    const kind = r.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const key = `${kind}:${canon.category}`;
    let cat = out.get(key);
    if (!cat) { cat = { category: canon.category, kind, count: 0, lastUsed: null, noSub: 0, subs: [], subMap: new Map() }; out.set(key, cat); }
    const name = (r.subCategory ?? canon.subCategory ?? '').trim();
    const last = r.lastUsed ? r.lastUsed.toISOString() : null;
    cat.count += r.count;
    if (last && (!cat.lastUsed || last > cat.lastUsed)) cat.lastUsed = last;
    if (!name) { cat.noSub += r.count; continue; }
    const subKey = name.toLowerCase();
    const sub = cat.subMap.get(subKey);
    if (sub) { sub.count += r.count; if (last && (!sub.lastUsed || last > sub.lastUsed)) sub.lastUsed = last; }
    else cat.subMap.set(subKey, { name, count: r.count, lastUsed: last });
  }
  return [...out.values()]
    .map(({ subMap, ...c }) => ({ ...c, subs: [...subMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

// ── Group totals: one header per category, wallet, member or title ──────────────────────────────

export interface GroupRow { key: string; walletCurrency: string; type: string; debtRole: string | null; count: number; amount: number }
export interface GroupTotals { key: string; count: number; totals: Array<{ currency: string; income: number; expense: number }> }

/** Rows counted per (group, wallet currency, type) become one entry per group: retired categories merge into the one they became. */
export function groupTotals(rows: GroupRow[], by: GroupBy): GroupTotals[] {
  const out = new Map<string, GroupTotals>();
  for (const r of rows) {
    const key = by === 'category' ? canonicalCategory(r.key).category : by === 'title' ? r.key.trim().toLowerCase() : r.key;
    let g = out.get(key);
    if (!g) { g = { key, count: 0, totals: [] }; out.set(key, g); }
    g.count += r.count;
    let t = g.totals.find(x => x.currency === r.walletCurrency);
    if (!t) { t = { currency: r.walletCurrency, income: 0, expense: 0 }; g.totals.push(t); }
    // Borrowed money is never income and a transfer is neither income nor spending, as everywhere else.
    if (r.type === 'INCOME' && r.debtRole !== 'BORROW_IN') t.income = round2(t.income + r.amount);
    else if (r.type === 'EXPENSE') t.expense = round2(t.expense + r.amount);
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

// ── A saved view ────────────────────────────────────────────────────────────────────────────────

export const MAX_VIEWS = 30;
export const MAX_VIEW_BYTES = 8000;

/** A name and a filter that is a plain object of a sensible size, or null. Whatever else comes with it is ignored. */
export function parseSavedView(body: unknown): { name: string; filter: Record<string, unknown> } | null {
  if (!body || typeof body !== 'object') return null;
  const { name, filter } = body as { name?: unknown; filter?: unknown };
  const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 40).trim() : '';
  if (!clean || !filter || typeof filter !== 'object' || Array.isArray(filter)) return null;
  let size = 0;
  try { size = JSON.stringify(filter).length; } catch { return null; }
  return size <= MAX_VIEW_BYTES ? { name: clean, filter: filter as Record<string, unknown> } : null;
}
