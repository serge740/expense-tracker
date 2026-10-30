/**
 * The stretch of time Home looks at: one month, a year, everything, or a custom range of days.
 * Days are plain "YYYY-MM-DD" strings (the person's own calendar), so nothing depends on a time zone.
 */
export type Period =
  | { kind: 'month'; month: number; year: number }
  | { kind: 'year'; year: number }
  | { kind: 'all' }
  | { kind: 'range'; from: string; to: string };

export type DefaultPeriod = 'month' | 'year' | 'all';

const pad = (n: number) => String(n).padStart(2, '0');

/** A date as "YYYY-MM-DD" in the person's own calendar. */
export const toDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DD" as a date at local midnight (null when it is not a real day). */
export function fromDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toDay(d) === s ? d : null;
}

export const thisMonth = (now = new Date()): Period => ({ kind: 'month', month: now.getMonth() + 1, year: now.getFullYear() });

export function lastMonth(now = new Date()): Period {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { kind: 'month', month: d.getMonth() + 1, year: d.getFullYear() };
}

/** What Home starts on, from the setting. */
export function defaultPeriod(pref: DefaultPeriod | undefined, now = new Date()): Period {
  if (pref === 'year') return { kind: 'year', year: now.getFullYear() };
  if (pref === 'all') return { kind: 'all' };
  return thisMonth(now);
}

/** A custom range, with the two days put in the right order. */
export function rangeOf(a: Date, b: Date): Period {
  const [from, to] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
  return { kind: 'range', from: toDay(from), to: toDay(to) };
}

/** What the server is asked for (month and year, a year, "all", or from and to). */
export function periodParams(p: Period): Record<string, string | number> {
  switch (p.kind) {
    case 'month': return { month: p.month, year: p.year };
    case 'year': return { year: p.year };
    case 'all': return { all: 'true' };
    case 'range': return { from: p.from, to: p.to };
  }
}

/** The first and last day of a period (null for "all"), for screens that filter by dates. */
export function periodDays(p: Period): { from: string; to: string } | null {
  switch (p.kind) {
    case 'month': return { from: toDay(new Date(p.year, p.month - 1, 1)), to: toDay(new Date(p.year, p.month, 0)) };
    case 'year': return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
    case 'all': return null;
    case 'range': return { from: p.from, to: p.to };
  }
}

/** What "See all" carries to History. */
export function historyParams(p: Period): Record<string, string> {
  const days = periodDays(p);
  return days ? { from: days.from, to: days.to } : { all: 'true' };
}

export const periodKey = (p: Period): string =>
  p.kind === 'month' ? `m${p.year}-${p.month}` : p.kind === 'year' ? `y${p.year}` : p.kind === 'all' ? 'all' : `r${p.from}~${p.to}`;

export const samePeriod = (a: Period, b: Period) => periodKey(a) === periodKey(b);

/** True only for exactly this calendar month (the budget belongs to a month, so it is shown for this one only). */
export const isThisMonth = (p: Period, now = new Date()): boolean =>
  p.kind === 'month' && p.month === now.getMonth() + 1 && p.year === now.getFullYear();

export interface LabelEnv {
  /** "October" or "October 2026". */
  month: (year: number, month: number, withYear: boolean) => string;
  /** "5 Oct" or "5 Oct 2026". */
  day: (d: Date, withYear: boolean) => string;
  t: (key: 'period.all' | 'period.year', vars?: Record<string, string | number>) => string;
}

/** The short name of a period, as it appears on the pill: "October", "March 2025", "Year 2026", "All time", "5 Oct – 9 Oct". */
export function periodLabel(p: Period, env: LabelEnv, now = new Date()): string {
  switch (p.kind) {
    case 'month': return env.month(p.year, p.month, p.year !== now.getFullYear());
    case 'year': return env.t('period.year', { year: p.year });
    case 'all': return env.t('period.all');
    case 'range': {
      const a = fromDay(p.from), b = fromDay(p.to);
      if (!a || !b) return `${p.from} – ${p.to}`;
      const withYear = a.getFullYear() !== now.getFullYear() || b.getFullYear() !== now.getFullYear();
      return a.getTime() === b.getTime() ? env.day(a, withYear) : `${env.day(a, withYear)} – ${env.day(b, withYear)}`;
    }
  }
}

/** Twelve months of a year, for the month grid. */
export const monthsOf = (year: number) => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year }));

/** The years worth offering: from the earliest data (or five years back) to this year. */
export function yearChoices(now = new Date(), back = 5): number[] {
  const y = now.getFullYear();
  return Array.from({ length: back + 1 }, (_, i) => y - i);
}

