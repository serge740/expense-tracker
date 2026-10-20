import { describe, expect, test } from '@jest/globals';
import { STRINGS, StringKey } from '@/i18n/strings';
import { dayOrdinal, describeRule, TextEnv } from '@/utils/recurrence-text';
import { blankRule, RepeatRule, Wall } from '@/utils/recurrence';

const env = (language: 'en' | 'fr' | 'rw' | 'sw', locale: string): TextEnv => ({
  language, locale,
  t: (key: StringKey, vars) => STRINGS[language][key].replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`)),
});
const EN = env('en', 'en-US');
const S = (y: number, m: number, d: number, h = 9, mi = 0): Wall => ({ y, m, d, h, mi });
const rule = (o: Partial<RepeatRule>): RepeatRule => ({ ...blankRule('DAY'), ...o });
const start = S(2026, 10, 20);   // a Tuesday

describe('describeRule (English)', () => {
  test('one time', () => expect(describeRule(null, start, EN)).toBe('Does not repeat'));
  test('daily and every N days', () => {
    expect(describeRule(rule({ unit: 'DAY' }), start, EN)).toBe('Every day at 9:00 AM');
    expect(describeRule(rule({ unit: 'DAY', every: 3 }), start, EN)).toBe('Every 3 days at 9:00 AM');
  });
  test('weekly list', () => {
    expect(describeRule(rule({ unit: 'WEEK', weekdays: [2, 5] }), start, EN)).toBe('Every Tuesday and Friday at 9:00 AM');
    expect(describeRule(rule({ unit: 'WEEK', weekdays: [1, 3, 5] }), start, EN)).toBe('Every Monday, Wednesday and Friday at 9:00 AM');
  });
  test('weekly with no day chosen uses the start day', () => {
    expect(describeRule(rule({ unit: 'WEEK' }), start, EN)).toBe('Every Tuesday at 9:00 AM');
  });
  test('every 2 weeks with a count', () => {
    expect(describeRule(rule({ unit: 'WEEK', every: 2, weekdays: [1], ends: { type: 'after', count: 10 } }), start, EN))
      .toBe('Every 2 weeks on Monday at 9:00 AM, 10 times');
  });
  test('monthly days, until a date', () => {
    expect(describeRule(rule({ unit: 'MONTH', monthDays: [1, 15], ends: { type: 'on', date: '2027-12-31' } }), start, EN))
      .toMatch(/^Every month on the 1st and 15th at 9:00 AM, until Dec 31, 2027$/);
  });
  test('last day sorts last', () => {
    expect(describeRule(rule({ unit: 'MONTH', monthDays: [-1, 15] }), start, EN)).toBe('Every month on the 15th and last day at 9:00 AM');
  });
  test('weekday of the month', () => {
    expect(describeRule(rule({ unit: 'MONTH', nth: { n: 2, weekday: 5 } }), start, EN)).toBe('Every month on the 2nd Friday at 9:00 AM');
    expect(describeRule(rule({ unit: 'MONTH', nth: { n: -1, weekday: 5 } }), start, EN)).toBe('Every month on the last Friday at 9:00 AM');
  });
  test('every N months', () => {
    expect(describeRule(rule({ unit: 'MONTH', every: 3, monthDays: [1] }), start, EN)).toBe('Every 3 months on the 1st at 9:00 AM');
  });
  test('yearly and quarterly', () => {
    expect(describeRule(rule({ unit: 'YEAR', months: [3], monthDays: [5] }), start, EN)).toBe('Every year in March on the 5th at 9:00 AM');
    expect(describeRule(rule({ unit: 'YEAR', months: [1, 4, 7, 10], monthDays: [10] }), start, EN))
      .toBe('Every year in January, April, July and October on the 10th at 9:00 AM');
  });
  test('"1 time" is singular', () => {
    expect(describeRule(rule({ unit: 'DAY', ends: { type: 'after', count: 1 } }), start, EN)).toBe('Every day at 9:00 AM, 1 time');
  });
  test('the time follows the start time', () => {
    expect(describeRule(rule({ unit: 'DAY' }), S(2026, 10, 20, 19, 30), EN)).toBe('Every day at 7:30 PM');
  });
});

describe('ordinals', () => {
  test('English suffixes, including 11th, 12th, 13th, 21st, 22nd, 23rd', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(n => dayOrdinal(n, EN)))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '30th', '31st']);
  });
  test('French: 1er then plain numbers', () => {
    const fr = env('fr', 'fr-FR');
    expect([1, 2, 15].map(n => dayOrdinal(n, fr))).toEqual(['1er', '2', '15']);
  });
  test('last day', () => expect(dayOrdinal(-1, EN)).toBe('last day'));
});

describe('other languages produce complete sentences', () => {
  const cases: ['fr' | 'rw' | 'sw', string][] = [['fr', 'fr-FR'], ['rw', 'rw-RW'], ['sw', 'sw-KE']];
  const rules: RepeatRule[] = [
    rule({ unit: 'DAY' }), rule({ unit: 'DAY', every: 2 }),
    rule({ unit: 'WEEK', weekdays: [2, 5] }), rule({ unit: 'WEEK', every: 2, weekdays: [1] }),
    rule({ unit: 'MONTH', monthDays: [1, -1] }), rule({ unit: 'MONTH', every: 3, monthDays: [1] }),
    rule({ unit: 'MONTH', nth: { n: 2, weekday: 5 } }), rule({ unit: 'MONTH', every: 2, nth: { n: -1, weekday: 5 } }),
    rule({ unit: 'YEAR', months: [3], monthDays: [5] }), rule({ unit: 'YEAR', every: 2, months: [3, 9], monthDays: [5] }),
    rule({ unit: 'DAY', ends: { type: 'after', count: 5 } }), rule({ unit: 'DAY', ends: { type: 'on', date: '2027-01-31' } }),
  ];
  test.each(cases)('%s: no placeholders left and the time is shown', (language, locale) => {
    for (const r of rules) {
      const text = describeRule(r, start, env(language, locale));
      expect(text).not.toMatch(/[{}]/);
      expect(text).toMatch(/9[:.]00/);
    }
  });
  test('French wording', () => {
    expect(describeRule(rule({ unit: 'MONTH', monthDays: [1, 15] }), start, env('fr', 'fr-FR'))).toMatch(/^Chaque mois le 1er et 15 à/);
  });
});
