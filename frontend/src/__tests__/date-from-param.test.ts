import { describe, expect, test } from 'vitest';
import { dateFromParam } from '@/screens/dashboard/add';

const now = new Date(2026, 9, 30, 15, 20);   // 30 Oct 2026, 15:20 local

describe('the date a scanned receipt puts in the form', () => {
  test('a plain day is that day on the person’s own calendar, at the time of day it is now', () => {
    const d = dateFromParam('2026-10-28', now);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 28, 15, 20]);
  });
  test('a day that does not exist, or lies ahead, becomes today', () => {
    expect(dateFromParam('2026-02-30', now)).toEqual(now);
    expect(dateFromParam('2026-12-01', now)).toEqual(now);
  });
  test('nothing, or nonsense, is today; a full moment is kept', () => {
    expect(dateFromParam('', now)).toEqual(now);
    expect(dateFromParam('abc', now)).toEqual(now);
    expect(dateFromParam('2026-10-01T08:00:00.000Z', now).toISOString()).toBe('2026-10-01T08:00:00.000Z');
  });
});

describe('the time printed on a receipt', () => {
  test('is used with the day; without it the time of day is now', () => {
    const d = dateFromParam('2026-09-18', now, '16:24');
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([18, 16, 24]);
    const e = dateFromParam('2026-09-18', now, 'abc');
    expect([e.getHours(), e.getMinutes()]).toEqual([15, 20]);
    expect(dateFromParam('2026-10-30', now, '23:59')).toEqual(now);   // later today than now: not in the future
  });
});
