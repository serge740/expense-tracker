import { describe, expect, test } from '@jest/globals';
import {
  addMonthsClamped, applyWheel, buildCalendar, buildDayStrip, buildPresets, ceilToStep, dayDelta, gmtOffsetLabel,
  isDayDisabled, isPresetActive, isPresetDisabled, minuteValues, nextWeekday, rangeError, relativeParts,
  roundToStep, sameDay, startOfDay, wheelIndexes, withDay, withTime,
} from '@/utils/datetime';

const d = (y: number, mo: number, day: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, day, h, mi, s);

describe('stepping', () => {
  test('ceilToStep rounds up to the next step and drops seconds', () => {
    expect(ceilToStep(d(2026, 10, 20, 15, 3), 5)).toEqual(d(2026, 10, 20, 15, 5));
    expect(ceilToStep(d(2026, 10, 20, 15, 5), 5)).toEqual(d(2026, 10, 20, 15, 5));
    expect(ceilToStep(d(2026, 10, 20, 15, 5, 30), 5)).toEqual(d(2026, 10, 20, 15, 10));
    expect(ceilToStep(d(2026, 10, 20, 15, 56), 15)).toEqual(d(2026, 10, 20, 16, 0));
  });
  test('roundToStep rounds to nearest and carries into the hour', () => {
    expect(roundToStep(d(2026, 10, 20, 15, 58), 5)).toEqual(d(2026, 10, 20, 16, 0));
    expect(roundToStep(d(2026, 10, 20, 15, 52), 5)).toEqual(d(2026, 10, 20, 15, 50));
    expect(roundToStep(d(2026, 10, 20, 23, 58), 5)).toEqual(d(2026, 10, 21, 0, 0));
  });
  test('minuteValues covers the hour for each step', () => {
    expect(minuteValues(15)).toEqual([0, 15, 30, 45]);
    expect(minuteValues(5)).toHaveLength(12);
    expect(minuteValues(1)).toHaveLength(60);
  });
});

describe('dates', () => {
  test('adding a month clamps the 31st', () => {
    expect(addMonthsClamped(d(2026, 1, 31, 9, 30), 1)).toEqual(d(2026, 2, 28, 9, 30));
    expect(addMonthsClamped(d(2028, 1, 31), 1)).toEqual(d(2028, 2, 29));
    expect(addMonthsClamped(d(2026, 10, 31), 2)).toEqual(d(2026, 12, 31));
    expect(addMonthsClamped(d(2026, 12, 15), 1)).toEqual(d(2027, 1, 15));
  });
  test('nextWeekday is strictly after the given day', () => {
    // 2026-10-20 is a Tuesday
    expect(nextWeekday(d(2026, 10, 20, 18), 1)).toEqual(d(2026, 10, 26));
    expect(nextWeekday(d(2026, 10, 26), 1)).toEqual(d(2026, 11, 2));
  });
  test('withDay keeps the time, withTime keeps the day', () => {
    expect(withDay(d(2026, 10, 20, 15, 45), d(2026, 12, 1, 3, 0))).toEqual(d(2026, 12, 1, 15, 45));
    expect(withTime(d(2026, 10, 20, 15, 45), d(2030, 1, 1, 9, 5))).toEqual(d(2026, 10, 20, 9, 5));
  });
  test('dayDelta counts calendar days, not 24-hour blocks', () => {
    expect(dayDelta(d(2026, 10, 21, 0, 5), d(2026, 10, 20, 23, 50))).toBe(1);
    expect(dayDelta(d(2026, 10, 19, 23, 59), d(2026, 10, 20, 0, 1))).toBe(-1);
    expect(dayDelta(d(2026, 10, 20, 23, 59), d(2026, 10, 20, 0, 1))).toBe(0);
  });
});

