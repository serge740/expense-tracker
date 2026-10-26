// Ported from expo_app/utils/datetime.ts
// Pure date/time helpers for DateTimeSheet. No React, no native modules: unit-testable.

export type PickerMode = 'date' | 'time' | 'datetime';

const MS_MIN = 60_000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** Calendar day of `day` with the time of `base`. */
export function withDay(base: Date, day: Date): Date {
  const x = new Date(base);
  x.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return x;
}

/** Time of `time` on the calendar day of `base`. */
export function withTime(base: Date, time: Date): Date {
  const x = new Date(base);
  x.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return x;
}

/** Same day-of-month `n` months later; the 31st clamps to the last day of shorter months. */
export function addMonthsClamped(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds());
  target.setDate(Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth())));
  return target;
}

/** Round up to the next multiple of `step` minutes (seconds dropped). */
export function ceilToStep(d: Date, step: number): Date {
  const x = new Date(d);
  const hadSeconds = x.getSeconds() > 0 || x.getMilliseconds() > 0;
  x.setSeconds(0, 0);
  const rest = x.getMinutes() % step;
  if (rest) x.setMinutes(x.getMinutes() + (step - rest));
  else if (hadSeconds && d.getTime() > x.getTime()) x.setMinutes(x.getMinutes() + step);
  return x;
}

/** Round to the nearest multiple of `step` minutes; carries into the hour. */
export function roundToStep(d: Date, step: number): Date {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const m = x.getMinutes();
  x.setMinutes(Math.round(m / step) * step);
  return x;
}

/** First `weekday` (0 = Sunday) strictly after `from`, at 00:00. */
export function nextWeekday(from: Date, weekday: number): Date {
  const d = startOfDay(from);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() !== weekday);
  return d;
}

export const lastDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

// ── Calendar ─────────────────────────────────────────────────────────────────
export interface CalendarCell { day: number; month: number; year: number; current: boolean }

/** 6 × 7 grid starting on Sunday; leading/trailing cells belong to the neighbouring months. */
export function buildCalendar(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1).getDay();
  const dim = daysInMonth(year, month);
  const prev = new Date(year, month, 0);
  const next = new Date(year, month + 1, 1);
  const cells: CalendarCell[] = [];
  for (let i = first - 1; i >= 0; i--) cells.push({ day: prev.getDate() - i, month: prev.getMonth(), year: prev.getFullYear(), current: false });
  for (let d = 1; d <= dim; d++) cells.push({ day: d, month, year, current: true });
  for (let d = 1; cells.length < 42; d++) cells.push({ day: d, month: next.getMonth(), year: next.getFullYear(), current: false });
  return cells;
}

/** Consecutive days from `start`; the selected day is added if it falls outside the range. */
export function buildDayStrip(start: Date, count: number, selected: Date): Date[] {
  const days = Array.from({ length: count }, (_, i) => addDays(startOfDay(start), i));
  if (selected < days[0] && !sameDay(selected, days[0])) days.unshift(startOfDay(selected));
  else if (selected > endOfDay(days[days.length - 1])) days.push(startOfDay(selected));
  return days;
}

// ── Range rules ──────────────────────────────────────────────────────────────
export type RangeError = 'min' | 'max' | null;

/** Date-only values are judged by calendar day, date-times by the exact instant. Time-of-day has no range. */
export function rangeError(sel: Date, mode: PickerMode, min?: Date | null, max?: Date | null): RangeError {
  if (mode === 'time') return null;
  const lo = mode === 'date' ? endOfDay(sel) : sel;
  const hi = mode === 'date' ? startOfDay(sel) : sel;
  if (min && lo < min) return 'min';
  if (max && hi > max) return 'max';
  return null;
}

export const isDayDisabled = (day: Date, min?: Date | null, max?: Date | null) =>
  (!!min && endOfDay(day) < min) || (!!max && startOfDay(day) > max);

// ── Wheels ───────────────────────────────────────────────────────────────────
export interface WheelOpts { hour12: boolean; step: number }
export interface WheelIndexes { h: number; m: number; p: number }

export const minuteValues = (step: number) => Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);

export function wheelIndexes(d: Date, { hour12, step }: WheelOpts): WheelIndexes {
  const h = d.getHours();
  const mins = minuteValues(step);
  return {
    h: hour12 ? (h % 12 || 12) - 1 : h,
    m: Math.min(mins.length - 1, Math.round(d.getMinutes() / step)),
    p: h >= 12 ? 1 : 0,
  };
}

