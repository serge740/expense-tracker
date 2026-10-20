import { test, expect } from '@jest/globals';
import { STRINGS, LANGUAGES, StringKey } from '@/i18n/strings';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

test.each(LANGUAGES.map(l => l.code))('%s translates every key with the same placeholders as English', code => {
  const dict = STRINGS[code];
  for (const key of Object.keys(STRINGS.en) as StringKey[]) {
    expect(dict[key]?.trim()).toBeTruthy();
    expect({ key, vars: placeholders(dict[key]) }).toEqual({ key, vars: placeholders(STRINGS.en[key]) });
  }
});

// Every literal t('key') in the app must exist, so a lost or misspelled key fails here and not as raw text on screen.
test('every literal t() key used in the code exists in English', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const root = path.join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name) && !p.includes(path.join('i18n', 'strings'))) files.push(p);
    }
  };
  ['app', 'components', 'hooks', 'utils', 'context', 'services'].forEach(d => fs.existsSync(path.join(root, d)) && walk(path.join(root, d)));
  const missing: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)['"]/g)) {
      if (!(m[1] in STRINGS.en)) missing.push(`${path.relative(root, f)}: ${m[1]}`);
    }
  }
  expect(missing).toEqual([]);
});
