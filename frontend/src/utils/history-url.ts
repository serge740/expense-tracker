/**
 * The whole History filter as a web address, and back. A link or a reload then shows the same list, and saved views keep
 * the same shape. Anything unreadable is ignored (never an error), so an old or edited link can only ever show less.
 */
import { fromDay, periodKey, presetPeriod, matchPreset, PRESET_IDS, type Period, type PresetId } from '@/utils/period';
import {
  emptyFilter, type Due, type Flag, type FeedKind, type Group, type HistoryFilter, type Phase, type Pick, type Receipt, type SchedMode, type Sort, type Source,
} from '@/utils/history';

const KINDS: FeedKind[] = ['income', 'expense', 'transfer', 'debt', 'credit', 'scheduled'];
const GROUPS: Group[] = ['day', 'week', 'month', 'none', 'category', 'wallet', 'member', 'title'];
const SORTS: Sort[] = ['newest', 'oldest', 'largest', 'smallest'];
const SOURCES: Source[] = ['any', 'schedule', 'hand', 'debt', 'transfer'];
const RECEIPTS: Receipt[] = ['any', 'with', 'without'];
const MODES: SchedMode[] = ['any', 'auto', 'confirm'];
const FLAGS: Flag[] = ['duplicates', 'uncategorised'];
const PHASES: Phase[] = ['both', 'past', 'upcoming'];
const DUES: Due[] = ['overdue', 'today', 'week', 'failed'];

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const list = <T extends string>(v: unknown, allowed: readonly T[]): T[] => (typeof v === 'string' ? [...new Set(v.split(',').filter((x): x is T => allowed.includes(x as T)))] : []);
const ids = (v: unknown): string[] => (typeof v === 'string' ? [...new Set(v.split(',').filter(x => /^[\w-]{1,64}$/.test(x)))].slice(0, 50) : []);
const num = (v: unknown): number | null => { const n = typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n >= 0 && n < 1e13 ? n : null; };

export function picksFrom(raw: unknown): Pick[] {
  if (typeof raw !== 'string' || raw.length > 6000) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.slice(0, 60).filter((p): p is Pick => !!p && typeof p.c === 'string' && /^[a-z_]{2,20}$/.test(p.c)).map(p => (p.s ? { c: p.c, s: String(p.s).slice(0, 40) } : p.none ? { c: p.c, none: true } : { c: p.c }));
  } catch { return []; }
}

/** "m:2026-10", "y:2026", "all" or "r:2026-10-05~2026-10-09". */
export const periodToText = (p: Period): string => {
  switch (p.kind) {
    case 'month': return `m:${p.year}-${String(p.month).padStart(2, '0')}`;
    case 'year': return `y:${p.year}`;
    case 'all': return 'all';
    case 'range': return `r:${p.from}~${p.to}`;
  }
};

