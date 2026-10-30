/**
 * History: what a row is, how rows group into days, how a day adds up, and what the summary says.
 * All pure (no screen, no network), so the rules are tested. The server sends rows and totals; the person's own
 * calendar (their time zone) decides which day a row belongs to, so grouping happens here and not on the server.
 */
import type { StringKey } from '@/i18n/strings';
import type { Period } from '@/utils/period';

export type FeedKind = 'all' | 'income' | 'expense' | 'transfer' | 'debt' | 'credit' | 'scheduled';
export type DebtRole = 'BORROW_IN' | 'LEND_OUT' | 'REPAY_OUT' | 'REPAY_IN';

export interface FeedWallet { name: string; color: string; currency: string; archived: boolean }

/** One row of History as the server sends it. */
export interface FeedRow {
  id: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'DEBT';
  category: string;
  title: string;
  subCategory: string | null;
  description: string | null;
  /** Income is positive, spending negative; a transfer keeps its plain size. */
  amount: number;
  date: string;
  walletId: string | null;
  wallet: FeedWallet | null;
  currency: string | null;
  receiptUrl: string | null;
  receiptReportUrl: string | null;
  debtId: string | null;
  debtRole: DebtRole | null;
  debt: { person: string; kind: 'BORROWED' | 'LENT'; status: string; amount: number; paid: number; currency: string; payments: number; installments: number } | null;
  fundedBy: { debtId: string | null; person: string } | null;
  /** A private note and tags (from the server; older rows have none). */
  note?: string | null;
  tags?: string[];
  schedule: { id: string; title: string; repeat: { unit?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' } | null; mode: string; status: string } | null;
  transfer: { toWalletId: string | null; toWallet: FeedWallet | null; toAmount: number | null; exchangeRate: number | null } | null;
  author?: { clientId: string; name: string; isYou: boolean };
  /** The same title, amount and wallet appears again within a day. */
  possibleDuplicate?: boolean;
  /** One wallet, plain timeline only: the wallet's balance right after this row. */
  balanceAfter?: number | null;
}

export interface CurrencySummary {
  currency: string;
  income: number;
  expense: number;
  net: number;
  count: number;
  series: number[];
  previous: { income: number; expense: number } | null;
  spendingChangePct: number | null;
}

export interface FeedSummary {
  period: { kind: string; from: string | null; to: string | null };
  count: number;
  currencies: CurrencySummary[];
  converted: { currency: string; income: number; expense: number; net: number; missing: string[] } | null;
}

// ── The query ────────────────────────────────────────────────────────────────

export type Receipt = 'any' | 'with' | 'without';
export type Source = 'any' | 'schedule' | 'hand' | 'debt' | 'transfer';
export type Sort = 'newest' | 'oldest' | 'largest' | 'smallest';
/** Day, week and month are the person's own calendar (done on the page); the rest the server orders and totals. */
export type Group = 'day' | 'week' | 'month' | 'none' | 'category' | 'wallet' | 'member' | 'title';
export const SERVER_GROUPS: Group[] = ['category', 'wallet', 'member', 'title'];
export const isServerGroup = (g: Group): boolean => SERVER_GROUPS.includes(g);
export type SchedMode = 'any' | 'auto' | 'confirm';
export type Flag = 'duplicates' | 'uncategorised';
/** Past: what was posted. Upcoming: what is due. Both: the list with Upcoming folded above it. */
export type Phase = 'both' | 'past' | 'upcoming';
export type Due = 'overdue' | 'today' | 'week' | 'failed';

/** One choice in the category filter: a whole category, one sub-category of it, or "that category, no sub-category". */
export interface Pick { c: string; s?: string; none?: boolean }

export interface HistoryFilter {
  period: Period;
  /** Empty means every kind; several mean "any of these". */
  kinds: FeedKind[];
  includeLoans: boolean;
  walletIds: string[];
  memberId: string | null;
  search: string;
  include: Pick[];
  exclude: Pick[];
  minAmount: number | null;
  maxAmount: number | null;
  receipt: Receipt;
  source: Source;
  schedules: string[];
  schedMode: SchedMode;
  flags: Flag[];
  /** Rows carrying any of these tags. */
  tags: string[];
  phase: Phase;
  due: Due[];
  sort: Sort;
  group: Group;
}

export const emptyFilter = (period: Period): HistoryFilter => ({
  period, kinds: [], includeLoans: true, walletIds: [], memberId: null, search: '', include: [], exclude: [], minAmount: null, maxAmount: null, receipt: 'any', source: 'any', schedules: [], schedMode: 'any', flags: [], tags: [], phase: 'both', due: [], sort: 'newest', group: 'day',
});

const samePick = (a: Pick, b: Pick) => a.c === b.c && (a.s ?? '').toLowerCase() === (b.s ?? '').toLowerCase() && !!a.none === !!b.none;
const without = (list: Pick[], p: Pick) => list.filter(x => !samePick(x, p));

export type PickState = 'none' | 'include' | 'exclude' | 'some';

/** Where a choice stands: chosen, left out, or (for a category) partly chosen through its sub-categories. */
export function pickState(f: HistoryFilter, p: Pick): PickState {
  if (f.include.some(x => samePick(x, p))) return 'include';
  if (f.exclude.some(x => samePick(x, p))) return 'exclude';
  if (!p.s && !p.none && [...f.include].some(x => x.c === p.c && (x.s || x.none))) return 'some';
  return 'none';
}

/**
 * One tap on a choice: include it, tap again to leave it out, again to clear it.
 * A whole category and its own sub-categories never sit in the same list (choosing one replaces the other).
 */
export function cyclePick(f: HistoryFilter, p: Pick): HistoryFilter {
  const state = pickState(f, p);
  const whole = !p.s && !p.none;
  const cleared = { include: without(f.include, p), exclude: without(f.exclude, p) };
  if (state === 'include') return { ...f, ...cleared, exclude: [...cleared.exclude, p] };
  if (state === 'exclude') return { ...f, ...cleared };
  // none or some: include it
  const tidy = (list: Pick[]) => (whole ? list.filter(x => x.c !== p.c) : list.filter(x => !(x.c === p.c && !x.s && !x.none)));
  return { ...f, include: [...tidy(cleared.include), p], exclude: tidy(cleared.exclude) };
}

export type ChipKind = 'kind' | 'wallet' | 'member' | 'category' | 'amount' | 'receipt' | 'source' | 'loans' | 'schedule' | 'mode' | 'flag' | 'tag' | 'phase' | 'due';
export interface FilterChip {
  key: string;
  kind: ChipKind;
  /** The thing the chip stands for (a kind, a wallet id, a pick, …). */
  ref?: string | Pick;
  exclude?: boolean;
}

/** Every choice that is not the default (the period and the search words have their own places). One chip each. */
export function filterChips(f: HistoryFilter): FilterChip[] {
  const out: FilterChip[] = [];
  for (const k of f.kinds) out.push({ key: `kind:${k}`, kind: 'kind', ref: k });
  for (const id of f.walletIds) out.push({ key: `wallet:${id}`, kind: 'wallet', ref: id });
  if (f.memberId) out.push({ key: 'member', kind: 'member', ref: f.memberId });
  for (const p of f.include) out.push({ key: `inc:${p.c}/${p.s ?? (p.none ? '-' : '')}`, kind: 'category', ref: p });
  for (const p of f.exclude) out.push({ key: `exc:${p.c}/${p.s ?? (p.none ? '-' : '')}`, kind: 'category', ref: p, exclude: true });
  if (f.minAmount !== null || f.maxAmount !== null) out.push({ key: 'amount', kind: 'amount' });
  if (f.receipt !== 'any') out.push({ key: 'receipt', kind: 'receipt', ref: f.receipt });
  if (f.source !== 'any') out.push({ key: 'source', kind: 'source', ref: f.source });
  for (const id of f.schedules) out.push({ key: `schedule:${id}`, kind: 'schedule', ref: id });
  if (f.schedMode !== 'any') out.push({ key: 'mode', kind: 'mode', ref: f.schedMode });
  for (const x of f.flags) out.push({ key: `flag:${x}`, kind: 'flag', ref: x });
  for (const x of f.tags) out.push({ key: `tag:${x}`, kind: 'tag', ref: x });
  if (f.phase !== 'both') out.push({ key: 'phase', kind: 'phase', ref: f.phase });
  for (const d of f.due) out.push({ key: `due:${d}`, kind: 'due', ref: d });
  if (!f.includeLoans) out.push({ key: 'loans', kind: 'loans' });
  return out;
}

/** The badge on the filter button. */
export const activeFilterCount = (f: HistoryFilter): number => filterChips(f).length;

/** True when anything narrows the list apart from the period (the empty state then says "no match", not "nothing in October"). */
export const isFiltered = (f: HistoryFilter): boolean => activeFilterCount(f) > 0 || !!f.search.trim();

/** Takes one chip away. */
export function removeChip(f: HistoryFilter, chip: FilterChip): HistoryFilter {
  switch (chip.kind) {
    case 'kind': return { ...f, kinds: f.kinds.filter(k => k !== chip.ref) };
    case 'wallet': return { ...f, walletIds: f.walletIds.filter(id => id !== chip.ref) };
    case 'member': return { ...f, memberId: null };
    case 'category': { const p = chip.ref as Pick; return { ...f, include: without(f.include, p), exclude: without(f.exclude, p) }; }
    case 'amount': return { ...f, minAmount: null, maxAmount: null };
    case 'receipt': return { ...f, receipt: 'any' };
    case 'source': return { ...f, source: 'any' };
    case 'loans': return { ...f, includeLoans: true };
    case 'schedule': return { ...f, schedules: f.schedules.filter(id => id !== chip.ref) };
    case 'mode': return { ...f, schedMode: 'any' };
    case 'flag': return { ...f, flags: f.flags.filter(x => x !== chip.ref) };
    case 'tag': return { ...f, tags: f.tags.filter(x => x !== chip.ref) };
    case 'phase': return { ...f, phase: 'both' };
    case 'due': return { ...f, due: f.due.filter(x => x !== chip.ref) };
  }
}

/** Everything back to the default, keeping only the period (and the sort and grouping the person chose). */
export const clearFilter = (f: HistoryFilter): HistoryFilter => ({ ...emptyFilter(f.period), sort: f.sort, group: f.group });

export const isKindOn = (f: HistoryFilter, k: FeedKind): boolean => (k === 'all' ? f.kinds.length === 0 : f.kinds.includes(k));
/** A chip tap: a single kind (or all). The sheet is where several are chosen. */
export const setKind = (f: HistoryFilter, k: FeedKind): HistoryFilter => ({ ...f, kinds: k === 'all' ? [] : [k] });
export const toggleKind = (f: HistoryFilter, k: FeedKind): HistoryFilter => ({ ...f, kinds: f.kinds.includes(k) ? f.kinds.filter(x => x !== k) : [...f.kinds, k] });

/** Checks a number typed into a money box; "" means no limit. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 && n < 1e13 ? n : null;
}

// ── Facets: the categories this person has used, as the server counts them ───

export interface FacetSub { name: string; count: number; lastUsed: string | null }
export interface FacetCategory { category: string; kind: 'EXPENSE' | 'INCOME'; count: number; lastUsed: string | null; noSub: number; subs: FacetSub[] }
export interface Facets { total: number; categories: FacetCategory[] }

/** The same slug can be both an income and a spending category (gifts, business): the filter treats it as one choice. */
export function mergeKinds(categories: FacetCategory[]): FacetCategory[] {
  const map = new Map<string, FacetCategory>();
  for (const c of categories) {
    const have = map.get(c.category);
    if (!have) { map.set(c.category, { ...c, subs: [...c.subs] }); continue; }
    const big = c.count > have.count ? c : have;
    const subs = new Map(have.subs.map(x => [x.name.toLowerCase(), { ...x }]));
    for (const x of c.subs) {
      const k = x.name.toLowerCase(), cur = subs.get(k);
      if (cur) { cur.count += x.count; if (x.lastUsed && (!cur.lastUsed || x.lastUsed > cur.lastUsed)) cur.lastUsed = x.lastUsed; } else subs.set(k, { ...x });
    }
    map.set(c.category, {
      category: c.category, kind: big.kind, count: have.count + c.count, noSub: have.noSub + c.noSub,
      lastUsed: [have.lastUsed, c.lastUsed].filter(Boolean).sort().pop() ?? null,
      subs: [...subs.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

/** "Show N more" keeps a long list short. */
export const visibleSubs = (subs: FacetSub[], expanded: boolean, limit = 5): { shown: FacetSub[]; hidden: number } =>
  expanded || subs.length <= limit ? { shown: subs, hidden: 0 } : { shown: subs.slice(0, limit), hidden: subs.length - limit };

// ── Days ─────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** The person's own calendar day of a moment: "2026-10-29". */
export const dayKey = (iso: string | Date): string => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The currency a row is in: its wallet's, or the person's own for a row without a wallet. */
export const currencyOf = (row: FeedRow, fallback: string): string => row.wallet?.currency ?? row.currency ?? fallback;

/** What a row adds to the day's net: income is in, spending is out; a transfer and borrowed money are neither. */
export function netEffect(row: FeedRow): number {
  if (row.type === 'TRANSFER' || row.type === 'DEBT') return 0;
  if (row.type === 'INCOME' && row.debtRole === 'BORROW_IN') return 0;
  return row.amount;
}

export interface DayGroup {
  key: string;
  /** Local midnight of the day. */
  date: Date;
  rows: FeedRow[];
  /** Net per currency, in the order of first appearance. */
  net: Array<{ currency: string; amount: number }>;
}

/** Rows (newest first) into days. Rows of the same day stay together even when they arrive in different pages. */
export function groupByDay(rows: FeedRow[], fallbackCurrency: string): DayGroup[] {
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const row of rows) {
    const key = dayKey(row.date);
    let g = byKey.get(key);
    if (!g) {
      const d = new Date(row.date);
      g = { key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), rows: [], net: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.rows.push(row);
    const effect = netEffect(row);
    if (effect !== 0) {
      const cur = currencyOf(row, fallbackCurrency);
      const slot = g.net.find(n => n.currency === cur);
      if (slot) slot.amount = Math.round((slot.amount + effect) * 100) / 100;
      else g.net.push({ currency: cur, amount: effect });
    }
  }
  return groups;
}

/** Rows into weeks, months or one list. Day grouping is groupByDay; this keeps the same shape. */
export function groupRows(rows: FeedRow[], group: Group, fallbackCurrency: string, weekStart: 'monday' | 'sunday' = 'monday'): DayGroup[] {
  if (group === 'day') return groupByDay(rows, fallbackCurrency);
  const keyOf = (d: Date): { key: string; date: Date } => {
    if (group === 'month') return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, date: new Date(d.getFullYear(), d.getMonth(), 1) };
    if (group === 'none') return { key: 'all', date: new Date(d.getFullYear(), d.getMonth(), d.getDate()) };
    const back = (d.getDay() - (weekStart === 'monday' ? 1 : 0) + 7) % 7;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    return { key: dayKey(start), date: start };
  };
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const row of rows) {
    const { key, date } = keyOf(new Date(row.date));
    let g = byKey.get(key);
    if (!g) { g = { key, date, rows: [], net: [] }; byKey.set(key, g); groups.push(g); }
    g.rows.push(row);
    const effect = netEffect(row);
    if (effect !== 0) {
      const cur = currencyOf(row, fallbackCurrency);
      const slot = g.net.find(n => n.currency === cur);
      if (slot) slot.amount = Math.round((slot.amount + effect) * 100) / 100; else g.net.push({ currency: cur, amount: effect });
    }
  }
  return groups;
}

export interface GroupContext { fallbackCurrency: string; weekStart: 'monday' | 'sunday'; walletName?: (id: string) => string }

/** The key a row has in a server grouping (retired categories join the one they became). */
export function groupKeyOf(row: FeedRow, group: Group, canonical: (slug: string) => string): string {
  if (group === 'category') return canonical(row.category);
  if (group === 'wallet') return row.walletId ?? '';
  if (group === 'member') return row.author?.clientId ?? '';
  return row.title.trim().toLowerCase();
}

/** Rows into the groups the server ordered them by (category, wallet, member or title), in the order they arrive. */
export function groupByKey(rows: FeedRow[], group: Group, canonical: (slug: string) => string): DayGroup[] {
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const row of rows) {
    const key = groupKeyOf(row, group, canonical);
    let g = byKey.get(key);
    if (!g) { g = { key, date: new Date(row.date), rows: [], net: [] }; byKey.set(key, g); groups.push(g); }
    g.rows.push(row);
  }
  return groups;
}

/** A group's header numbers from the server: net per currency and the share of spending the group is, for one currency. */
export interface GroupSummary { key: string; count: number; totals: Array<{ currency: string; income: number; expense: number }> }
export function groupShare(g: GroupSummary | undefined, all: GroupSummary[], currency: string): number | null {
  const spent = (x: GroupSummary) => x.totals.find(t => t.currency === currency)?.expense ?? 0;
  const total = all.reduce((n, x) => n + spent(x), 0);
  return g && total > 0 ? Math.round((spent(g) / total) * 100) : null;
}

// ── What a row asks of the person ────────────────────────────────────────────

/** "Possible duplicate" (the server says so) and "choose a category" (still in Other with nothing more). */
export function rowFlags(row: FeedRow): Array<'duplicate' | 'uncategorised'> {
  const out: Array<'duplicate' | 'uncategorised'> = [];
  if (row.possibleDuplicate) out.push('duplicate');
  if (row.type !== 'TRANSFER' && !row.debtRole && row.category === 'other' && !row.subCategory) out.push('uncategorised');
  return out;
}

export type DayName = { kind: 'today' } | { kind: 'yesterday' } | { kind: 'date'; date: Date; withYear: boolean };

/** "Today", "Yesterday", or a date (with the year when it is not this year). */
export function dayName(date: Date, now = new Date()): DayName {
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return { kind: 'today' };
  if (diff === 1) return { kind: 'yesterday' };
  return { kind: 'date', date, withYear: date.getFullYear() !== now.getFullYear() };
}

// ── Money ────────────────────────────────────────────────────────────────────

const group3 = (n: number, digits: number) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "12,400", "0.50", "1.25B": ten million and over abbreviate; the full figure is shown in the peek. */
export function shortAmount(n: number, zeroDecimal = false): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trim(abs / 1e9)}B`;
  if (abs >= 1e7) return `${trim(abs / 1e6)}M`;
  const digits = zeroDecimal || Number.isInteger(abs) ? 0 : 2;
  return group3(abs, digits);
}
const trim = (x: number) => String(Math.round(x * 100) / 100);

/** Signed, with a real minus sign: "+850,000", "−12,400". A transfer has no sign. */
export function signedAmount(n: number, opts: { transfer?: boolean; zeroDecimal?: boolean } = {}): string {
  const body = shortAmount(n, opts.zeroDecimal);
  if (opts.transfer || n === 0) return body;
  return `${n > 0 ? '+' : '−'}${body}`;
}

export const ZERO_DECIMAL = new Set(['RWF', 'UGX', 'TZS', 'BIF', 'CDF', 'JPY', 'KES', 'NGN']);

// ── The row: what kind it is, what badges it carries ─────────────────────────

export type Tone = 'neutral' | 'primary' | 'positive' | 'negative' | 'warn';
export interface Badge { icon: string; label: StringKey; vars?: Record<string, string | number>; tone: Tone }

export type RowVariant =
  | 'expense' | 'income' | 'transfer' | 'borrowed' | 'lent' | 'repayPaid' | 'repayReceived';

export function variantOf(row: FeedRow): RowVariant {
  if (row.type === 'TRANSFER') return 'transfer';
  switch (row.debtRole) {
    case 'BORROW_IN': return 'borrowed';
    case 'LEND_OUT': return 'lent';
    case 'REPAY_OUT': return 'repayPaid';
    case 'REPAY_IN': return 'repayReceived';
  }
  return row.type === 'INCOME' ? 'income' : 'expense';
}

/** The icon a row leads with when it is not an ordinary category (transfers and loans have their own). */
export const VARIANT_ICON: Partial<Record<RowVariant, string>> = {
  transfer: 'swap_horiz', borrowed: 'south-west', lent: 'north-east', repayPaid: 'call-made', repayReceived: 'call-received',
};

const REPEAT_LABEL: Record<string, StringKey> = { DAY: 'badge.daily', WEEK: 'badge.weekly', MONTH: 'badge.monthly', YEAR: 'badge.yearly' };

/** The small icon-and-word labels under a row's title. Meaning never depends on colour alone. */
export function rowBadges(row: FeedRow): Badge[] {
  const out: Badge[] = [];
  switch (variantOf(row)) {
    case 'transfer': out.push({ icon: 'swap-horiz', label: 'badge.transfer', tone: 'neutral' }); break;
    case 'borrowed': out.push({ icon: 'south-west', label: 'badge.borrowed', tone: 'warn' }); break;
    case 'lent': out.push({ icon: 'north-east', label: 'badge.lent', tone: 'warn' }); break;
    case 'repayPaid': out.push({ icon: 'call-made', label: 'badge.repayPaid', tone: 'warn' }); break;
    case 'repayReceived': out.push({ icon: 'call-received', label: 'badge.repayReceived', tone: 'positive' }); break;
  }
  if (row.fundedBy) out.push({ icon: 'savings', label: 'badge.fundedBy', vars: { person: row.fundedBy.person }, tone: 'warn' });
  if (row.schedule) {
    const unit = row.schedule.repeat?.unit;
    out.push({ icon: 'repeat', label: (unit && REPEAT_LABEL[unit]) || 'badge.scheduled', tone: 'primary' });
  }
  if (row.receiptUrl) out.push({ icon: 'receipt-long', label: 'badge.receipt', tone: 'neutral' });
  if (row.receiptReportUrl) out.push({ icon: 'picture-as-pdf', label: 'badge.report', tone: 'neutral' });
  return out;
}

/** "3 of 5" for a repayment, when the loan has pay dates and some were paid. */
export function repaymentProgress(row: FeedRow): { done: number; total: number } | null {
  const d = row.debt;
  if (!d || !row.debtRole || (row.debtRole !== 'REPAY_IN' && row.debtRole !== 'REPAY_OUT')) return null;
  if (d.installments <= 0 || d.payments <= 0) return null;
  return { done: Math.min(d.payments, d.installments), total: d.installments };
}

/** The line under the title: "Food · Groceries", a person's name for a loan, or "A → B" for a transfer. */
export function metaParts(row: FeedRow): { category: string | null; sub: string | null; person: string | null; from: string | null; to: string | null } {
  if (row.type === 'TRANSFER') return { category: null, sub: null, person: null, from: row.wallet?.name ?? null, to: row.transfer?.toWallet?.name ?? null };
  if (row.debt && row.debtRole) return { category: null, sub: null, person: row.debt.person, from: null, to: null };
  return { category: row.category, sub: row.subCategory, person: null, from: null, to: null };
}

/** A transfer between two currencies shows both amounts. */
export function transferAmounts(row: FeedRow): { out: number; in: number | null; outCurrency: string | null; inCurrency: string | null; rate: number | null } {
  const t = row.transfer;
  return {
    out: row.amount,
    in: t && t.toAmount != null && t.toWallet && row.wallet && t.toWallet.currency !== row.wallet.currency ? t.toAmount : null,
    outCurrency: row.wallet?.currency ?? null,
    inCurrency: t?.toWallet?.currency ?? null,
    rate: t?.exchangeRate ?? null,
  };
}

// ── The summary card ─────────────────────────────────────────────────────────

/** The tab to show: the one chosen if it still exists, else the busiest currency. */
export function pickCurrency(summary: FeedSummary | null, chosen: string | null): CurrencySummary | null {
  if (!summary || !summary.currencies.length) return null;
  return summary.currencies.find(c => c.currency === chosen) ?? summary.currencies[0];
}

/** Spending change versus the period before: 'up', 'down' or 'same' with the size, or null with nothing to compare. */
export function changeOf(c: CurrencySummary): { dir: 'up' | 'down' | 'same'; pct: number } | null {
  if (c.spendingChangePct == null) return null;
  const pct = Math.abs(c.spendingChangePct);
  return { dir: c.spendingChangePct > 0 ? 'up' : c.spendingChangePct < 0 ? 'down' : 'same', pct };
}

/** The little trend line as an SVG path, flat when there is nothing to draw. */
export function sparkline(series: number[], width = 84, height = 40, pad = 4): string {
  if (series.length < 2) return '';
  const max = Math.max(...series, 0);
  const step = (width - pad * 2) / (series.length - 1);
  return series
    .map((v, i) => {
      const x = pad + i * step;
      const y = max > 0 ? height - pad - (v / max) * (height - pad * 2) : height - pad;
      return `${i === 0 ? 'M' : 'L'}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}

/** Whether there are any rows at all on the page (for choosing between the empty states). */
export function emptyKind(opts: { rows: number; hasAny: boolean; filtered: boolean; periodIsAll: boolean }): 'none' | 'filter' | 'period' | null {
  if (opts.rows > 0) return null;
  if (!opts.hasAny) return 'none';
  if (opts.filtered) return 'filter';
  return opts.periodIsAll ? 'none' : 'period';
}

// ── Select mode ──────────────────────────────────────────────────────────────

/** Loan and debt rows are ordinary transactions now: they can be changed or deleted without touching the loan. Only the old DEBT type stays fixed. */
export const isLocked = (row: FeedRow): boolean => row.type === 'DEBT';

/** What deleting these rows does to wallet balances, per currency (income comes back out, spending goes back in; transfers and locked rows are left out). */
export function deleteEffect(rows: FeedRow[], fallback: string): Array<{ currency: string; change: number }> {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r.type === 'TRANSFER' || isLocked(r)) continue;
    const c = currencyOf(r, fallback);
    by.set(c, (by.get(c) ?? 0) - r.amount);
  }
  return [...by].map(([currency, change]) => ({ currency, change: Math.round(change * 100) / 100 })).filter(x => x.change !== 0);
}

