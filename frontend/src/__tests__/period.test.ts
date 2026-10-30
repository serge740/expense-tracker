import { describe, expect, test } from 'vitest';
import {
  canGoNext, defaultPeriod, fromDay, includesToday, matchPreset, presetPeriod, historyParams, isThisMonth, lastMonth, monthsOf, parseStoredPeriod, periodDays, periodKey, periodLabel, periodParams, rangeOf, shiftPeriod, thisMonth, toDay, yearChoices, type LabelEnv,
} from '@/utils/period';

const NOW = new Date(2026, 9, 29, 10, 0, 0); // 29 Oct 2026
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const env: LabelEnv = {
  month: (y, m, withYear) => (withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1]),
  day: (d, withYear) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${withYear ? ` ${d.getFullYear()}` : ''}`,
  t: (key, vars) => (key === 'period.all' ? 'All time' : `Year ${vars?.year}`),
};

describe('days', () => {
  test('a day round-trips, and a day that does not exist is refused', () => {
    expect(toDay(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(fromDay('2026-10-29')).toEqual(new Date(2026, 9, 29));
    expect(fromDay('2026-02-30')).toBeNull();
    expect(fromDay('29/10/2026')).toBeNull();
  });
});

describe('the period that Home starts on', () => {
  test('follows the setting', () => {
    expect(defaultPeriod('month', NOW)).toEqual({ kind: 'month', month: 10, year: 2026 });
    expect(defaultPeriod('year', NOW)).toEqual({ kind: 'year', year: 2026 });
    expect(defaultPeriod('all', NOW)).toEqual({ kind: 'all' });
    expect(defaultPeriod(undefined, NOW)).toEqual(thisMonth(NOW));
  });
  test('last month crosses the new year', () => {
    expect(lastMonth(new Date(2026, 0, 15))).toEqual({ kind: 'month', month: 12, year: 2025 });
    expect(lastMonth(NOW)).toEqual({ kind: 'month', month: 9, year: 2026 });
  });
});

describe('what is asked of the server', () => {
  test.each([
    [{ kind: 'month', month: 3, year: 2025 }, { month: 3, year: 2025 }],
    [{ kind: 'year', year: 2025 }, { year: 2025 }],
    [{ kind: 'all' }, { all: 'true' }],
    [{ kind: 'range', from: '2026-10-05', to: '2026-10-09' }, { from: '2026-10-05', to: '2026-10-09' }],
  ] as const)('%j', (p, params) => {
    expect(periodParams(p as any)).toEqual(params);
  });

  test('a range given the wrong way round is put right', () => {
    expect(rangeOf(new Date(2026, 9, 9), new Date(2026, 9, 5))).toEqual({ kind: 'range', from: '2026-10-05', to: '2026-10-09' });
  });

  test('the days of a period, for History', () => {
    expect(periodDays({ kind: 'month', month: 2, year: 2024 })).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(periodDays({ kind: 'year', year: 2025 })).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(periodDays({ kind: 'all' })).toBeNull();
    expect(historyParams({ kind: 'all' })).toEqual({ all: 'true' });
    expect(historyParams({ kind: 'month', month: 10, year: 2026 })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('the budget belongs to one month', () => {
  test('only this exact month counts', () => {
    expect(isThisMonth(thisMonth(NOW), NOW)).toBe(true);
    expect(isThisMonth(lastMonth(NOW), NOW)).toBe(false);
    expect(isThisMonth({ kind: 'year', year: 2026 }, NOW)).toBe(false);
    expect(isThisMonth({ kind: 'all' }, NOW)).toBe(false);
  });
});

describe('the name on the pill', () => {
  test('this month is just its name; another year adds the year', () => {
    expect(periodLabel(thisMonth(NOW), env, NOW)).toBe('October');
    expect(periodLabel({ kind: 'month', month: 3, year: 2025 }, env, NOW)).toBe('March 2025');
  });
  test('a year, everything, and a range', () => {
    expect(periodLabel({ kind: 'year', year: 2026 }, env, NOW)).toBe('Year 2026');
    expect(periodLabel({ kind: 'all' }, env, NOW)).toBe('All time');
    expect(periodLabel({ kind: 'range', from: '2026-10-05', to: '2026-10-09' }, env, NOW)).toBe('5 Oct – 9 Oct');
    expect(periodLabel({ kind: 'range', from: '2026-10-05', to: '2026-10-05' }, env, NOW)).toBe('5 Oct');
    expect(periodLabel({ kind: 'range', from: '2025-12-20', to: '2026-01-03' }, env, NOW)).toBe('20 Dec 2025 – 3 Jan 2026');
  });
});

describe('keys and choices', () => {
  test('two different periods never share a key', () => {
    const keys = [thisMonth(NOW), lastMonth(NOW), { kind: 'year', year: 2026 }, { kind: 'all' }, { kind: 'range', from: '2026-10-05', to: '2026-10-09' }].map(p => periodKey(p as any));
    expect(new Set(keys).size).toBe(keys.length);
  });
  test('twelve months and a few years', () => {
    expect(monthsOf(2026)).toHaveLength(12);
    expect(yearChoices(NOW, 3)).toEqual([2026, 2025, 2024, 2023]);
  });
});

describe('a stored period', () => {
  test('good ones come back, bad ones are refused', () => {
    expect(parseStoredPeriod({ kind: 'all' })).toEqual({ kind: 'all' });
    expect(parseStoredPeriod({ kind: 'month', month: 4, year: 2025 })).toEqual({ kind: 'month', month: 4, year: 2025 });
    expect(parseStoredPeriod({ kind: 'month', month: 13, year: 2025 })).toBeNull();
    expect(parseStoredPeriod({ kind: 'range', from: '2026-02-30', to: '2026-03-01' })).toBeNull();
    expect(parseStoredPeriod('all')).toBeNull();
    expect(parseStoredPeriod(null)).toBeNull();
  });
});

describe('previous and next', () => {
  test('a month goes back and forward across the new year', () => {
    expect(shiftPeriod({ kind: 'month', month: 1, year: 2026 }, -1)).toEqual({ kind: 'month', month: 12, year: 2025 });
    expect(shiftPeriod({ kind: 'month', month: 12, year: 2025 }, 1)).toEqual({ kind: 'month', month: 1, year: 2026 });
  });
  test('a year moves by one', () => {
    expect(shiftPeriod({ kind: 'year', year: 2026 }, -1)).toEqual({ kind: 'year', year: 2025 });
  });
  test('a range moves by its own length (both days included)', () => {
    expect(shiftPeriod({ kind: 'range', from: '2026-10-05', to: '2026-10-11' }, -1)).toEqual({ kind: 'range', from: '2026-09-28', to: '2026-10-04' });
    expect(shiftPeriod({ kind: 'range', from: '2026-10-05', to: '2026-10-05' }, 1)).toEqual({ kind: 'range', from: '2026-10-06', to: '2026-10-06' });
  });
  test('all time has no neighbours', () => {
    expect(shiftPeriod({ kind: 'all' }, 1)).toBeNull();
    expect(canGoNext({ kind: 'all' }, NOW)).toBe(false);
  });
  test('next is only allowed once that period has started', () => {
    expect(canGoNext({ kind: 'month', month: 9, year: 2026 }, NOW)).toBe(true);
    expect(canGoNext({ kind: 'month', month: 10, year: 2026 }, NOW)).toBe(false);
    expect(canGoNext({ kind: 'year', year: 2025 }, NOW)).toBe(true);
    expect(canGoNext({ kind: 'year', year: 2026 }, NOW)).toBe(false);
    expect(canGoNext({ kind: 'range', from: '2026-10-01', to: '2026-10-07' }, NOW)).toBe(true);
    expect(canGoNext({ kind: 'range', from: '2026-10-25', to: '2026-10-31' }, NOW)).toBe(false);
  });
});

describe('the quick choices', () => {
  const NOWQ = new Date(2026, 9, 29, 10, 0, 0); // Thursday 29 Oct 2026
  test('days', () => {
    expect(presetPeriod('today', NOWQ)).toEqual({ kind: 'range', from: '2026-10-29', to: '2026-10-29' });
    expect(presetPeriod('yesterday', NOWQ)).toEqual({ kind: 'range', from: '2026-10-28', to: '2026-10-28' });
    expect(presetPeriod('last7', NOWQ)).toEqual({ kind: 'range', from: '2026-10-23', to: '2026-10-29' });
    expect(presetPeriod('last30', NOWQ)).toEqual({ kind: 'range', from: '2026-09-30', to: '2026-10-29' });
  });
  test('the week starts on the day the person chose', () => {
    expect(presetPeriod('thisWeek', NOWQ, 'monday')).toEqual({ kind: 'range', from: '2026-10-26', to: '2026-11-01' });
    expect(presetPeriod('thisWeek', NOWQ, 'sunday')).toEqual({ kind: 'range', from: '2026-10-25', to: '2026-10-31' });
    expect(presetPeriod('lastWeek', NOWQ, 'monday')).toEqual({ kind: 'range', from: '2026-10-19', to: '2026-10-25' });
    // On a Sunday with a Monday start, the week began six days ago.
    expect(presetPeriod('thisWeek', new Date(2026, 9, 25), 'monday')).toEqual({ kind: 'range', from: '2026-10-19', to: '2026-10-25' });
  });
  test('months, quarter, years, everything', () => {
    expect(presetPeriod('thisMonth', NOWQ)).toEqual({ kind: 'month', month: 10, year: 2026 });
    expect(presetPeriod('lastMonth', NOWQ)).toEqual({ kind: 'month', month: 9, year: 2026 });
    expect(presetPeriod('thisQuarter', NOWQ)).toEqual({ kind: 'range', from: '2026-10-01', to: '2026-12-31' });
    expect(presetPeriod('thisQuarter', new Date(2026, 1, 10))).toEqual({ kind: 'range', from: '2026-01-01', to: '2026-03-31' });
    expect(presetPeriod('thisYear', NOWQ)).toEqual({ kind: 'year', year: 2026 });
    expect(presetPeriod('lastYear', NOWQ)).toEqual({ kind: 'year', year: 2025 });
    expect(presetPeriod('allTime', NOWQ)).toEqual({ kind: 'all' });
  });
  test('a period is recognised as its quick choice', () => {
    expect(matchPreset(presetPeriod('last7', NOWQ), NOWQ)).toBe('last7');
    expect(matchPreset({ kind: 'month', month: 10, year: 2026 }, NOWQ)).toBe('thisMonth');
    expect(matchPreset({ kind: 'range', from: '2026-10-05', to: '2026-10-09' }, NOWQ)).toBeNull();
    expect(matchPreset({ kind: 'all' }, NOWQ)).toBe('allTime');
  });
});

describe('does a period include today', () => {
  const N = new Date(2026, 9, 29);
  test.each([
    [{ kind: 'all' }, true], [{ kind: 'month', month: 10, year: 2026 }, true], [{ kind: 'month', month: 9, year: 2026 }, false],
    [{ kind: 'year', year: 2026 }, true], [{ kind: 'year', year: 2025 }, false],
    [{ kind: 'range', from: '2026-10-23', to: '2026-10-29' }, true], [{ kind: 'range', from: '2026-10-01', to: '2026-10-28' }, false], [{ kind: 'range', from: '2026-10-29', to: '2026-10-29' }, true],
  ])('%j is %s', (p, yes) => { expect(includesToday(p as never, N)).toBe(yes); });
});