describe('calendar', () => {
  test('always 42 cells, starting on Sunday, with the right leading and trailing days', () => {
    const cells = buildCalendar(2026, 9); // October 2026, 1st is a Thursday
    expect(cells).toHaveLength(42);
    expect(cells.slice(0, 4).map(c => [c.day, c.current])).toEqual([[27, false], [28, false], [29, false], [30, false]]);
    expect(cells[4]).toMatchObject({ day: 1, month: 9, current: true });
    expect(cells.filter(c => c.current)).toHaveLength(31);
    expect(cells[41]).toMatchObject({ month: 10, current: false });
  });
  test('January shows December of the previous year', () => {
    const cells = buildCalendar(2026, 0);
    const lead = cells.find(c => !c.current)!;
    expect(lead).toMatchObject({ month: 11, year: 2025 });
  });
  test('day strip adds the selected day when it is outside the range', () => {
    const strip = buildDayStrip(d(2026, 10, 20), 5, d(2026, 12, 25, 10));
    expect(strip).toHaveLength(6);
    expect(sameDay(strip[5], d(2026, 12, 25))).toBe(true);
    const before = buildDayStrip(d(2026, 10, 20), 5, d(2026, 10, 1));
    expect(sameDay(before[0], d(2026, 10, 1))).toBe(true);
    expect(buildDayStrip(d(2026, 10, 20), 5, d(2026, 10, 22))).toHaveLength(5);
  });
});

describe('range rules', () => {
  const now = d(2026, 10, 20, 15, 0);
  test('datetime is judged by the exact instant', () => {
    expect(rangeError(d(2026, 10, 20, 14, 59), 'datetime', now)).toBe('min');
    expect(rangeError(d(2026, 10, 20, 15, 0), 'datetime', now)).toBeNull();
  });
  test('date-only is judged by calendar day, so today stays valid with a mid-day minimum', () => {
    expect(rangeError(d(2026, 10, 20, 0, 0), 'date', now)).toBeNull();
    expect(rangeError(d(2026, 10, 19, 12, 0), 'date', now)).toBe('min');
  });
  test('max is enforced', () => {
    expect(rangeError(d(2026, 11, 2), 'date', null, d(2026, 11, 1))).toBe('max');
  });
  test('a time of day never has a range', () => {
    expect(rangeError(d(2000, 1, 1, 3, 0), 'time', now, now)).toBeNull();
  });
  test('days before the minimum are disabled', () => {
    expect(isDayDisabled(d(2026, 10, 19), now)).toBe(true);
    expect(isDayDisabled(d(2026, 10, 20), now)).toBe(false);
  });
});

describe('wheels (12-hour)', () => {
  const o = { hour12: true, step: 5 };
  test('midnight reads 12 AM and noon reads 12 PM', () => {
    expect(wheelIndexes(d(2026, 10, 20, 0, 0), o)).toEqual({ h: 11, m: 0, p: 0 });
    expect(wheelIndexes(d(2026, 10, 20, 12, 30), o)).toEqual({ h: 11, m: 6, p: 1 });
  });
  test('afternoon hours map to 1–11', () => {
    expect(wheelIndexes(d(2026, 10, 20, 15, 20), o)).toEqual({ h: 2, m: 4, p: 1 });
  });
  test('choosing hour 12 while in the afternoon gives 12 PM, in the morning 12 AM', () => {
    expect(applyWheel(d(2026, 10, 20, 15, 20), 'h', 11, o).getHours()).toBe(12);
    expect(applyWheel(d(2026, 10, 20, 9, 20), 'h', 11, o).getHours()).toBe(0);
  });
  test('switching AM/PM keeps the hour on the clock face', () => {
    expect(applyWheel(d(2026, 10, 20, 9, 20), 'p', 1, o).getHours()).toBe(21);
    expect(applyWheel(d(2026, 10, 20, 21, 20), 'p', 0, o).getHours()).toBe(9);
    expect(applyWheel(d(2026, 10, 20, 0, 5), 'p', 1, o).getHours()).toBe(12);
  });
  test('minute wheel sets minutes from its index', () => {
    expect(applyWheel(d(2026, 10, 20, 9, 0), 'm', 7, o).getMinutes()).toBe(35);
  });
});

