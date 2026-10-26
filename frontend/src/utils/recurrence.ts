// Ported from expo_app/utils/recurrence.ts
/**
 * Recurrence engine for scheduled transactions. Pure and dependency-free: the SAME file is used by the
 * app (previews) and the server (real posting), so what you see is what happens.
 *
 * It works on wall-clock values ("9:00 on 20 Oct 2026"), never on instants. The caller turns a wall-clock
 * value into a real moment in the right time zone (the phone's zone in the app, the person's zone on the
 * server), which is what keeps "9:00" at 9:00 across daylight-saving changes.
 *
 * Rules (decided in the design review):
 *  - the interval is counted from the first date that really matches, not from the raw start;
 *  - the 31st clamps to the last day of shorter months, Feb 29 falls on Feb 28 in non-leap years;
 *  - weekdays are 0 = Sunday … 6 = Saturday, months 1 … 12, monthDays 1 … 31 or -1 = last day.
 */

export type Unit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
export type Ends = { type: 'never' } | { type: 'on'; date: string /* YYYY-MM-DD, inclusive */ } | { type: 'after'; count: number };

export interface RepeatRule {
  unit: Unit;
  every: number;
  weekdays: number[];
  monthDays: number[];
  /** "the 2nd Friday" (n = 1…4, or -1 for the last). Used instead of monthDays for MONTH. */
  nth: { n: number; weekday: number } | null;
  months: number[];
  ends: Ends;
}

/** A wall-clock moment. `m` is 1…12. */
export interface Wall { y: number; m: number; d: number; h: number; mi: number }

// ── Calendar helpers (UTC arithmetic used only as a calendar, never as a time zone) ─────────────

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const weekdayOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const stamp = (w: Wall) => Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi);
export const compareWall = (a: Wall, b: Wall) => stamp(a) - stamp(b);