/** Reads a stored period back (a period kept between visits) and refuses anything that is not one. */
export function parseStoredPeriod(raw: unknown): Period | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.kind === 'all') return { kind: 'all' };
  if (p.kind === 'year' && Number.isInteger(p.year)) return { kind: 'year', year: p.year as number };
  if (p.kind === 'month' && Number.isInteger(p.year) && Number.isInteger(p.month) && (p.month as number) >= 1 && (p.month as number) <= 12) return { kind: 'month', month: p.month as number, year: p.year as number };
  if (p.kind === 'range' && typeof p.from === 'string' && typeof p.to === 'string' && fromDay(p.from) && fromDay(p.to)) return { kind: 'range', from: p.from, to: p.to };
  return null;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

/** The month, year or range just before (-1) or after (+1) this one. "All time" has no neighbours. */
export function shiftPeriod(p: Period, by: -1 | 1): Period | null {
  switch (p.kind) {
    case 'month': { const d = new Date(p.year, p.month - 1 + by, 1); return { kind: 'month', month: d.getMonth() + 1, year: d.getFullYear() }; }
    case 'year': return { kind: 'year', year: p.year + by };
    case 'all': return null;
    case 'range': {
      const a = fromDay(p.from), b = fromDay(p.to);
      if (!a || !b) return null;
      const span = daysBetween(a, b) + 1;
      return { kind: 'range', from: toDay(addDays(a, span * by)), to: toDay(addDays(b, span * by)) };
    }
  }
}

/** Whether the next period has started already (the future has nothing to show, except what is scheduled). */
export function canGoNext(p: Period, now = new Date()): boolean {
  const next = shiftPeriod(p, 1);
  if (!next) return false;
  const first = next.kind === 'month' ? new Date(next.year, next.month - 1, 1) : next.kind === 'year' ? new Date(next.year, 0, 1) : next.kind === 'range' ? fromDay(next.from) : null;
  return !!first && first.getTime() <= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// ── The quick choices of the period picker (History) ─────────────────────────

export type PresetId = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear' | 'lastYear' | 'allTime';
export const PRESET_IDS: PresetId[] = ['today', 'yesterday', 'last7', 'last30', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisQuarter', 'thisYear', 'lastYear', 'allTime'];

const startOfWeek = (d: Date, weekStart: 'monday' | 'sunday') => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() - (weekStart === 'monday' ? 1 : 0) + 7) % 7));

/** What a quick choice means today. The week starts on the day the person chose. */
export function presetPeriod(id: PresetId, now = new Date(), weekStart: 'monday' | 'sunday' = 'monday'): Period {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const range = (a: Date, b: Date): Period => ({ kind: 'range', from: toDay(a), to: toDay(b) });
  switch (id) {
    case 'today': return range(today, today);
    case 'yesterday': return range(addDays(today, -1), addDays(today, -1));
    case 'last7': return range(addDays(today, -6), today);
    case 'last30': return range(addDays(today, -29), today);
    case 'thisWeek': { const s = startOfWeek(today, weekStart); return range(s, addDays(s, 6)); }
    case 'lastWeek': { const s = addDays(startOfWeek(today, weekStart), -7); return range(s, addDays(s, 6)); }
    case 'thisMonth': return thisMonth(now);
    case 'lastMonth': return lastMonth(now);
    case 'thisQuarter': { const q = Math.floor(today.getMonth() / 3) * 3; return range(new Date(today.getFullYear(), q, 1), new Date(today.getFullYear(), q + 3, 0)); }
    case 'thisYear': return { kind: 'year', year: now.getFullYear() };
    case 'lastYear': return { kind: 'year', year: now.getFullYear() - 1 };
    case 'allTime': return { kind: 'all' };
  }
}

/** Which quick choice a period is, if any (so the pill can say "Last 7 days" instead of two dates). */
export function matchPreset(p: Period, now = new Date(), weekStart: 'monday' | 'sunday' = 'monday'): PresetId | null {
  const key = periodKey(p);
  return PRESET_IDS.find(id => periodKey(presetPeriod(id, now, weekStart)) === key) ?? null;
}

/** Whether today falls inside the period (what is upcoming only matters when it does). */
export function includesToday(p: Period, now = new Date()): boolean {
  if (p.kind === 'all') return true;
  const today = toDay(now);
  if (p.kind === 'month') return p.month === now.getMonth() + 1 && p.year === now.getFullYear();
  if (p.kind === 'year') return p.year === now.getFullYear();
  return p.from <= today && today <= p.to;
}