export function periodFromText(v: unknown): Period | null {
  if (typeof v !== 'string') return null;
  if (v === 'all') return { kind: 'all' };
  let m = /^m:(\d{4})-(\d{2})$/.exec(v);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { kind: 'month', year: +m[1], month: +m[2] };
  m = /^y:(\d{4})$/.exec(v);
  if (m) return { kind: 'year', year: +m[1] };
  m = /^r:(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(v);
  if (m && fromDay(m[1]) && fromDay(m[2]) && m[1] <= m[2]) return { kind: 'range', from: m[1], to: m[2] };
  return null;
}

/** Only what differs from the default, so a plain History address stays plain. */
export function filterToQuery(f: HistoryFilter, now = new Date()): Record<string, string> {
  const d = emptyFilter(f.period);
  const q: Record<string, string> = {};
  if (periodKey(f.period) !== periodKey({ kind: 'month', month: now.getMonth() + 1, year: now.getFullYear() })) q.p = periodToText(f.period);
  if (f.kinds.length) q.k = f.kinds.join(',');
  if (f.walletIds.length) q.w = f.walletIds.join(',');
  if (f.memberId) q.mem = f.memberId;
  if (f.search.trim()) q.q = f.search.trim();
  if (f.include.length) q.inc = JSON.stringify(f.include);
  if (f.exclude.length) q.exc = JSON.stringify(f.exclude);
  if (f.minAmount !== null) q.min = String(f.minAmount);
  if (f.maxAmount !== null) q.max = String(f.maxAmount);
  if (f.receipt !== d.receipt) q.rc = f.receipt;
  if (f.source !== d.source) q.src = f.source;
  if (f.schedules.length) q.sch = f.schedules.join(',');
  if (f.schedMode !== d.schedMode) q.sm = f.schedMode;
  if (f.flags.length) q.fl = f.flags.join(',');
  if (f.tags.length) q.tg = f.tags.join(',');
  if (f.phase !== d.phase) q.ph = f.phase;
  if (f.due.length) q.due = f.due.join(',');
  if (f.sort !== d.sort) q.sort = f.sort;
  if (f.group !== d.group) q.grp = f.group;
  if (!f.includeLoans) q.loans = '0';
  return q;
}

/** The keys that mean "this address carries a filter". */
export const FILTER_KEYS = ['p', 'k', 'w', 'mem', 'q', 'inc', 'exc', 'min', 'max', 'rc', 'src', 'sch', 'sm', 'fl', 'tg', 'ph', 'due', 'sort', 'grp', 'loans'];
export const hasFilterQuery = (q: Record<string, unknown>): boolean => FILTER_KEYS.some(k => q[k] !== undefined);

export function filterFromQuery(q: Record<string, unknown>, base: HistoryFilter): HistoryFilter {
  const min = num(q.min), max = num(q.max);
  return {
    ...base,
    period: periodFromText(q.p) ?? base.period,
    kinds: list(q.k, KINDS),
    walletIds: ids(q.w),
    memberId: typeof q.mem === 'string' && /^[\w-]{1,64}$/.test(q.mem) ? q.mem : null,
    search: typeof q.q === 'string' ? q.q.slice(0, 200) : '',
    include: picksFrom(q.inc),
    exclude: picksFrom(q.exc),
    minAmount: min !== null && max !== null && min > max ? max : min,
    maxAmount: min !== null && max !== null && min > max ? min : max,
    receipt: oneOf(q.rc, RECEIPTS, 'any'),
    source: oneOf(q.src, SOURCES, 'any'),
    schedules: ids(q.sch),
    schedMode: oneOf(q.sm, MODES, 'any'),
    flags: list(q.fl, FLAGS),
    tags: typeof q.tg === 'string' ? q.tg.split(',').map(x => x.trim()).filter(x => /^[^|,]{1,24}$/.test(x)).slice(0, 10) : [],
    phase: oneOf(q.ph, PHASES, 'both'),
    due: list(q.due, DUES),
    sort: oneOf(q.sort, SORTS, 'newest'),
    group: oneOf(q.grp, GROUPS, 'day'),
    includeLoans: q.loans !== '0',
  };
}

// ── A saved view: the same filter, with the period kept by name when it is a quick choice ───────

export type StoredView = Record<string, unknown>;

/** What is saved: the address form, and "this month" / "last 7 days" as names so the view stays current. */
export function toStored(f: HistoryFilter, now = new Date(), weekStart: 'monday' | 'sunday' = 'monday'): StoredView {
  const q: Record<string, unknown> = { ...filterToQuery({ ...f, search: '' }, now) };
  const preset = matchPreset(f.period, now, weekStart);
  if (preset) { delete q.p; q.pp = preset; } else q.p = periodToText(f.period);
  return q;
}

export function fromStored(stored: StoredView, base: HistoryFilter, now = new Date(), weekStart: 'monday' | 'sunday' = 'monday'): HistoryFilter {
  const pp = typeof stored.pp === 'string' && (PRESET_IDS as string[]).includes(stored.pp) ? (stored.pp as PresetId) : null;
  const f = filterFromQuery({ ...stored, p: pp ? undefined : stored.p }, { ...base, period: pp ? presetPeriod(pp, now, weekStart) : base.period });
  // A view with no period saved means "this month".
  return pp || stored.p ? f : { ...f, period: periodFromText(`m:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`) ?? f.period };
}
