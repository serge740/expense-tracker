/**
 * The stretch of time Home (and its recent list) is looking at: one month, a year, everything, or a custom range.
 * Dates are the server's local days, like the month figures were before. `to` is exclusive (the day after the last day).
 */
export type PeriodKind = 'month' | 'year' | 'all' | 'range';

export interface Period {
  kind: PeriodKind;
  from: Date | null;
  /** The first moment after the period, or null when it is open-ended. */
  to: Date | null;
  /** The month and year the period starts in (this month for "all"). */
  month: number;
  year: number;
}

export interface PeriodQuery { month?: unknown; year?: unknown; from?: unknown; to?: unknown; all?: unknown }

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_SPAN_DAYS = 366 * 20;

function parseDay(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const m = DAY.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // 2026-02-31 would roll over into March: refuse it.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

const validMonth = (v: unknown) => Number(v) >= 1 && Number(v) <= 12 && Number.isInteger(Number(v));
const validYear = (v: unknown) => Number(v) >= 2000 && Number(v) <= 2100 && Number.isInteger(Number(v));

/** Nothing asked for means no period at all (null): the caller decides what that means. */
export function parsePeriod(q: PeriodQuery, now = new Date()): Period | null {
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  if (q.all === true || q.all === 'true' || q.all === '1') return { kind: 'all', from: null, to: null, month: m, year: y };

  const from = parseDay(q.from);
  const to = parseDay(q.to);
  if (from && to && from <= to && (to.getTime() - from.getTime()) / 86_400_000 <= MAX_SPAN_DAYS) {
    return { kind: 'range', from, to: new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1), month: from.getMonth() + 1, year: from.getFullYear() };
  }
  if (validYear(q.year) && validMonth(q.month)) {
    const yy = Number(q.year), mm = Number(q.month);
    return { kind: 'month', from: new Date(yy, mm - 1, 1), to: new Date(yy, mm, 1), month: mm, year: yy };
  }
  if (validYear(q.year) && (q.month === undefined || q.month === '')) {
    const yy = Number(q.year);
    return { kind: 'year', from: new Date(yy, 0, 1), to: new Date(yy + 1, 0, 1), month: 1, year: yy };
  }
  return null;
}

/** Like parsePeriod, but "nothing asked for" means this month (what Home always did). */
export function periodOrThisMonth(q: PeriodQuery, now = new Date()): Period {
  return parsePeriod(q, now) ?? { kind: 'month', from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1), month: now.getMonth() + 1, year: now.getFullYear() };
}

/** The `date` filter for a period (an empty filter for "all"). */
export function dateFilter(p: Period): { gte?: Date; lt?: Date } {
  return { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lt: p.to } : {}) };
}
