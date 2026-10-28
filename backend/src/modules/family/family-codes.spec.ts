import { CODE_ALPHABET, CODE_LENGTH, hashToken, newInviteCode, newInviteToken, normaliseCode, normaliseToken } from './family-codes';

describe('invite codes', () => {
  test('the alphabet has 32 symbols and none that look alike', () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    for (const bad of ['0', 'O', '1', 'I']) expect(CODE_ALPHABET).not.toContain(bad);
    expect(new Set(CODE_ALPHABET).size).toBe(32);
  });

  test('a new code is six symbols from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = newInviteCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  test('codes do not repeat in a normal run', () => {
    const seen = new Set(Array.from({ length: 500 }, newInviteCode));
    expect(seen.size).toBeGreaterThan(495);
  });

  test('typed codes ignore case, spaces and dashes', () => {
    expect(normaliseCode(' k7m-2qx ')).toBe('K7M2QX');
    expect(normaliseCode('k7m2qx')).toBe('K7M2QX');
  });

  test('anything that cannot be a code is refused', () => {
    expect(normaliseCode('K7M2Q')).toBeNull();        // too short
    expect(normaliseCode('K7M2QXX')).toBeNull();      // too long
    expect(normaliseCode('K7M2Q0')).toBeNull();       // a zero is never in a code
    expect(normaliseCode('K7M2QI')).toBeNull();
    expect(normaliseCode(undefined)).toBeNull();
    expect(normaliseCode(123456)).toBeNull();
  });
});

describe('invite tokens', () => {
  test('tokens are long, URL-safe and different each time', () => {
    const a = newInviteToken(), b = newInviteToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(normaliseToken(a)).toBe(a);
  });

  test('only the hash is meant to be stored, and it is stable and never the token', () => {
    const t = newInviteToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).not.toBe(hashToken(newInviteToken()));
  });

  test('a pasted token with the wrong shape is refused before it reaches the database', () => {
    expect(normaliseToken('short')).toBeNull();
    expect(normaliseToken('has spaces in it that is long enough ok')).toBeNull();
    expect(normaliseToken({})).toBeNull();
  });
});
