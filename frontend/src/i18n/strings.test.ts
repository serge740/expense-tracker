import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES, STRINGS, type StringKey } from './strings';
import { translate } from '@/context/language-context';
import { formatClock } from '@/context/preferences-context';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('translations', () => {
  test.each(LANGUAGES.map(l => l.code))('%s has every key, with the same placeholders as English', code => {
    const dict = STRINGS[code];
    for (const key of Object.keys(STRINGS.en) as StringKey[]) {
      expect(dict[key]?.trim(), `${code}: ${key}`).toBeTruthy();
      expect({ key, vars: placeholders(dict[key]) }).toEqual({ key, vars: placeholders(STRINGS.en[key]) });
    }
  });

  test('every literal t("key") used in the code exists', () => {
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !p.includes(join('i18n', 'strings'))) files.push(p);
      }
    };
    walk(root);
    const missing: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)['"]/g)) {
        if (!(m[1] in STRINGS.en)) missing.push(`${f.slice(root.length + 1)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('translate', () => {
  test('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('en', 'home.netWorth', { currency: 'RWF' })).toContain('RWF');
    expect(translate('en', 'home.netWorth')).toContain('{currency}');
  });
  test('French differs from English', () => {
    expect(translate('fr', 'home.netWorth', { currency: 'RWF' })).toBe('PATRIMOINE NET · RWF');
  });
});

describe('formatClock', () => {
  test('24 hour', () => {
    expect(formatClock(9 * 60 + 5, '24h')).toBe('09:05');
    expect(formatClock(0, '24h')).toBe('00:00');
  });
  test('12 hour, with midnight and noon', () => {
    expect(formatClock(0, '12h')).toBe('12:00 AM');
    expect(formatClock(12 * 60, '12h')).toBe('12:00 PM');
    expect(formatClock(13 * 60 + 30, '12h')).toBe('1:30 PM');
  });
});
