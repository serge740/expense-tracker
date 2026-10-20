import { describe, expect, test } from '@jest/globals';
import { STRINGS } from '@/i18n/strings';
import type { AttentionItem } from '@/services/home.service';
import { asFeedView, currencyEntries, FEED_CHIPS, hasLoanMovement, needsLoansHint, visibleAttention } from '@/utils/home';

const att = (n: number): AttentionItem[] => Array.from({ length: n }, (_, i) => ({
  source: 'DEBT' as const, debtId: `d${i}`, kind: 'BORROWED' as const, person: `P${i}`, currency: 'RWF', remaining: 100, dueAt: '2030-01-01T00:00:00Z', overdue: false,
}));

describe('Home chips', () => {
  test('there are six, in the order of the design, with the names the server uses', () => {
    expect(FEED_CHIPS.map(c => c.id)).toEqual(['all', 'income', 'expense', 'debt', 'credit', 'scheduled']);
  });
  test('every chip label exists in all four languages', () => {
    for (const code of ['en', 'fr', 'rw', 'sw'] as const) {
      for (const c of FEED_CHIPS) expect({ code, c: c.id, ok: !!STRINGS[code][c.label] }).toEqual({ code, c: c.id, ok: true });
    }
  });
  test('a remembered value is trusted only if it is one of them', () => {
    expect(asFeedView('debt')).toBe('debt');
    expect(asFeedView('scheduled')).toBe('scheduled');
    expect(asFeedView('nonsense')).toBe('all');
    expect(asFeedView(undefined)).toBe('all');
    expect(asFeedView(null)).toBe('all');
    expect(asFeedView(5)).toBe('all');
  });
});

describe('per-currency lists', () => {
  test('sorted, and never merged', () => {
    expect(currencyEntries({ USD: 1, RWF: 2, EUR: 3 }).map(([c]) => c)).toEqual(['EUR', 'RWF', 'USD']);
  });
  test('missing data is an empty list, not a crash', () => {
    expect(currencyEntries(undefined)).toEqual([]);
    expect(currencyEntries(null)).toEqual([]);
    expect(currencyEntries({})).toEqual([]);
  });
});

describe('needs attention', () => {
  test('three rows by default, all of them when expanded', () => {
    expect(visibleAttention(att(7), false)).toHaveLength(3);
    expect(visibleAttention(att(7), true)).toHaveLength(7);
  });
  test('fewer than three just shows them', () => {
    expect(visibleAttention(att(2), false)).toHaveLength(2);
    expect(visibleAttention([], false)).toEqual([]);
  });
});

describe('loans', () => {
  test('the hint appears only for the Debt and Credit chips with loans switched off', () => {
    expect(needsLoansHint('debt', false)).toBe(true);
    expect(needsLoansHint('credit', false)).toBe(true);
    expect(needsLoansHint('debt', true)).toBe(false);
    expect(needsLoansHint('all', false)).toBe(false);
    expect(needsLoansHint('income', false)).toBe(false);
  });
  test('the loans line is worth showing once anything moved', () => {
    expect(hasLoanMovement({ out: 0, in: 0, borrowed: 0 })).toBe(false);
    expect(hasLoanMovement({ out: 1, in: 0, borrowed: 0 })).toBe(true);
    expect(hasLoanMovement({ out: 0, in: 0, borrowed: 5 })).toBe(true);
  });
});
