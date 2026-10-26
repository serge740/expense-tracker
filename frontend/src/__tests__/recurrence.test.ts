import { describe, expect, test } from 'vitest';
import {
  blankRule, compareWall, dateOfWall, daysInMonth, nthWeekday, normalizeRule, occurrences, RepeatRule, ruleProblem, Wall, wallOfDate,
} from '@/utils/recurrence';

const S = (y: number, m: number, d: number, h = 9, mi = 0): Wall => ({ y, m, d, h, mi });   // 2026-10-20 is a Tuesday
const show = (ws: Wall[]) => ws.map(w => `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')} ${String(w.h).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}`);
const rule = (o: Partial<RepeatRule>): RepeatRule => ({ ...blankRule('DAY'), ...o });

describe('one time', () => {
  test('a null rule is the start itself', () => {
    expect(show(occurrences(null, S(2026, 10, 20)))).toEqual(['2026-10-20 09:00']);
  });
  test('and nothing once that date is behind us', () => {
    expect(occurrences(null, S(2026, 10, 20), 5, S(2026, 10, 21))).toEqual([]);
  });
});

describe('daily', () => {
  test('every day, across a month end', () => {
    expect(show(occurrences(rule({ unit: 'DAY' }), S(2026, 10, 30), 3))).toEqual(['2026-10-30 09:00', '2026-10-31 09:00', '2026-11-01 09:00']);
  });
  test('every 3 days', () => {
    expect(show(occurrences(rule({ unit: 'DAY', every: 3 }), S(2026, 10, 20), 3))).toEqual(['2026-10-20 09:00', '2026-10-23 09:00', '2026-10-26 09:00']);
  });
  test('across a year end', () => {
    expect(show(occurrences(rule({ unit: 'DAY' }), S(2026, 12, 31), 2))).toEqual(['2026-12-31 09:00', '2027-01-01 09:00']);
  });
});

describe('weekly', () => {
  test('every Tuesday and Friday, forever', () => {
    expect(show(occurrences(rule({ unit: 'WEEK', weekdays: [2, 5] }), S(2026, 10, 20), 5)))
      .toEqual(['2026-10-20 09:00', '2026-10-23 09:00', '2026-10-27 09:00', '2026-10-30 09:00', '2026-11-03 09:00']);
  });
  test('no weekday chosen means the start\'s weekday', () => {
    expect(show(occurrences(rule({ unit: 'WEEK' }), S(2026, 10, 20), 3))).toEqual(['2026-10-20 09:00', '2026-10-27 09:00', '2026-11-03 09:00']);
  });
  test('every 2 weeks on Monday, started on a Tuesday: next Monday, then every 2 weeks', () => {
    expect(show(occurrences(rule({ unit: 'WEEK', every: 2, weekdays: [1] }), S(2026, 10, 20), 3))).toEqual(['2026-10-26 09:00', '2026-11-09 09:00', '2026-11-23 09:00']);
  });
  test('Sunday is day 0 and works at the end of a week', () => {
    expect(show(occurrences(rule({ unit: 'WEEK', weekdays: [0] }), S(2026, 10, 20), 2))).toEqual(['2026-10-25 09:00', '2026-11-01 09:00']);
  });
  test('after 4 times', () => {
    expect(occurrences(rule({ unit: 'WEEK', weekdays: [2, 5], ends: { type: 'after', count: 4 } }), S(2026, 10, 20), 50)).toHaveLength(4);
  });
  test('until a date, inclusive', () => {
    expect(show(occurrences(rule({ unit: 'WEEK', weekdays: [2, 5], ends: { type: 'on', date: '2026-10-30' } }), S(2026, 10, 20), 50)))
      .toEqual(['2026-10-20 09:00', '2026-10-23 09:00', '2026-10-27 09:00', '2026-10-30 09:00']);
  });
});

