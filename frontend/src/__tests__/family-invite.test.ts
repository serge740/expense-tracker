import { describe, expect, test, vi } from 'vitest';
import { CODE_ALPHABET, INVITE_LINK_ENABLED, appJoinUrl, inviteShareText, normaliseCode, parseInvite } from '@/utils/family-invite';
import { STRINGS } from '@/i18n/strings';

const TOKEN = 'abcDEF123_-abcDEF123_-abcd';          // 26 characters, URL safe

describe('codes', () => {
  test('the alphabet has no look-alikes', () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    for (const bad of ['0', 'O', '1', 'I']) expect(CODE_ALPHABET).not.toContain(bad);
  });
  test('typed codes ignore case, spaces and dashes', () => {
    expect(normaliseCode(' k7m-2qx ')).toBe('K7M2QX');
    expect(normaliseCode('K7M2QX')).toBe('K7M2QX');
  });
  test('anything that cannot be a code is refused', () => {
    for (const bad of ['K7M2Q', 'K7M2QXX', 'K7M2Q0', 'K7M2QI', '', undefined, 123456]) expect(normaliseCode(bad)).toBeNull();
  });
});

describe('what a person pastes', () => {
  test('a code', () => expect(parseInvite('k7m 2qx')).toEqual({ code: 'K7M2QX' }));
  test('the web link', () => {
    expect(parseInvite(`https://aby-expense.onrender.com/join/${TOKEN}`)).toEqual({ token: TOKEN });
    expect(parseInvite(`https://aby-expense.onrender.com/join/${TOKEN}?utm=x`)).toEqual({ token: TOKEN });
    expect(parseInvite(`  https://aby-expense.onrender.com/join/${TOKEN}/ `)).toEqual({ token: TOKEN });
  });
  test('the app link, with a token or a code', () => {
    expect(parseInvite(`expensetracker://family-join?token=${TOKEN}`)).toEqual({ token: TOKEN });
    expect(parseInvite('expensetracker://family-join?code=K7M2QX')).toEqual({ code: 'K7M2QX' });
  });
  test('a bare token', () => expect(parseInvite(TOKEN)).toEqual({ token: TOKEN }));
  test('anything else is not an invite', () => {
    for (const bad of ['hello', 'https://example.com/other', '', '   ', null, undefined, 42]) expect(parseInvite(bad)).toBeNull();
  });
  test('an app link can be built from what the server gave', () => {
    expect(appJoinUrl({ token: TOKEN })).toBe(`expensetracker://family-join?token=${TOKEN}`);
    expect(appJoinUrl({ code: 'K7M2QX' })).toBe('expensetracker://family-join?code=K7M2QX');
    expect(parseInvite(appJoinUrl({ token: TOKEN }))).toEqual({ token: TOKEN });
  });
});

describe('the share message', () => {
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    (STRINGS.en as Record<string, string>)[key].replace(/\{(\w+)\}/g, (_m, k) => String(vars[k]));

  test('always has the family, the code, how to use it, and the expiry', () => {
    const text = inviteShareText({ familyName: 'Mwiza Family', code: 'K7M2QX', link: 'https://x/join/abc', days: 7, t });
    expect(text).toContain('Mwiza Family');
    expect(text).toContain('K7M2QX');
    expect(text).toContain('Join with a code');
    expect(text).toContain('7 days');
  });
  test('carries the link only once the web page exists', () => {
    const text = inviteShareText({ familyName: 'Mwiza Family', code: 'K7M2QX', link: 'https://x/join/abc', days: 7, t });
    expect(text.includes('https://x/join/abc')).toBe(INVITE_LINK_ENABLED);
  });
  test('exists in every language', () => {
    for (const lang of ['en', 'fr', 'rw', 'sw'] as const) {
      const d = STRINGS[lang] as Record<string, string>;
      for (const k of ['family.share.line', 'family.share.code', 'family.share.how', 'family.share.link', 'family.share.expires']) expect(d[k]).toBeTruthy();
    }
  });
});
