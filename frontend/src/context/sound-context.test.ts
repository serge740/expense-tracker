import { describe, expect, test } from 'vitest';
import { soundAllowed } from './sound-context';
import { pickLeader } from '@/lib/tab-leader';

const prefs = (o: object = {}) => ({ notificationSound: 'chime' as const, quietHours: true, quietStart: 22 * 60, quietEnd: 7 * 60, ...o });
const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m);

describe('soundAllowed', () => {
  test('silent never plays, even if urgent', () => {
    expect(soundAllowed(prefs({ notificationSound: 'silent' }), at(12), true)).toBe(false);
  });
  test('with quiet hours off, always plays', () => {
    expect(soundAllowed(prefs({ quietHours: false }), at(23))).toBe(true);
  });
  test('a quiet window that crosses midnight (22:00 to 07:00)', () => {
    expect(soundAllowed(prefs(), at(23, 30))).toBe(false);
    expect(soundAllowed(prefs(), at(3))).toBe(false);
    expect(soundAllowed(prefs(), at(6, 59))).toBe(false);
    expect(soundAllowed(prefs(), at(7))).toBe(true);
    expect(soundAllowed(prefs(), at(12))).toBe(true);
    expect(soundAllowed(prefs(), at(21, 59))).toBe(true);
  });
  test('a quiet window inside one day (13:00 to 14:00)', () => {
    const p = prefs({ quietStart: 13 * 60, quietEnd: 14 * 60 });
    expect(soundAllowed(p, at(13, 30))).toBe(false);
    expect(soundAllowed(p, at(14))).toBe(true);
  });
  test('urgent things get through quiet hours', () => {
    expect(soundAllowed(prefs(), at(23), true)).toBe(true);
  });
  test('the same start and end means no quiet window', () => {
    expect(soundAllowed(prefs({ quietStart: 600, quietEnd: 600 }), at(10))).toBe(true);
  });
});

describe('pickLeader (which open tab plays the sound)', () => {
  const peer = (id: string, openedAt: number, visible: boolean) => ({ id, openedAt, visible });
  test('a visible tab beats an older hidden one', () => {
    const peers = [peer('a', 1, false), peer('b', 5, true)];
    expect(pickLeader(peers, 'b')).toBe(true);
    expect(pickLeader(peers, 'a')).toBe(false);
  });
  test('with no visible tab, the oldest leads', () => {
    const peers = [peer('a', 9, false), peer('b', 2, false)];
    expect(pickLeader(peers, 'b')).toBe(true);
    expect(pickLeader(peers, 'a')).toBe(false);
  });
  test('ties go to the lower id, so every tab agrees', () => {
    const peers = [peer('b', 1, true), peer('a', 1, true)];
    expect(pickLeader(peers, 'a')).toBe(true);
    expect(pickLeader(peers, 'b')).toBe(false);
  });
  test('exactly one tab is the leader', () => {
    const peers = [peer('a', 3, true), peer('b', 1, true), peer('c', 2, false)];
    expect(['a', 'b', 'c'].filter(id => pickLeader(peers, id))).toEqual(['b']);
  });
});
