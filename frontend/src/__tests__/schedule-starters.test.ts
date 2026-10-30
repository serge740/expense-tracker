import { describe, expect, test } from 'vitest';
import { STARTERS, nextDayOfMonth, nextWeekday, starterParams } from '@/utils/schedule-starters';
import { ruleProblem } from '@/utils/recurrence';

const NOW = new Date(2026, 9, 29, 15, 0, 0); // Thursday 29 Oct 2026

describe('the next day of the month', () => {
  test('later this month if it is still ahead, otherwise next month', () => {
    expect(nextDayOfMonth(30, NOW)).toEqual(new Date(2026, 9, 30, 9, 0));
    expect(nextDayOfMonth(1, NOW)).toEqual(new Date(2026, 10, 1, 9, 0));
    expect(nextDayOfMonth(28, NOW)).toEqual(new Date(2026, 10, 28, 9, 0));
  });
  test('the 31st is kept to the end of a short month', () => {
    expect(nextDayOfMonth(31, new Date(2026, 3, 5))).toEqual(new Date(2026, 3, 30, 9, 0));
  });
  test('today at 9 is already past in the afternoon', () => {
    expect(nextDayOfMonth(29, NOW)).toEqual(new Date(2026, 10, 29, 9, 0));
  });
});

describe('the next weekday', () => {
  test('never today', () => {
    expect(nextWeekday(4, NOW)).toEqual(new Date(2026, 10, 5, 9, 0));
    expect(nextWeekday(5, NOW)).toEqual(new Date(2026, 9, 30, 9, 0));
  });
});

describe('starters', () => {
  test('every starter that makes a schedule has a valid repeat rule and a future first date', () => {
    for (const s of STARTERS.filter(x => !x.route)) {
      const p = starterParams(s, NOW);
      expect(new Date(p.date).getTime()).toBeGreaterThan(NOW.getTime());
      if (p.repeat) expect(ruleProblem(JSON.parse(p.repeat))).toBeNull();
    }
  });
  test('rent is monthly on the 1st; salary on the 28th; airtime weekly; a one-time payment does not repeat', () => {
    const rent = starterParams(STARTERS.find(s => s.id === 'rent')!, NOW);
    expect(JSON.parse(rent.repeat).monthDays).toEqual([1]);
    expect(rent).toMatchObject({ type: 'EXPENSE', category: 'bills', subCategory: 'Rent' });
    const salary = starterParams(STARTERS.find(s => s.id === 'salary')!, NOW);
    expect(salary.type).toBe('INCOME');
    expect(JSON.parse(salary.repeat).monthDays).toEqual([28]);
    const airtime = JSON.parse(starterParams(STARTERS.find(s => s.id === 'airtime')!, NOW).repeat);
    expect(airtime.unit).toBe('WEEK');
    expect(airtime.weekdays).toEqual([5]);
    expect(starterParams(STARTERS.find(s => s.id === 'once')!, NOW).repeat).toBeUndefined();
  });
  test('the loan starter goes to the loans screen instead', () => {
    expect(STARTERS.find(s => s.id === 'loan')!.route).toBe('/(dashboard)/debts');
  });
});
