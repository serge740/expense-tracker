import { describe, expect, test } from 'vitest';
import { agoPhrase, calendarDays, filterItems, matchesKind, showsSchedules, statusCounts, statusOf, whenPhrase, type AgendaItem } from '@/utils/schedule-agenda';

const NOW = new Date(2026, 9, 29, 15, 30, 0); // 29 Oct 2026, mid-afternoon
const at = (days: number, hour = 9) => new Date(2026, 9, 29 + days, hour, 0, 0).toISOString();
const item = (key: string, days: number, extra: Partial<AgendaItem> = {}): AgendaItem => ({
  key, source: 'SCHEDULED', refId: key, occurrenceId: null, title: key, person: null, dueAt: at(days), overdue: false, waiting: false, failed: false, failReason: null, amount: 100, currency: 'RWF', direction: 'OUT', ...extra,
});

describe('days away', () => {
  test('counts calendar days, not hours: 9 am tomorrow is tomorrow even late tonight', () => {
    expect(calendarDays(at(0, 8), NOW)).toBe(0);
    expect(calendarDays(at(0, 23), NOW)).toBe(0);
    expect(calendarDays(at(1, 0), NOW)).toBe(1);
    expect(calendarDays(at(-1, 23), NOW)).toBe(-1);
    expect(calendarDays(at(30), NOW)).toBe(30);
  });
  test('it crosses a month end', () => {
    expect(calendarDays(new Date(2026, 10, 2), NOW)).toBe(4);
  });
});

describe('in words', () => {
  test.each([
    [0, 'sched.today', undefined], [1, 'sched.tomorrow', undefined], [-1, 'sched.yesterday', undefined],
    [-12, 'sched.overdueDays', { n: 12 }], [5, 'sched.inDays', { n: 5 }], [60, 'sched.inDays', { n: 60 }], [90, 'sched.inMonths', { n: 3 }],
  ])('%i days', (days, key, vars) => {
    const w = whenPhrase(days);
    expect(w.key).toBe(key);
    expect(w.vars).toEqual(vars);
  });
});

describe('in words, for the past', () => {
  test.each([
    [0, 'sched.today', undefined], [-1, 'sched.yesterday', undefined], [-12, 'sched.daysAgo', { n: 12 }], [-60, 'sched.daysAgo', { n: 60 }], [-95, 'sched.monthsAgo', { n: 3 }], [3, 'sched.today', undefined],
  ])('%i days', (days, key, vars) => {
    const w = agoPhrase(days);
    expect(w.key).toBe(key);
    expect(w.vars).toEqual(vars);
  });
});

describe('status and kind', () => {
  test('an overdue date is overdue, a waiting one is waiting, otherwise this week or later', () => {
    expect(statusOf(item('a', -3, { overdue: true }), NOW)).toBe('overdue');
    expect(statusOf(item('b', 0, { waiting: true }), NOW)).toBe('waiting');
    expect(statusOf(item('c', 7), NOW)).toBe('week');
    expect(statusOf(item('d', 8), NOW)).toBe('later');
  });
  test('kinds', () => {
    const loan = item('l', 3, { source: 'DEBT', direction: 'OUT' });
    const credit = item('c', 3, { source: 'CREDIT', direction: 'IN' });
    const rent = item('r', 3);
    expect([loan, credit, rent].map(i => matchesKind(i, 'loans'))).toEqual([true, false, false]);
    expect([loan, credit, rent].map(i => matchesKind(i, 'credits'))).toEqual([false, true, false]);
    expect([loan, credit, rent].map(i => matchesKind(i, 'scheduled'))).toEqual([false, false, true]);
    expect([loan, credit, rent].map(i => matchesKind(i, 'in'))).toEqual([false, true, false]);
    expect([loan, credit, rent].map(i => matchesKind(i, 'out'))).toEqual([true, false, true]);
    expect(showsSchedules('loans')).toBe(false);
    expect(showsSchedules('scheduled')).toBe(true);
  });
});

describe('the status cards', () => {
  const items = [
    item('o1', -5, { overdue: true, source: 'DEBT' }), item('w1', 0, { waiting: true }), item('o2', -1, { overdue: true, waiting: true }),
    item('s1', 2), item('s2', 6, { source: 'CREDIT', direction: 'IN' }), item('l1', 20), item('l2', 90),
  ];
  test('counts each card', () => {
    expect(statusCounts(items, 2, 1, 'all', NOW)).toEqual({ overdue: 2, waiting: 2, week: 2, later: 2, paused: 2, ended: 1 });
  });
  test('the counts follow the kind filter', () => {
    expect(statusCounts(items, 2, 1, 'loans', NOW)).toMatchObject({ overdue: 1, waiting: 0, week: 0, later: 0 });
    expect(statusCounts(items, 2, 1, 'credits', NOW)).toMatchObject({ overdue: 0, week: 1 });
  });
  test('filters the list by kind and by status together', () => {
    expect(filterItems(items, 'all', 'overdue', NOW).map(i => i.key)).toEqual(['o1', 'o2']);
    expect(filterItems(items, 'all', 'waiting', NOW).map(i => i.key)).toEqual(['w1', 'o2']);
    expect(filterItems(items, 'all', 'week', NOW).map(i => i.key)).toEqual(['s1', 's2']);
    expect(filterItems(items, 'credits', null, NOW).map(i => i.key)).toEqual(['s2']);
    expect(filterItems(items, 'all', null, NOW)).toHaveLength(7);
  });
  test('paused and ended are about the schedules, so no dates are listed for them', () => {
    expect(filterItems(items, 'all', 'paused', NOW)).toEqual([]);
    expect(filterItems(items, 'all', 'ended', NOW)).toEqual([]);
  });
});
