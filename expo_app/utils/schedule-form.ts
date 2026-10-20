import type { CategorySlug } from '@/services/transaction.service';
import type { CreateScheduledInput, ScheduleMode } from '@/services/scheduled.service';
import type { RepeatRule } from '@/utils/recurrence';

/** A date this close to now is still "now": it is an ordinary transaction, not a scheduled one. */
export const SCHEDULE_GRACE_MS = 5 * 60_000;

/**
 * A transaction becomes a scheduled one when its date is in the future or it repeats.
 * (Same rule as the approved prototype, and the server's own limits.)
 */
export const isScheduledForm = (date: Date, rule: RepeatRule | null, now: Date = new Date()): boolean =>
  !!rule || date.getTime() > now.getTime() + SCHEDULE_GRACE_MS;

/** A scheduled item needs a first date that is not in the past. Returns the problem, or null. */
export function scheduleStartError(date: Date, rule: RepeatRule | null, now: Date = new Date()): 'past' | null {
  if (!isScheduledForm(date, rule, now)) return null;
  return date.getTime() < now.getTime() - SCHEDULE_GRACE_MS ? 'past' : null;
}

export interface ScheduleFormState {
  kind: 'INCOME' | 'EXPENSE';
  category: CategorySlug;
  title: string;
  description?: string;
  amount: number;
  walletId: string | null;
  date: Date;
  rule: RepeatRule | null;
  mode: ScheduleMode;
  timezone: string;
}

/** What the Add screen sends to the server when the transaction is scheduled. */
export function scheduledPayload(f: ScheduleFormState): CreateScheduledInput {
  return {
    type: f.kind,
    category: f.category,
    title: f.title,
    amount: f.amount,
    description: f.description || undefined,
    walletId: f.walletId ?? undefined,
    startAt: f.date.toISOString(),
    timezone: f.timezone,
    repeat: f.rule,
    mode: f.mode,
  };
}

/** Which of the two Save buttons (and header) to show. */
export const scheduleSaveLabel = (rule: RepeatRule | null): 'sched.saveRepeat' | 'sched.save' => (rule ? 'sched.saveRepeat' : 'sched.save');

/** Two rules mean the same thing (lists compared as sets, since order never matters). */
export function sameRule(a: RepeatRule | null, b: RepeatRule | null): boolean {
  if (!a || !b) return a === b;
  const set = (l: number[]) => [...new Set(l)].sort((x, y) => x - y).join(',');
  return a.unit === b.unit && a.every === b.every && set(a.weekdays) === set(b.weekdays) && set(a.monthDays) === set(b.monthDays)
    && set(a.months) === set(b.months) && JSON.stringify(a.nth) === JSON.stringify(b.nth) && JSON.stringify(a.ends) === JSON.stringify(b.ends);
}
