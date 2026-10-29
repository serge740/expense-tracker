import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { STRINGS, type Language } from '@/i18n/strings';
import { FAMILY_ERROR_CODES, familyErrorCode, familyErrorKey, isNotAMember, isProgrammingError } from '@/utils/family-errors';

const LANGS: Language[] = ['en', 'fr', 'rw', 'sw'];
const fail = (code: string | undefined, status = 400) => ({ response: { status, data: code ? { statusCode: status, message: 'x', code } : { message: 'x' } } });

describe('family error codes', () => {
  test('the app knows exactly the codes the server can send', () => {
    const backend = readFileSync(join(__dirname, '..', '..', '..', 'backend', 'src', 'modules', 'family', 'family-errors.ts'), 'utf8');
    const union = backend.slice(backend.indexOf('export type FamilyErrorCode ='), backend.indexOf('export function familyError'));
    const fromBackend = [...union.matchAll(/'([A-Z_]+)'/g)].map(m => m[1]);
    expect([...fromBackend].sort()).toEqual([...FAMILY_ERROR_CODES].sort());
  });

  test.each(LANGS)('every code has a sentence in %s', lang => {
    const dict = STRINGS[lang] as Record<string, string>;
    for (const code of [...FAMILY_ERROR_CODES, 'GENERIC', 'NETWORK']) {
      expect(dict[`fam.err.${code}`]).toBeTruthy();
    }
  });

  test('the translations are real sentences, not the code or English left in another language by accident', () => {
    for (const code of FAMILY_ERROR_CODES) {
      for (const lang of ['fr', 'rw', 'sw'] as Language[]) {
        const text = (STRINGS[lang] as Record<string, string>)[`fam.err.${code}`];
        expect(text).not.toBe(code);
        expect(text.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('reading an error', () => {
  test('a known server code gives its own message key', () => {
    expect(familyErrorCode(fail('INVITE_EXPIRED', 410))).toBe('INVITE_EXPIRED');
    expect(familyErrorKey(fail('INVITE_EXPIRED', 410))).toBe('fam.err.INVITE_EXPIRED');
    expect(familyErrorKey(fail('FAMILY_FULL', 409))).toBe('fam.err.FAMILY_FULL');
  });
  test('an unknown code, no code, or a non-error falls back to the general sentence', () => {
    expect(familyErrorCode(fail('SOMETHING_NEW'))).toBeNull();
    expect(familyErrorKey(fail('SOMETHING_NEW', 500))).toBe('fam.err.GENERIC');
    expect(familyErrorKey(fail(undefined, 500))).toBe('fam.err.GENERIC');
    expect(familyErrorKey(null)).toBe('fam.err.NETWORK');
    expect(familyErrorKey(new Error('boom'))).toBe('fam.err.NETWORK');       // no response at all: the network
  });
  test('"not a member" and programming errors are recognised', () => {
    expect(isNotAMember(fail('NOT_A_MEMBER', 403))).toBe(true);
    expect(isNotAMember(fail('FORBIDDEN_ACTION', 403))).toBe(false);
    for (const c of ['BAD_FAMILY_HEADER', 'WRONG_SCOPE', 'PERSONAL_ONLY']) expect(isProgrammingError(fail(c))).toBe(true);
    expect(isProgrammingError(fail('INVITE_EXPIRED'))).toBe(false);
  });
});
