import {
  addLocalDays, advance, buildLadder, canPush, DUE_INDEX, inQuietHours, isValidClock, isValidTimeZone, localParts,
  quietEnd, shouldDigest, snoozeTarget, startPlan, tzOffsetMinutes, zonedToUtc,
} from './reminder-policy';

const KGL = 'Africa/Kigali';            // UTC+2, no DST
const NY = 'America/New_York';          // DST
const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi));
const MIN = 60_000;

describe('time zones', () => {
  it('knows valid and invalid zones', () => {
    expect(isValidTimeZone(KGL)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('reads local wall-clock parts', () => {
    expect(localParts(utc(2026, 10, 20, 22, 30), KGL)).toEqual({ y: 2026, m: 10, d: 21, h: 0, mi: 30 });
  });

  it('computes the offset, including daylight saving', () => {
    expect(tzOffsetMinutes(utc(2026, 10, 20), KGL)).toBe(120);
    expect(tzOffsetMinutes(utc(2026, 7, 1), NY)).toBe(-240);   // EDT
    expect(tzOffsetMinutes(utc(2026, 12, 1), NY)).toBe(-300);  // EST
  });

  it('converts wall-clock time back to an instant', () => {
    expect(zonedToUtc({ y: 2026, m: 10, d: 21, h: 9, mi: 0 }, KGL).toISOString()).toBe('2026-10-21T07:00:00.000Z');
  });

  it('adds local days keeping the wall clock across a DST change', () => {
    // 9:00 New York on Sat 31 Oct 2026 (EDT) → Mon 2 Nov 9:00 (EST, DST ended Sun 1 Nov)
    const start = zonedToUtc({ y: 2026, m: 10, d: 31, h: 9, mi: 0 }, NY);
    const later = addLocalDays(start, 2, NY);
    expect(localParts(later, NY)).toMatchObject({ d: 2, m: 11, h: 9, mi: 0 });
    expect(later.getTime() - start.getTime()).toBe(49 * 60 * MIN); // 48 h + the extra hour
  });
});

describe('ladder', () => {
  const due = utc(2026, 10, 25, 16, 0); // 18:00 in Kigali
  const ladder = buildLadder(due, KGL);

  it('has 12 steps in time order', () => {
    expect(ladder).toHaveLength(12);
    expect(ladder.map(s => s.at.getTime())).toEqual([...ladder.map(s => s.at.getTime())].sort((a, b) => a - b));
    expect(ladder[DUE_INDEX].kind).toBe('DUE');
    expect(ladder[DUE_INDEX].at.getTime()).toBe(due.getTime());
  });

  it('follows 1 day, 1 hour, due, +30 min, +2 h, then daily', () => {
    expect(ladder.slice(0, 5).map(s => s.at.getTime() - due.getTime())).toEqual([-1440, -60, 0, 30, 120].map(m => m * MIN));
    expect(ladder.slice(5).every(s => s.kind === 'LATE_DAY')).toBe(true);
    expect(ladder.slice(5).map(s => localParts(s.at, KGL).h)).toEqual(Array(7).fill(18));
  });

  it('emails at the first lead, at due and daily when late; never on the short re-fires', () => {
    expect(ladder.filter(s => s.email).map(s => s.kind)).toEqual(['LEAD_DAY', 'DUE', ...Array(7).fill('LATE_DAY')]);
  });
});

describe('startPlan', () => {
  const due = utc(2026, 10, 25, 16, 0);
  const ladder = buildLadder(due, KGL);

  it('a far-away date starts at the first lead', () => {
    expect(startPlan(ladder, utc(2026, 10, 1))).toEqual({ step: 0, at: ladder[0].at });
  });

  it('skips lead steps that already passed without firing them', () => {
    const p = startPlan(ladder, new Date(due.getTime() - 3 * 60 * MIN))!; // due in 3 hours
    expect(p.step).toBe(1);
    expect(p.at.getTime()).toBe(due.getTime() - 60 * MIN);
  });

  it('a date due in 30 minutes goes straight to the due step', () => {
    const p = startPlan(ladder, new Date(due.getTime() - 30 * MIN))!;
    expect(p.step).toBe(2);
    expect(p.at.getTime()).toBe(due.getTime());
  });

  it('an already-overdue date fires once right away on its current step', () => {
    const now = new Date(due.getTime() + 3 * 60 * MIN);
    expect(startPlan(ladder, now)).toEqual({ step: 4, at: now }); // past +2 h
  });

  it('a date overdue by more than the whole timeline fires once and then ends', () => {
    const now = new Date(due.getTime() + 30 * 24 * 60 * MIN);
    const p = startPlan(ladder, now)!;
    expect(p.step).toBe(11);
    expect(advance(ladder, p.step, now)).toBeNull();
  });
});

describe('advance', () => {
  const due = utc(2026, 10, 25, 16, 0);
  const ladder = buildLadder(due, KGL);

  it('goes to the next step', () => {
    const now = due;
    expect(advance(ladder, 2, now)).toEqual({ step: 3, at: ladder[3].at });
  });

  it('skips steps missed during downtime, so there is no burst', () => {
    const now = new Date(due.getTime() + 3 * 24 * 60 * MIN + 5 * MIN); // server back 3 days late
    const p = advance(ladder, 2, now)!;
    expect(p.at.getTime()).toBeGreaterThan(now.getTime());
    expect(p.step).toBe(8); // third daily nudge is already past, so next is day 4
  });

  it('returns null after the last step', () => {
    expect(advance(ladder, 11, utc(2026, 12, 1))).toBeNull();
  });
});

describe('snooze', () => {
  const now = utc(2026, 10, 20, 12, 0);

  it.each([[10], [30], [60], [1440], [10080]])('%i minutes is a preset', m => {
    expect(snoozeTarget(now, { minutes: m }).getTime()).toBe(now.getTime() + m * MIN);
  });

  it('refuses other minute values', () => {
    expect(() => snoozeTarget(now, { minutes: 7 })).toThrow('Choose');
  });

  it('accepts a custom future time', () => {
    const until = utc(2026, 10, 22, 8, 0);
    expect(snoozeTarget(now, { until })).toBe(until);
  });

  it('refuses a past, near-instant, invalid or too-far custom time', () => {
    expect(() => snoozeTarget(now, { until: utc(2026, 10, 19) })).toThrow('future');
    expect(() => snoozeTarget(now, { until: new Date(now.getTime() + 30_000) })).toThrow('future');
    expect(() => snoozeTarget(now, { until: new Date('nope') })).toThrow('valid');
    expect(() => snoozeTarget(now, { until: utc(2028, 1, 1) })).toThrow('far');
  });
});

describe('quiet hours', () => {
  const q = { enabled: true, start: '22:00', end: '07:00', tz: KGL };
  const at = (h: number, mi = 0, d = 20) => zonedToUtc({ y: 2026, m: 10, d, h, mi }, KGL);

  it('is off when disabled or when start equals end', () => {
    expect(inQuietHours(at(23), { ...q, enabled: false })).toBe(false);
    expect(inQuietHours(at(23), { ...q, start: '08:00', end: '08:00' })).toBe(false);
  });

  it('covers a window that crosses midnight', () => {
    expect(inQuietHours(at(22, 0), q)).toBe(true);
    expect(inQuietHours(at(23, 59), q)).toBe(true);
    expect(inQuietHours(at(3), q)).toBe(true);
    expect(inQuietHours(at(6, 59), q)).toBe(true);
    expect(inQuietHours(at(7, 0), q)).toBe(false);
    expect(inQuietHours(at(12), q)).toBe(false);
    expect(inQuietHours(at(21, 59), q)).toBe(false);
  });

  it('covers a same-day window', () => {
    const day = { ...q, start: '13:00', end: '15:00' };
    expect(inQuietHours(at(14), day)).toBe(true);
    expect(inQuietHours(at(15), day)).toBe(false);
  });

  it('quietEnd is unchanged outside quiet hours', () => {
    const t = at(12);
    expect(quietEnd(t, q)).toBe(t);
  });

  it('quietEnd moves a late-evening time to the next morning', () => {
    expect(quietEnd(at(23, 30), q).getTime()).toBe(at(7, 0, 21).getTime());
  });

  it('quietEnd moves a small-hours time to the same morning', () => {
    expect(quietEnd(at(3, 15, 21), q).getTime()).toBe(at(7, 0, 21).getTime());
  });

  it('rejects malformed clock strings', () => {
    expect(isValidClock('07:30')).toBe(true);
    expect(isValidClock('7:30')).toBe(true);
    expect(isValidClock('25:00')).toBe(false);
    expect(isValidClock('noon')).toBe(false);
    expect(() => inQuietHours(at(1), { ...q, start: 'noon' })).toThrow('HH:MM');
  });
});

describe('caps and digests', () => {
  it('stops pushing at the daily cap', () => {
    expect(canPush(7, 8)).toBe(true);
    expect(canPush(8, 8)).toBe(false);
  });
  it('collapses three or more into one digest', () => {
    expect(shouldDigest(2)).toBe(false);
    expect(shouldDigest(3)).toBe(true);
  });
});
