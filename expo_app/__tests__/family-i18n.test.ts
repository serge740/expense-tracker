import { describe, expect, test } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { STRINGS, type Language } from '@/i18n/strings';
import { FAMILY_ACTIONS } from '@/utils/family-permissions';

const LANGS: Language[] = ['en', 'fr', 'rw', 'sw'];
const ROOT = join(__dirname, '..');
const dict = (l: Language) => STRINGS[l] as Record<string, string>;

/** Every family-related key in the English dictionary. */
const FAMILY_KEY = /^(family\.|fam\.|role\.)/;
const familyKeys = Object.keys(dict('en')).filter(k => FAMILY_KEY.test(k));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (['node_modules', '__tests__', '.expo', 'i18n', 'android', 'ios'].includes(name)) return [];
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('family text exists in every language', () => {
  test('there is a real amount of it', () => {
    expect(familyKeys.length).toBeGreaterThan(150);
  });

  test.each(LANGS)('%s has every family key, none empty', lang => {
    const d = dict(lang);
    const missing = familyKeys.filter(k => typeof d[k] !== 'string' || d[k].trim() === '');
    expect(missing).toEqual([]);
  });

  test.each(['fr', 'rw', 'sw'] as Language[])('%s has no key left as the English text (a forgotten translation), apart from names that are the same', lang => {
    const same = familyKeys.filter(k => dict(lang)[k] === dict('en')[k]);
    // Words that really are identical in the language (role/menu labels such as "Admin" or "Close").
    const allowed = new Set(['role.ADMIN', 'family.sheet.close', 'family.add.close', 'family.hub.save']);
    expect(same.filter(k => !allowed.has(k) && dict('en')[k].length > 12)).toEqual([]);
  });

  test('every language uses the same {placeholders} as English, so no value is dropped or invented', () => {
    for (const k of familyKeys) {
      const base = placeholders(dict('en')[k]);
      for (const lang of ['fr', 'rw', 'sw'] as Language[]) expect([k, lang, placeholders(dict(lang)[k])]).toEqual([k, lang, base]);
    }
  });

  test('no family text still contains the raw server code or a stray template mark', () => {
    for (const lang of LANGS) for (const k of familyKeys) {
      expect(dict(lang)[k]).not.toMatch(/\$\{|undefined|\[object/);
    }
  });
});

describe('every family key the app uses exists', () => {
  const used = new Set<string>();
  // These look like text keys but are not: permission names and the event names the server records.
  const notText = new Set<string>([...FAMILY_ACTIONS, 'family.created', 'family.updated', 'family.archived']);
  for (const file of sources(ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/['"`]((?:family|fam)\.[A-Za-z0-9_.]*[A-Za-z0-9_])['"`]/g)) if (!notText.has(m[1])) used.add(m[1]);
    for (const m of text.matchAll(/['"`](role\.(?:OWNER|ADMIN|MEMBER|VIEWER)(?:\.desc)?)['"`]/g)) used.add(m[1]);
  }

  test('the scan finds the keys used by the screens', () => {
    expect(used.size).toBeGreaterThan(120);
  });
  test.each(LANGS)('%s: each one is defined', lang => {
    const missing = [...used].filter(k => !(k in dict(lang)));
    expect(missing).toEqual([]);
  });
  test('the keys built from a role or a server code are all defined', () => {
    for (const lang of LANGS) {
      for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']) { expect(dict(lang)[`role.${role}`]).toBeTruthy(); expect(dict(lang)[`role.${role}.desc`]).toBeTruthy(); }
    }
  });
  test('no family key is defined but never used (dead text)', () => {
    const dynamicPrefixes = ['fam.err.', 'role.', 'family.act.'];
    const unused = familyKeys.filter(k => !used.has(k) && !dynamicPrefixes.some(p => k.startsWith(p)));
    expect(unused).toEqual([]);
  });
  test('activity sentences exist for every kind of event the server records', () => {
    for (const k of ['created', 'updated', 'archived', 'joined', 'left', 'removed', 'roleChanged', 'transferred', 'inviteCreated', 'inviteRevoked', 'inviteRevokedAll', 'other', 'someone']) {
      for (const lang of LANGS) expect(dict(lang)[`family.act.${k}`]).toBeTruthy();
    }
  });
});
