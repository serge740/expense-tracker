/**
 * Pure rules for when a reminder fires. No database, no clock reads (callers pass `now`),
 * so every rule here is unit-tested. All "local" maths uses the person's IANA time zone.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ── Time zones (Intl only, no extra library) ────────────────────────────────

export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export interface LocalParts { y: number; m: number; d: number; h: number; mi: number }

/** Wall-clock parts of an instant in a time zone. */
export function localParts(at: Date, tz: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute') };
}

/** Minutes the zone is ahead of UTC at an instant (DST aware). */
export function tzOffsetMinutes(at: Date, tz: string): number {
  const p = localParts(at, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  return Math.round((asUtc - Math.floor(at.getTime() / MIN) * MIN) / MIN);
}

/** The instant at which a zone's wall clock shows these parts. */
export function zonedToUtc(p: LocalParts, tz: string): Date {
  const guess = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  let ms = guess - tzOffsetMinutes(new Date(guess), tz) * MIN;
  // The offset may differ at the corrected instant (around a DST change): settle once more.
  ms = guess - tzOffsetMinutes(new Date(ms), tz) * MIN;
  return new Date(ms);
}

/** Same wall-clock time `n` calendar days later (so "9:00 daily" stays 9:00 across a DST change). */
export function addLocalDays(at: Date, n: number, tz: string): Date {
  const p = localParts(at, tz);
  const shifted = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return zonedToUtc({ y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate(), h: p.h, mi: p.mi }, tz);
}

// ── Reminder timeline ───────────────────────────────────────────────────────

export type StepKind = 'LEAD_DAY' | 'LEAD_HOUR' | 'DUE' | 'LATE_30M' | 'LATE_2H' | 'LATE_DAY';

export interface LadderStep {
  index: number;
  kind: StepKind;
  at: Date;
  /** Email goes out at the first lead, at due time and once a day when overdue; never on every re-fire. */
  email: boolean;
}

/** How many daily nudges follow the due time. */
export const OVERDUE_DAYS = 7;
/** Index of the "at due time" step. */
export const DUE_INDEX = 2;

/**
 * The full timeline of one pay date: 1 day before, 1 hour before, at due time,
 * +30 min, +2 h, then once a day (same local time) for 7 days. 12 steps.
 */
export function buildLadder(dueAt: Date, tz: string): LadderStep[] {
  const steps: Omit<LadderStep, 'index'>[] = [
    { kind: 'LEAD_DAY',  at: new Date(dueAt.getTime() - DAY),  email: true },
    { kind: 'LEAD_HOUR', at: new Date(dueAt.getTime() - HOUR), email: false },
    { kind: 'DUE',       at: dueAt,                            email: true },
    { kind: 'LATE_30M',  at: new Date(dueAt.getTime() + 30 * MIN), email: false },
    { kind: 'LATE_2H',   at: new Date(dueAt.getTime() + 2 * HOUR), email: false },
  ];
  for (let d = 1; d <= OVERDUE_DAYS; d++) steps.push({ kind: 'LATE_DAY', at: addLocalDays(dueAt, d, tz), email: true });
  return steps.map((s, index) => ({ ...s, index }));
}

export interface Plan { step: number; at: Date }

/**
 * Where a brand-new reminder starts. Lead steps that already passed are skipped silently;
 * a pay date that is already overdue fires once straight away.
 */
export function startPlan(ladder: LadderStep[], now: Date): Plan | null {
  const passed = ladder.filter(s => s.at.getTime() <= now.getTime());
  if (passed.length === 0) return { step: 0, at: ladder[0].at };
  const last = passed[passed.length - 1];
  if (last.index >= DUE_INDEX) return { step: last.index, at: now };
  const next = ladder[last.index + 1];
  return next ? { step: next.index, at: next.at } : null;
}

/**
 * The step after one that just fired. Steps already in the past (the server was down) are
 * skipped, so downtime never causes a burst: at most one fire per reminder per tick.
 * Returns null when the timeline is finished.
 */
export function advance(ladder: LadderStep[], firedStep: number, now: Date): Plan | null {
  for (let i = firedStep + 1; i < ladder.length; i++) {
    if (ladder[i].at.getTime() > now.getTime()) return { step: i, at: ladder[i].at };
  }
  return null;
}

// ── Snooze ──────────────────────────────────────────────────────────────────

export const SNOOZE_PRESETS_MIN = [10, 30, 60, 1440, 10080] as const;
const MAX_SNOOZE_MS = 365 * DAY;

export type SnoozeInput = { minutes: number } | { until: Date };

/** When a snoozed reminder should fire again. Throws a readable message on bad input. */
export function snoozeTarget(now: Date, input: SnoozeInput): Date {
  let at: Date;
  if ('minutes' in input) {
    if (!(SNOOZE_PRESETS_MIN as readonly number[]).includes(input.minutes)) {
      throw new Error('Choose 10 min, 30 min, 1 hour, 1 day or 1 week, or pick a date');
    }
    at = new Date(now.getTime() + input.minutes * MIN);
  } else {
    at = input.until;
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw new Error('Choose a valid date and time');
    if (at.getTime() < now.getTime() + MIN) throw new Error('Pick a time in the future');
    if (at.getTime() > now.getTime() + MAX_SNOOZE_MS) throw new Error('That is too far away');
  }
  return at;
}

// ── Quiet hours ─────────────────────────────────────────────────────────────

export interface QuietHours { enabled: boolean; start: string; end: string; tz: string }

const toMinutes = (hhmm: string) => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`Bad time "${hhmm}", use HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
};

export const isValidClock = (hhmm: string) => /^([01]?\d|2[0-3]):([0-5]\d)$/.test(hhmm);

/** True when the person's local clock at `at` is inside their quiet window (which may cross midnight). */
export function inQuietHours(at: Date, q: QuietHours): boolean {
  if (!q.enabled) return false;
  const s = toMinutes(q.start), e = toMinutes(q.end);
  if (s === e) return false;
  const p = localParts(at, q.tz);
  const now = p.h * 60 + p.mi;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** The first instant at or after `at` that is outside quiet hours. */
export function quietEnd(at: Date, q: QuietHours): Date {
  if (!inQuietHours(at, q)) return at;
  const e = toMinutes(q.end);
  const p = localParts(at, q.tz);
  const nowMin = p.h * 60 + p.mi;
  // Past midnight but before the end → today; before midnight → tomorrow.
  const dayOffset = nowMin < e ? 0 : 1;
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d + dayOffset));
  return zonedToUtc({ y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), h: Math.floor(e / 60), mi: e % 60 }, q.tz);
}

// ── Caps and digests ────────────────────────────────────────────────────────

/** Pushes in the rolling last 24 hours are limited per person so a bad day never becomes a storm. */
export const canPush = (sentLast24h: number, cap: number) => sentLast24h < cap;

/** Three or more reminders for one person in the same tick are sent as a single digest push. */
export const DIGEST_FROM = 3;
export const shouldDigest = (dueNow: number) => dueNow >= DIGEST_FROM;