// ── Quick peek actions ───────────────────────────────────────────────────────

/** Other loaded rows with the same title (ignoring case) that are not in this category yet: offered when one row's category changes. */
export function similarRows(rows: FeedRow[], row: FeedRow, category: string): FeedRow[] {
  const title = row.title.trim().toLowerCase();
  if (!title) return [];
  return rows.filter(r => r.id !== row.id && !isLocked(r) && r.type === row.type && r.type !== 'TRANSFER' && r.title.trim().toLowerCase() === title && r.category !== category);
}

/** The Add form, filled in with this row (a copy dated now). Transfers and loan rows cannot be copied this way. */
export function duplicateParams(row: FeedRow): Record<string, string> | null {
  if (row.type !== 'INCOME' && row.type !== 'EXPENSE') return null;
  if (isLocked(row)) return null;
  const out: Record<string, string> = { type: row.type, amount: String(Math.abs(row.amount)), category: row.category, description: row.title };
  if (row.walletId) out.walletId = row.walletId;
  if (row.subCategory) out.subCategory = row.subCategory;
  return out;
}

/** The same, repeating every month from the same day next month. */
export function recurringParams(row: FeedRow, now: Date = new Date()): Record<string, string> | null {
  const base = duplicateParams(row);
  if (!base) return null;
  const d = new Date(row.date);
  const day = Math.min(d.getDate(), 28);
  const next = new Date(now.getFullYear(), now.getMonth() + 1, day, d.getHours(), d.getMinutes());
  const repeat = { unit: 'MONTH', every: 1, weekdays: [], monthDays: [day], nth: null, months: [], ends: { type: 'never' } };
  return { ...base, date: next.toISOString(), repeat: JSON.stringify(repeat) };
}
