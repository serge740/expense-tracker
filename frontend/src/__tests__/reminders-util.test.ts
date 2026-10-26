import { describe, expect, vi, test } from 'vitest';
import { STRINGS } from '@/i18n/strings';
import {
  clockToMinutes, closeAll, deviceTimeZone, minutesToClock, onReminderRefresh, quietMigrationPatch, requestReminderRefresh,
  SNOOZE_PRESETS, snoozeTime, visibleQueue, zoneLanguagePatch,
} from '@/utils/reminders';

const item = (id: string, lastFiredAt: string | null) => ({ id, lastFiredAt });

describe('snooze', () => {
  test('presets are 10 min, 30 min, 1 hour, 1 day, 1 week (the server accepts exactly these)', () => {
    expect(SNOOZE_PRESETS.map(p => p.minutes)).toEqual([10, 30, 60, 1440, 10080]);
  });

  test('every preset label exists in all four languages', () => {
    for (const code of ['en', 'fr', 'rw', 'sw'] as const) {
      for (const p of SNOOZE_PRESETS) expect({ code, ok: !!STRINGS[code][p.label] }).toEqual({ code, ok: true });
    }
  });

  test('snoozeTime adds the minutes', () => {
    const now = new Date('2026-10-21T16:02:00Z');
    expect(snoozeTime(now, 60).toISOString()).toBe('2026-10-21T17:02:00.000Z');
    expect(snoozeTime(now, 10080).getTime() - now.getTime()).toBe(7 * 24 * 3600_000);
  });
});

describe('clock strings', () => {
  test('minutes to HH:MM, wrapping around midnight', () => {
    expect(minutesToClock(0)).toBe('00:00');
    expect(minutesToClock(22 * 60)).toBe('22:00');
    expect(minutesToClock(7 * 60 + 30)).toBe('07:30');
    expect(minutesToClock(24 * 60)).toBe('00:00');
    expect(minutesToClock(-30)).toBe('23:30');
  });

  test('HH:MM back to minutes', () => {
    expect(clockToMinutes('22:00')).toBe(1320);
    expect(clockToMinutes('7:05')).toBe(425);
    expect(clockToMinutes('nonsense')).toBe(0);
  });

  test('round trip', () => {
    for (const m of [0, 30, 425, 1320, 1439]) expect(clockToMinutes(minutesToClock(m))).toBe(m);
  });
});

describe('time zone', () => {
  test('is a non-empty IANA name', () => {
    expect(deviceTimeZone().length).toBeGreaterThan(0);
  });
});

describe('popup queue', () => {
  test('everything shows when nothing was closed', () => {
    const q = [item('a', 't1'), item('b', 't2')];
    expect(visibleQueue(q, {})).toEqual(q);
  });

  test('closing with × hides a reminder until it fires again', () => {
    const q = [item('a', 't1'), item('b', 't2')];
    const closed = closeAll(q, {});
    expect(visibleQueue(q, closed)).toEqual([]);
    // it fired again: lastFiredAt changed, so it is back
    expect(visibleQueue([item('a', 't9'), item('b', 't2')], closed).map(i => i.id)).toEqual(['a']);
  });

  test('a brand-new reminder is never hidden by an older close', () => {
    const closed = closeAll([item('a', 't1')], {});
    expect(visibleQueue([item('a', 't1'), item('c', 't3')], closed).map(i => i.id)).toEqual(['c']);
  });

  test('closeAll keeps earlier entries and does not mutate its input', () => {
    const before = { z: 'old' };
    const out = closeAll([item('a', 't1')], before);
    expect(out).toEqual({ z: 'old', a: 't1' });
    expect(before).toEqual({ z: 'old' });
  });

  test('a reminder that never fired (null) still compares correctly', () => {
    const closed = closeAll([item('a', null)], {});
    expect(visibleQueue([item('a', null)], closed)).toEqual([]);
    expect(visibleQueue([item('a', 't1')], closed).length).toBe(1);
  });
});

describe('keeping the server in step', () => {
  test('sends only what differs', () => {
    expect(zoneLanguagePatch({ timezone: 'Africa/Kigali', language: 'fr' }, { timezone: 'UTC', language: 'en' })).toEqual({ timezone: 'Africa/Kigali', language: 'fr' });
    expect(zoneLanguagePatch({ timezone: 'Africa/Kigali', language: 'fr' }, { timezone: 'Africa/Kigali', language: 'en' })).toEqual({ language: 'fr' });
  });

  test('sends nothing when already in step', () => {
    expect(zoneLanguagePatch({ timezone: 'UTC', language: 'en' }, { timezone: 'UTC', language: 'en' })).toBeNull();
  });

  const local = { quietHours: true, quietStart: 22 * 60, quietEnd: 7 * 60 };

  test('quiet hours are copied to the server once', () => {
    expect(quietMigrationPatch(local, { quietEnabled: false }, false)).toEqual({ quietEnabled: true, quietStart: '22:00', quietEnd: '07:00' });
  });

  test('never copied twice, nor over a server setting, nor when the phone had them off', () => {
    expect(quietMigrationPatch(local, { quietEnabled: false }, true)).toBeNull();
    expect(quietMigrationPatch(local, { quietEnabled: true }, false)).toBeNull();
    expect(quietMigrationPatch({ ...local, quietHours: false }, { quietEnabled: false }, false)).toBeNull();
  });
});

describe('refresh signal', () => {
  test('listeners hear requests until they unsubscribe', () => {
    const a = vi.fn();
    const off = onReminderRefresh(a);
    requestReminderRefresh({ reset: true });
    requestReminderRefresh();
    expect(a.mock.calls).toEqual([[{ reset: true }], [{ reset: false }]]);
    off();
    requestReminderRefresh();
    expect(a).toHaveBeenCalledTimes(2);
  });
});
