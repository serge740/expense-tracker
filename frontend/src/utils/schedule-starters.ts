import { blankRule, type RepeatRule } from '@/utils/recurrence';
import type { StringKey } from '@/i18n/strings';

/**
 * One-tap starting points on Home ("Plan a schedule"): each opens the Add form already filled in, so a good
 * schedule is two taps away. A starter with a `route` goes to another screen instead (a loan's pay dates live there).
 */
export type StarterId = 'rent' | 'salary' | 'airtime' | 'subscription' | 'once' | 'loan';

export interface Starter {
  id: StarterId;
  icon: string;
  label: StringKey;
  type?: 'INCOME' | 'EXPENSE';
  category?: string;
  sub?: string;
  title?: string;
  route?: string;
}

export const STARTERS: Starter[] = [
  { id: 'rent', icon: 'home', label: 'plan.rent', type: 'EXPENSE', category: 'bills', sub: 'Rent', title: 'House rent' },
  { id: 'salary', icon: 'work', label: 'plan.salary', type: 'INCOME', category: 'salary', sub: 'Monthly salary', title: 'Salary' },
  { id: 'airtime', icon: 'phone-android', label: 'plan.airtime', type: 'EXPENSE', category: 'bills', sub: 'Airtime', title: 'Airtime' },
  { id: 'subscription', icon: 'subscriptions', label: 'plan.subscription', type: 'EXPENSE', category: 'entertainment', sub: 'Netflix', title: 'Subscription' },
  { id: 'once', icon: 'event', label: 'plan.once', type: 'EXPENSE', category: 'other', title: '' },
  { id: 'loan', icon: 'handshake', label: 'plan.loan', route: '/(dashboard)/debts' },
];

const at9 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0, 0);

/** The next time that day-of-month comes (this month if it is still ahead, else next month); the 31st is kept to the month's end. */
export function nextDayOfMonth(day: number, now = new Date()): Date {
  const pick = (y: number, m: number) => at9(new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate())));
  const here = pick(now.getFullYear(), now.getMonth());
  return here.getTime() > now.getTime() ? here : pick(now.getFullYear(), now.getMonth() + 1);
}

/** The next time that weekday (0 Sunday … 6 Saturday) comes, never today. */
export function nextWeekday(weekday: number, now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return at9(d);
}

const monthlyOn = (day: number): RepeatRule => ({ ...blankRule('MONTH'), unit: 'MONTH', every: 1, weekdays: [], monthDays: [day], nth: null, months: [], ends: { type: 'never' } });

/** What the Add form is opened with for a starter: its type, category, title, first date and repeat rule. */
export function starterParams(s: Starter, now = new Date()): Record<string, string> {
  const base: Record<string, string> = { type: s.type ?? 'EXPENSE', category: s.category ?? 'other', description: s.title ?? '' };
  if (s.sub) base.subCategory = s.sub;
  switch (s.id) {
    case 'rent': return { ...base, date: nextDayOfMonth(1, now).toISOString(), repeat: JSON.stringify(monthlyOn(1)) };
    case 'salary': return { ...base, date: nextDayOfMonth(28, now).toISOString(), repeat: JSON.stringify(monthlyOn(28)) };
    case 'subscription': {
      const first = nextDayOfMonth(now.getDate(), new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
      return { ...base, date: first.toISOString(), repeat: JSON.stringify(monthlyOn(first.getDate())) };
    }
    case 'airtime': {
      const weekday = (now.getDay() + 1) % 7;
      return { ...base, date: nextWeekday(weekday, now).toISOString(), repeat: JSON.stringify({ ...blankRule('WEEK'), weekdays: [weekday] }) };
    }
    default: {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
      return { ...base, date: at9(d).toISOString() };
    }
  }
}