describe('monthly', () => {
  test('the 1st and 15th', () => {
    expect(show(occurrences(rule({ unit: 'MONTH', monthDays: [1, 15] }), S(2026, 10, 20), 4)))
      .toEqual(['2026-11-01 09:00', '2026-11-15 09:00', '2026-12-01 09:00', '2026-12-15 09:00']);
  });
  test('no day chosen means the start\'s day', () => {
    expect(show(occurrences(rule({ unit: 'MONTH' }), S(2026, 10, 20), 3))).toEqual(['2026-10-20 09:00', '2026-11-20 09:00', '2026-12-20 09:00']);
  });
  test('the last day of every month, leap year aware', () => {
    expect(show(occurrences(rule({ unit: 'MONTH', monthDays: [-1] }), S(2028, 1, 15), 3))).toEqual(['2028-01-31 09:00', '2028-02-29 09:00', '2028-03-31 09:00']);
  });
  test('the 31st clamps to the last day of shorter months', () => {
    expect(show(occurrences(rule({ unit: 'MONTH', monthDays: [31] }), S(2026, 1, 31), 4)))
      .toEqual(['2026-01-31 09:00', '2026-02-28 09:00', '2026-03-31 09:00', '2026-04-30 09:00']);
  });
  test('30 and 31 together do not double up in February', () => {
    expect(show(occurrences(rule({ unit: 'MONTH', monthDays: [30, 31] }), S(2026, 2, 1), 3))).toEqual(['2026-02-28 09:00', '2026-03-30 09:00', '2026-03-31 09:00']);
  });
  test('2nd Friday of every month', () => {
    expect(show(occurrences(rule({ unit: 'MONTH', nth: { n: 2, weekday: 5 } }), S(2026, 10, 1), 3))).toEqual(['2026-10-09 09:00', '2026-11-13 09:00', '2026-12-11 09:00']);
  });
  test('last Friday of every month', () => {
    expect(show(occurrences(rule({ unit: 'MONTH', nth: { n: -1, weekday: 5 } }), S(2026, 10, 1), 3))).toEqual(['2026-10-30 09:00', '2026-11-27 09:00', '2026-12-25 09:00']);
  });
  test('every 3 months counted from the first real date', () => {
    expect(show(occurrences(rule({ unit: 'MONTH', every: 3, monthDays: [1] }), S(2026, 10, 20), 3))).toEqual(['2026-11-01 09:00', '2027-02-01 09:00', '2027-05-01 09:00']);
  });
});

describe('yearly', () => {
  test('once a year in March on the 5th', () => {
    expect(show(occurrences(rule({ unit: 'YEAR', months: [3], monthDays: [5] }), S(2026, 10, 20), 3))).toEqual(['2027-03-05 09:00', '2028-03-05 09:00', '2029-03-05 09:00']);
  });
  test('quarterly on the 10th', () => {
    expect(show(occurrences(rule({ unit: 'YEAR', months: [1, 4, 7, 10], monthDays: [10] }), S(2026, 10, 20), 4)))
      .toEqual(['2027-01-10 09:00', '2027-04-10 09:00', '2027-07-10 09:00', '2027-10-10 09:00']);
  });
  test('Feb 29 falls on Feb 28 in non-leap years', () => {
    expect(show(occurrences(rule({ unit: 'YEAR', months: [2], monthDays: [29] }), S(2027, 3, 1), 3))).toEqual(['2028-02-29 09:00', '2029-02-28 09:00', '2030-02-28 09:00']);
  });
  test('no month or day chosen means the start\'s', () => {
    expect(show(occurrences(rule({ unit: 'YEAR' }), S(2026, 10, 20), 2))).toEqual(['2026-10-20 09:00', '2027-10-20 09:00']);
  });
});

