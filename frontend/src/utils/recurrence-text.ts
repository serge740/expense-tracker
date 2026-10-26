// Ported from expo_app/utils/recurrence-text.ts
import type { StringKey } from '@/i18n/strings';
import { RepeatRule, Wall, weekdayOf } from '@/utils/recurrence';

type T = (key: StringKey, vars?: Record<string, string | number>) => string;

export interface TextEnv {
  t: T;
  /** BCP-47 locale for names of days, months and times (e.g. "fr-FR"). */
  locale: string;
  language: 'en' | 'fr' | 'rw' | 'sw';
}

/** "Tuesday", from 0 = Sunday. (4 Jan 2026 was a Sunday.) */
export function weekdayName(wd: number, locale: string, style: 'long' | 'short' | 'narrow' = 'long'): string {
  try { return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + wd))); }
  catch { return new Intl.DateTimeFormat('en-US', { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + wd))); }
}

/** "March", from 1…12. */
export function monthName(m: number, locale: string, style: 'long' | 'short' = 'long'): string {
  try { return new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 1))); }
  catch { return new Intl.DateTimeFormat('en-US', { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 1))); }
}

/** "9:00 AM" in the person's locale. */
export function timeText(w: Wall, locale: string): string {
  const d = new Date(Date.UTC(2026, 0, 1, w.h, w.mi));
  try { return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(d); }
  catch { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(d); }
}

export function dateText(w: Pick<Wall, 'y' | 'm' | 'd'>, locale: string, withWeekday = false): string {
  const d = new Date(Date.UTC(w.y, w.m - 1, w.d));
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...(withWeekday ? { weekday: 'short' } : {}) };
  try { return new Intl.DateTimeFormat(locale, opts).format(d); } catch { return new Intl.DateTimeFormat('en-US', opts).format(d); }
}

/** 1 → "1st" / "1er" / "1", and -1 → "last day". */
export function dayOrdinal(n: number, env: TextEnv): string {
  if (n === -1) return env.t('rep.lastDay');
  if (env.language === 'en') {
    const v = n % 100;
    const suffix = v >= 11 && v <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
  }
  if (env.language === 'fr') return n === 1 ? '1er' : String(n);
  return String(n);
}

const ORD_KEY: Record<number, StringKey> = { 1: 'rep.ord1', 2: 'rep.ord2', 3: 'rep.ord3', 4: 'rep.ord4', [-1]: 'rep.ordLast' };

function list(items: string[], env: TextEnv): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')}${env.t('rep.and')}${items[items.length - 1]}`;
}

const byDay = (a: number, b: number) => (a === -1 ? 99 : a) - (b === -1 ? 99 : b);

/** The rule in words: "Every Tuesday and Friday at 9:00 AM, until 31 Dec 2027". */
export function describeRule(rule: RepeatRule | null, start: Wall, env: TextEnv): string {
  const { t, locale } = env;
  if (!rule) return t('rep.never');
  const n = rule.every || 1;
  const days = (rule.monthDays.length ? rule.monthDays : [start.d]).slice().sort(byDay).map(d => dayOrdinal(d, env));

  let what: string;
  if (rule.unit === 'DAY') {
    what = n === 1 ? t('rep.everyDay') : t('rep.everyNDays', { n });
  } else if (rule.unit === 'WEEK') {
    const wds = (rule.weekdays.length ? rule.weekdays : [weekdayOf(start.y, start.m, start.d)]).slice().sort((a, b) => a - b);
    const names = list(wds.map(d => weekdayName(d, locale)), env);
    what = n === 1 ? t('rep.everyWeekOn', { days: names }) : t('rep.everyNWeeksOn', { n, days: names });
  } else if (rule.unit === 'MONTH') {
    if (rule.nth) {
      const vars = { n, ord: t(ORD_KEY[rule.nth.n]), weekday: weekdayName(rule.nth.weekday, locale) };
      what = n === 1 ? t('rep.monthNth', vars) : t('rep.nMonthsNth', vars);
    } else {
      what = n === 1 ? t('rep.everyMonthOn', { days: list(days, env) }) : t('rep.everyNMonthsOn', { n, days: list(days, env) });
    }
  } else {
    const months = (rule.months.length ? rule.months : [start.m]).slice().sort((a, b) => a - b).map(m => monthName(m, locale));
    const vars = { n, months: list(months, env), days: list(days, env) };
    what = n === 1 ? t('rep.yearIn', vars) : t('rep.nYearsIn', vars);
  }

  let text = t('rep.at', { what, time: timeText(start, locale) });
  if (rule.ends.type === 'on') {
    const [y, m, d] = rule.ends.date.split('-').map(Number);
    text += t('rep.until', { date: dateText({ y, m, d }, locale) });
  } else if (rule.ends.type === 'after') {
    text += rule.ends.count === 1 ? t('rep.onceOnly') : t('rep.times', { n: rule.ends.count });
  }
  return text;
}

/** The wall-clock reading of an instant in an IANA zone (what the schedule's rule is worked out in). */
export function wallInZone(at: Date, tz: string): Wall {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at);
  }
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute') };
}