describe('wheels (24-hour)', () => {
  const o = { hour12: false, step: 15 };
  test('hour index is the hour itself', () => {
    expect(wheelIndexes(d(2026, 10, 20, 23, 45), o)).toMatchObject({ h: 23, m: 3 });
    expect(applyWheel(d(2026, 10, 20, 9, 0), 'h', 18, o).getHours()).toBe(18);
  });
});

describe('relative time', () => {
  const now = d(2026, 10, 20, 12, 0);
  test('future, past and now', () => {
    expect(relativeParts(d(2026, 10, 20, 13, 4), now)).toEqual({ dir: 'in', days: 0, hours: 1, minutes: 4 });
    expect(relativeParts(d(2026, 10, 22, 15, 0), now)).toEqual({ dir: 'in', days: 2, hours: 3, minutes: 0 });
    expect(relativeParts(d(2026, 10, 20, 9, 16), now)).toEqual({ dir: 'ago', days: 0, hours: 2, minutes: 44 });
    expect(relativeParts(d(2026, 10, 20, 12, 0, 20), now).dir).toBe('now');
  });
});

describe('quick picks', () => {
  const now = d(2026, 10, 20, 15, 3); // Tuesday
  test('date presets', () => {
    const p = Object.fromEntries(buildPresets('date', now, now, 5).map(x => [x.id, x.date]));
    expect(p.today).toEqual(d(2026, 10, 20));
    expect(p.tomorrow).toEqual(d(2026, 10, 21));
    expect(p.nextMonday).toEqual(d(2026, 10, 26));
    expect(p.endOfMonth).toEqual(d(2026, 10, 31));
    expect(p.inMonth).toEqual(d(2026, 11, 20));
  });
  test('datetime presets round up to the step', () => {
    const p = Object.fromEntries(buildPresets('datetime', now, now, 5).map(x => [x.id, x.date]));
    expect(p.in10).toEqual(d(2026, 10, 20, 15, 15));
    expect(p.in1h).toEqual(d(2026, 10, 20, 16, 5));
    expect(p.tonight).toEqual(d(2026, 10, 20, 20, 0));
    expect(p.tomorrow9).toEqual(d(2026, 10, 21, 9, 0));
    expect(p.nextMon9).toEqual(d(2026, 10, 26, 9, 0));
  });
  test('time presets keep the selected day', () => {
    const sel = d(2026, 11, 5, 7, 0);
    const p = buildPresets('time', now, sel, 5).find(x => x.id === 'at18')!;
    expect(p.date).toEqual(d(2026, 11, 5, 18, 0));
  });
  test('active and disabled states', () => {
    const presets = buildPresets('date', now, d(2026, 10, 21, 12), 5);
    expect(isPresetActive(presets.find(x => x.id === 'tomorrow')!, 'date', d(2026, 10, 21, 12))).toBe(true);
    expect(isPresetActive(presets.find(x => x.id === 'today')!, 'date', d(2026, 10, 21, 12))).toBe(false);
    expect(isPresetDisabled(presets.find(x => x.id === 'today')!, 'date', d(2026, 10, 21))).toBe(true);
    expect(isPresetDisabled(presets.find(x => x.id === 'tomorrow')!, 'date', d(2026, 10, 21))).toBe(false);
  });
});

test('gmtOffsetLabel has the expected shape', () => {
  expect(gmtOffsetLabel()).toMatch(/^GMT[+−]\d{1,2}(:\d{2})?$/);
});

test('startOfDay drops the time', () => {
  expect(startOfDay(d(2026, 10, 20, 15, 3, 9))).toEqual(d(2026, 10, 20));
});
