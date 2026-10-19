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