/** Result of scrolling one wheel (`h` hour, `m` minute, `p` AM/PM) to `idx`. */
export function applyWheel(d: Date, kind: 'h' | 'm' | 'p', idx: number, { hour12, step }: WheelOpts): Date {
  const x = new Date(d);
  if (kind === 'm') x.setMinutes(idx * step);
  else if (kind === 'h') x.setHours(hour12 ? ((idx + 1) % 12) + (d.getHours() >= 12 ? 12 : 0) : idx);
  else x.setHours((d.getHours() % 12) + (idx ? 12 : 0));
  x.setSeconds(0, 0);
  return x;
}

// ── Relative time ────────────────────────────────────────────────────────────
export interface RelativeParts { dir: 'in' | 'ago' | 'now'; days: number; hours: number; minutes: number }

export function relativeParts(target: Date, now = new Date()): RelativeParts {
  const diff = target.getTime() - now.getTime();
  const mins = Math.round(Math.abs(diff) / MS_MIN);
  if (mins < 1) return { dir: 'now', days: 0, hours: 0, minutes: 0 };
  return { dir: diff > 0 ? 'in' : 'ago', days: Math.floor(mins / 1440), hours: Math.floor((mins % 1440) / 60), minutes: mins % 60 };
}

/** Whole calendar days from today to `target` (negative = past). */
export const dayDelta = (target: Date, now = new Date()) =>
  Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / 86_400_000);

// ── Quick picks ──────────────────────────────────────────────────────────────
export type PresetId =
  | 'today' | 'tomorrow' | 'nextMonday' | 'inWeek' | 'endOfMonth' | 'inMonth'
  | 'now' | 'at9' | 'at12' | 'at15' | 'at18' | 'at20'
  | 'in10' | 'in30' | 'in1h' | 'tonight' | 'tomorrow9' | 'nextMon9';
export interface Preset { id: PresetId; date: Date }

export function buildPresets(mode: PickerMode, now: Date, sel: Date, step: number): Preset[] {
  const at = (d: Date, h: number, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
  const nextMon = nextWeekday(now, 1);
  if (mode === 'date') {
    return [
      { id: 'today', date: startOfDay(now) },
      { id: 'tomorrow', date: addDays(startOfDay(now), 1) },
      { id: 'nextMonday', date: nextMon },
      { id: 'inWeek', date: addDays(startOfDay(now), 7) },
      { id: 'endOfMonth', date: lastDayOfMonth(now) },
      { id: 'inMonth', date: startOfDay(addMonthsClamped(now, 1)) },
    ];
  }
  if (mode === 'time') {
    return [
      { id: 'now', date: ceilToStep(now, step) },
      { id: 'at9', date: at(sel, 9) }, { id: 'at12', date: at(sel, 12) },
      { id: 'at15', date: at(sel, 15) }, { id: 'at18', date: at(sel, 18) }, { id: 'at20', date: at(sel, 20) },
    ];
  }
  return [
    { id: 'in10', date: ceilToStep(new Date(now.getTime() + 10 * MS_MIN), step) },
    { id: 'in30', date: ceilToStep(new Date(now.getTime() + 30 * MS_MIN), step) },
    { id: 'in1h', date: ceilToStep(new Date(now.getTime() + 60 * MS_MIN), step) },
    { id: 'tonight', date: at(now, 20) },
    { id: 'tomorrow9', date: at(addDays(now, 1), 9) },
    { id: 'nextMon9', date: at(nextMon, 9) },
  ];
}

export function isPresetActive(p: Preset, mode: PickerMode, sel: Date): boolean {
  if (mode === 'date') return sameDay(p.date, sel);
  if (mode === 'time') return p.date.getHours() === sel.getHours() && p.date.getMinutes() === sel.getMinutes();
  return Math.abs(p.date.getTime() - sel.getTime()) < 30_000;
}

export function isPresetDisabled(p: Preset, mode: PickerMode, min?: Date | null, max?: Date | null): boolean {
  if (mode === 'time') return false;
  return rangeError(p.date, mode, min, max) !== null;
}

/** "GMT+2" / "GMT+5:30" for the device's current offset. */
export function gmtOffsetLabel(now = new Date()): string {
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '−';
  const h = Math.floor(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}