function shiftDays(w: Wall, n: number): Wall {
  const t = new Date(Date.UTC(w.y, w.m - 1, w.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: w.h, mi: w.mi };
}

const monthOffset = (y: number, m: number, k: number) => {
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
};

/** Day of the month of the n-th (1…4) or last (-1) given weekday, or null if that month has no such day. */
export function nthWeekday(y: number, m: number, n: number, weekday: number): number | null {
  const dim = daysInMonth(y, m);
  if (n === -1) return dim - ((weekdayOf(y, m, dim) - weekday + 7) % 7);
  const day = 1 + ((weekday - weekdayOf(y, m, 1) + 7) % 7) + (n - 1) * 7;
  return day <= dim ? day : null;
}

/** The days of one calendar month the rule lands on, sorted, with clamping applied. */
export function monthDaysIn(y: number, m: number, rule: RepeatRule, start: Wall): number[] {
  const dim = daysInMonth(y, m);
  const out = new Set<number>();
  if (rule.nth) {
    const d = nthWeekday(y, m, rule.nth.n, rule.nth.weekday);
    if (d) out.add(d);
  } else {
    (rule.monthDays.length ? rule.monthDays : [start.d]).forEach(md => out.add(md === -1 ? dim : Math.min(md, dim)));
  }
  return [...out].sort((a, b) => a - b);
}

// ── Validation ──────────────────────────────────────────────────────────────

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** A readable reason the rule is not usable, or null when it is fine. Used by the server for every request. */
export function ruleProblem(rule: unknown): string | null {
  if (rule === null || rule === undefined) return null;
  const r = rule as Partial<RepeatRule>;
  if (typeof rule !== 'object') return 'Repeat rule is not valid';
  if (!['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(r.unit as string)) return 'Choose daily, weekly, monthly or yearly';
  if (!isInt(r.every) || r.every < 1 || r.every > 99) return 'Repeat interval must be between 1 and 99';
  const arr = (a: unknown, ok: (n: number) => boolean) => Array.isArray(a) && a.every(x => isInt(x) && ok(x));
  if (!arr(r.weekdays, n => n >= 0 && n <= 6)) return 'Weekdays must be 0 (Sunday) to 6 (Saturday)';
  if (!arr(r.monthDays, n => n === -1 || (n >= 1 && n <= 31))) return 'Days of the month must be 1 to 31 or the last day';
  if (!arr(r.months, n => n >= 1 && n <= 12)) return 'Months must be 1 to 12';
  if (r.nth !== null) {
    const n = r.nth as RepeatRule['nth'];
    if (!n || ![1, 2, 3, 4, -1].includes(n.n) || !isInt(n.weekday) || n.weekday < 0 || n.weekday > 6) return 'Choose which weekday of the month';
    if (r.unit !== 'MONTH') return 'A weekday of the month only works for monthly repeats';
  }
  const e = r.ends as Ends | undefined;
  if (!e || !['never', 'on', 'after'].includes(e.type)) return 'Choose when the repeat ends';
  if (e.type === 'after' && (!isInt(e.count) || e.count < 1 || e.count > 999)) return 'Number of times must be between 1 and 999';
  if (e.type === 'on' && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return 'Choose a valid end date';
  return null;
}

/** Same rule with sorted, de-duplicated lists, so equal rules compare equal. */
export function normalizeRule(rule: RepeatRule): RepeatRule {
  const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => (x === -1 ? 99 : x) - (y === -1 ? 99 : y));
  return { ...rule, weekdays: uniq(rule.weekdays), monthDays: uniq(rule.monthDays), months: uniq(rule.months) };
}

// ── The engine ──────────────────────────────────────────────────────────────

/**
 * The next `max` dates on or after `from`, in order. `start` is the first date and time (also fixing the
 * time of day). `from` only hides earlier dates: they still count toward "after N times".
 * A null rule is a one-time item.
 */
export function occurrences(rule: RepeatRule | null, start: Wall, max = 5, from: Wall = start): Wall[] {
  if (!rule) return compareWall(start, from) >= 0 ? [start] : [];

  const out: Wall[] = [];
  let produced = 0;
  const every = Math.max(1, rule.every || 1);
  const stopDay = rule.ends.type === 'on' ? rule.ends.date : null;
  const limit = rule.ends.type === 'after' ? rule.ends.count : Infinity;
  const dayKey = (w: Wall) => `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
  const wall = (y: number, m: number, d: number): Wall => ({ y, m, d, h: start.h, mi: start.mi });

  /** Returns false when we should stop. */
  const push = (d: Wall): boolean => {
    if (compareWall(d, start) < 0) return true;
    if (stopDay && dayKey(d) > stopDay) return false;
    if (produced >= limit) return false;
    produced++;
    if (compareWall(d, from) >= 0) out.push(d);
    return out.length < max;
  };

  let guard = 0;
  if (rule.unit === 'DAY') {
    for (let k = 0; guard++ < 5000; k++) if (!push(shiftDays(start, k * every))) break;
  } else if (rule.unit === 'WEEK') {
    const wds = [...(rule.weekdays.length ? rule.weekdays : [weekdayOf(start.y, start.m, start.d)])].sort((a, b) => a - b);
    // The interval is counted from the first matching day: "every 2 weeks on Monday", started on a Tuesday,
    // means the next Monday, then every 2 weeks.
    let anchor = start;
    for (let i = 0; i < 7 && !wds.includes(weekdayOf(anchor.y, anchor.m, anchor.d)); i++) anchor = shiftDays(anchor, 1);
    const week0 = shiftDays(anchor, -weekdayOf(anchor.y, anchor.m, anchor.d));
    outer: for (let k = 0; guard++ < 5000; k++) {
      for (const wd of wds) {
        const d = shiftDays(week0, k * 7 * every + wd);
        if (compareWall(d, start) < 0) continue;
        if (!push(d)) break outer;
      }
    }
  } else if (rule.unit === 'MONTH') {
    // The interval is counted from the first month that really has a date on or after the start.
    const hasDate = (y: number, m: number) => monthDaysIn(y, m, rule, start).some(day => compareWall(wall(y, m, day), start) >= 0);
    const off = hasDate(start.y, start.m) ? 0 : 1;
    outer: for (let k = 0; guard++ < 2000; k++) {
      const b = monthOffset(start.y, start.m, off + k * every);
      for (const day of monthDaysIn(b.y, b.m, rule, start)) if (!push(wall(b.y, b.m, day))) break outer;
    }
  } else {
    const months = [...(rule.months.length ? rule.months : [start.m])].sort((a, b) => a - b);
    const yearHas = (y: number) => months.some(mo => monthDaysIn(y, mo, rule, start).some(day => compareWall(wall(y, mo, day), start) >= 0));
    const yOff = yearHas(start.y) ? 0 : 1;
    outer: for (let k = 0; guard++ < 500; k++) {
      const y = start.y + yOff + k * every;
      for (const mo of months) for (const day of monthDaysIn(y, mo, rule, start)) if (!push(wall(y, mo, day))) break outer;
    }
  }
  return out;
}

// ── Conversions for the phone (local time zone) ─────────────────────────────

export const wallOfDate = (d: Date): Wall => ({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes() });
export const dateOfWall = (w: Wall): Date => new Date(w.y, w.m - 1, w.d, w.h, w.mi, 0, 0);

/** The rule a new Repeat editor starts from. */
export const blankRule = (unit: Unit = 'WEEK'): RepeatRule => ({
  unit, every: 1, weekdays: [], monthDays: [], nth: null, months: [], ends: { type: 'never' },
});