describe('limits and edges', () => {
  test('"from" hides earlier dates but they still count toward "after N"', () => {
    expect(show(occurrences(rule({ unit: 'DAY', ends: { type: 'after', count: 5 } }), S(2026, 10, 20), 10, S(2026, 10, 23)))).toEqual(['2026-10-23 09:00', '2026-10-24 09:00']);
  });
  test('nothing when the end is before the first date', () => {
    expect(occurrences(rule({ unit: 'DAY', ends: { type: 'on', date: '2026-10-01' } }), S(2026, 10, 20), 5)).toEqual([]);
  });
  test('the time of day is never changed', () => {
    expect(occurrences(rule({ unit: 'DAY' }), S(2026, 3, 27, 2, 30), 4).map(w => `${w.h}:${w.mi}`)).toEqual(['2:30', '2:30', '2:30', '2:30']);
  });
  test('"max" caps the result', () => {
    expect(occurrences(rule({ unit: 'DAY' }), S(2026, 1, 1), 7)).toHaveLength(7);
  });
  test('a far-future "from" still finds the next dates quickly', () => {
    const t = Date.now();
    const r = occurrences(rule({ unit: 'WEEK', weekdays: [1] }), S(2026, 1, 5), 2, S(2036, 1, 1));
    expect(r).toHaveLength(2);
    expect(Date.now() - t).toBeLessThan(500);
  });
  test('"after 1 time" is just the first date', () => {
    expect(occurrences(rule({ unit: 'MONTH', ends: { type: 'after', count: 1 } }), S(2026, 10, 20), 5)).toHaveLength(1);
  });
  test('results are always in order and never before the start', () => {
    const r = occurrences(rule({ unit: 'MONTH', monthDays: [5, 25], every: 2 }), S(2026, 10, 10), 12);
    expect(r.every((w, i) => compareWall(w, S(2026, 10, 10)) >= 0 && (i === 0 || compareWall(r[i - 1], w) < 0))).toBe(true);
  });
});

describe('calendar helpers', () => {
  test('days in month, including February in leap and non-leap years', () => {
    expect([daysInMonth(2026, 2), daysInMonth(2028, 2), daysInMonth(2026, 4), daysInMonth(2026, 12)]).toEqual([28, 29, 30, 31]);
  });
  test('n-th weekday, including a month with no 5th', () => {
    expect(nthWeekday(2026, 10, 2, 5)).toBe(9);
    expect(nthWeekday(2026, 10, -1, 5)).toBe(30);
    expect(nthWeekday(2026, 2, 4, 1)).toBe(23);
  });
  test('wall <-> Date round trip on the phone', () => {
    const w = S(2026, 10, 20, 7, 45);
    expect(wallOfDate(dateOfWall(w))).toEqual(w);
  });
});

describe('validation (the server runs this on every request)', () => {
  const good = rule({ unit: 'WEEK', weekdays: [1, 2] });
  test('no rule is fine, a good rule is fine', () => {
    expect(ruleProblem(null)).toBeNull();
    expect(ruleProblem(good)).toBeNull();
  });
  test.each([
    ['unknown unit', { ...good, unit: 'HOUR' }],
    ['interval 0', { ...good, every: 0 }],
    ['interval 100', { ...good, every: 100 }],
    ['interval 1.5', { ...good, every: 1.5 }],
    ['weekday 7', { ...good, weekdays: [7] }],
    ['month day 0', { ...good, monthDays: [0] }],
    ['month day 32', { ...good, monthDays: [32] }],
    ['month 13', { ...good, months: [13] }],
    ['nth with a bad n', { ...good, unit: 'MONTH', nth: { n: 5, weekday: 1 } }],
    ['nth on a weekly rule', { ...good, nth: { n: 1, weekday: 1 } }],
    ['after 0 times', { ...good, ends: { type: 'after', count: 0 } }],
    ['after 1000 times', { ...good, ends: { type: 'after', count: 1000 } }],
    ['end date not a date', { ...good, ends: { type: 'on', date: 'soon' } }],
    ['unknown end type', { ...good, ends: { type: 'maybe' } }],
    ['lists are not lists', { ...good, weekdays: 'mon' }],
    ['not an object', 'weekly'],
  ])('rejects %s', (_label, bad) => {
    expect(ruleProblem(bad)).toEqual(expect.any(String));
  });

  test('normalising sorts and removes duplicates, with the last day last', () => {
    expect(normalizeRule(rule({ unit: 'MONTH', monthDays: [15, -1, 1, 15], weekdays: [5, 2, 2], months: [3, 1] })))
      .toMatchObject({ monthDays: [1, 15, -1], weekdays: [2, 5], months: [1, 3] });
  });
});
