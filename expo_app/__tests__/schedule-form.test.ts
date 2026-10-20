import { describe, expect, test } from '@jest/globals';
import { isScheduledForm, SCHEDULE_GRACE_MS, scheduledPayload, scheduleSaveLabel, scheduleStartError } from '@/utils/schedule-form';
import { blankRule } from '@/utils/recurrence';

const NOW = new Date(2030, 9, 22, 12, 0);
const at = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60_000, DAY = 24 * 60 * MIN;
const weekly = { ...blankRule('WEEK'), weekdays: [2] };

describe('when a transaction becomes a scheduled one', () => {
  test('dated now: an ordinary transaction', () => {
    expect(isScheduledForm(NOW, null, NOW)).toBe(false);
  });
  test('dated a few minutes ahead (picker rounding): still ordinary', () => {
    expect(isScheduledForm(at(3 * MIN), null, NOW)).toBe(false);
    expect(isScheduledForm(at(SCHEDULE_GRACE_MS), null, NOW)).toBe(false);
  });
  test('dated clearly in the future: scheduled', () => {
    expect(isScheduledForm(at(SCHEDULE_GRACE_MS + MIN), null, NOW)).toBe(true);
    expect(isScheduledForm(at(2 * DAY), null, NOW)).toBe(true);
  });
  test('a past date is ordinary (a backdated transaction)', () => {
    expect(isScheduledForm(at(-3 * DAY), null, NOW)).toBe(false);
  });
  test('any repeat rule makes it scheduled, whatever the date', () => {
    expect(isScheduledForm(NOW, weekly, NOW)).toBe(true);
    expect(isScheduledForm(at(-3 * DAY), weekly, NOW)).toBe(true);
  });
});

describe('the first-date rule', () => {
  test('ordinary transactions have no rule about the date', () => {
    expect(scheduleStartError(at(-30 * DAY), null, NOW)).toBeNull();
  });
  test('a repeat that starts in the past is refused', () => {
    expect(scheduleStartError(at(-DAY), weekly, NOW)).toBe('past');
  });
  test('a repeat starting now or in the future is fine', () => {
    expect(scheduleStartError(NOW, weekly, NOW)).toBeNull();
    expect(scheduleStartError(at(DAY), weekly, NOW)).toBeNull();
  });
  test('a few minutes late is forgiven, like the server', () => {
    expect(scheduleStartError(at(-3 * MIN), weekly, NOW)).toBeNull();
    expect(scheduleStartError(at(-SCHEDULE_GRACE_MS - MIN), weekly, NOW)).toBe('past');
  });
  test('a future one-time item is fine', () => {
    expect(scheduleStartError(at(2 * DAY), null, NOW)).toBeNull();
  });
});

describe('what is sent to the server', () => {
  const base = {
    kind: 'EXPENSE' as const, category: 'rent' as const, title: 'Rent', description: 'October', amount: 5000,
    walletId: 'w1', date: at(2 * DAY), rule: weekly, mode: 'AUTO_POST' as const, timezone: 'Africa/Kigali',
  };
  test('carries everything, with the date as an ISO moment', () => {
    expect(scheduledPayload(base)).toEqual({
      type: 'EXPENSE', category: 'rent', title: 'Rent', amount: 5000, description: 'October', walletId: 'w1',
      startAt: base.date.toISOString(), timezone: 'Africa/Kigali', repeat: weekly, mode: 'AUTO_POST',
    });
  });
  test('no wallet and no note are left out, not sent as empty text', () => {
    const p = scheduledPayload({ ...base, walletId: null, description: '' });
    expect(p.walletId).toBeUndefined();
    expect(p.description).toBeUndefined();
  });
  test('a one-time item sends repeat: null', () => {
    expect(scheduledPayload({ ...base, rule: null }).repeat).toBeNull();
  });
  test('income stays income', () => {
    expect(scheduledPayload({ ...base, kind: 'INCOME' }).type).toBe('INCOME');
  });
});

describe('the Save label', () => {
  test('says "repeating" only when it repeats', () => {
    expect(scheduleSaveLabel(weekly)).toBe('sched.saveRepeat');
    expect(scheduleSaveLabel(null)).toBe('sched.save');
  });
});

import { sameRule } from '@/utils/schedule-form';

describe('sameRule (what counts as an edited repeat)', () => {
  const a = { ...blankRule('WEEK'), weekdays: [2, 5] };
  test('two nulls are the same, null and a rule are not', () => {
    expect(sameRule(null, null)).toBe(true);
    expect(sameRule(null, a)).toBe(false);
    expect(sameRule(a, null)).toBe(false);
  });
  test('the same rule with its lists in a different order is the same', () => {
    expect(sameRule(a, { ...a, weekdays: [5, 2] })).toBe(true);
    expect(sameRule({ ...blankRule('MONTH'), monthDays: [-1, 15] }, { ...blankRule('MONTH'), monthDays: [15, -1] })).toBe(true);
  });
  test('any real difference counts', () => {
    expect(sameRule(a, { ...a, every: 2 })).toBe(false);
    expect(sameRule(a, { ...a, unit: 'DAY' })).toBe(false);
    expect(sameRule(a, { ...a, weekdays: [2] })).toBe(false);
    expect(sameRule(a, { ...a, ends: { type: 'after', count: 3 } })).toBe(false);
    expect(sameRule({ ...blankRule('MONTH'), nth: { n: 2, weekday: 5 } }, { ...blankRule('MONTH'), nth: { n: 2, weekday: 4 } })).toBe(false);
  });
});
