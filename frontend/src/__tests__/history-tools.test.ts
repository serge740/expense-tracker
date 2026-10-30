import { describe, expect, test } from 'vitest';
import { categoryTotals, condsFromFilter, dayTotals, filterFromConds, localDay } from '@/components/history/history-tools';
import { emptyFilter, filterChips, removeChip, type FeedRow } from '@/utils/history';
import { filterFromQuery, filterToQuery } from '@/utils/history-url';
import { thisMonth } from '@/utils/period';

const base = emptyFilter(thisMonth());
const row = (o: Partial<FeedRow>): FeedRow => ({ id: 'x', type: 'EXPENSE', category: 'food', title: 'a', subCategory: null, description: null, amount: -100, date: '2026-10-05T10:00:00', walletId: null, wallet: null, currency: 'RWF', receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, debt: null, fundedBy: null, schedule: null, transfer: null, ...o } as FeedRow);

describe('advanced filter builder', () => {
  test('conditions become a filter and back', () => {
    const f = filterFromConds(base, [
      { id: 1, field: 'text', value: 'pizza' }, { id: 2, field: 'amountMin', value: '1000' }, { id: 3, field: 'amountMax', value: '5000' },
      { id: 4, field: 'category', value: 'food' }, { id: 5, field: 'categoryNot', value: 'bills' }, { id: 6, field: 'wallet', value: 'w1' },
      { id: 7, field: 'tag', value: '#trip' }, { id: 8, field: 'kind', value: 'expense' }, { id: 9, field: 'from', value: '2026-10-01' }, { id: 10, field: 'to', value: '2026-10-09' },
    ]);
    expect(f).toMatchObject({ search: 'pizza', minAmount: 1000, maxAmount: 5000, include: [{ c: 'food' }], exclude: [{ c: 'bills' }], walletIds: ['w1'], tags: ['trip'], kinds: ['expense'], period: { kind: 'range', from: '2026-10-01', to: '2026-10-09' } });
    const again = condsFromFilter(f).map(c => [c.field, c.value]);
    expect(again).toEqual([['text', 'pizza'], ['amountMin', '1000'], ['amountMax', '5000'], ['category', 'food'], ['categoryNot', 'bills'], ['wallet', 'w1'], ['tag', 'trip'], ['kind', 'expense'], ['from', '2026-10-01'], ['to', '2026-10-09']]);
  });
  test('no conditions clears what the builder controls but keeps the rest', () => {
    const start = { ...base, search: 'x', minAmount: 5, tags: ['a'], receipt: 'with' as const, sort: 'largest' as const, include: [{ c: 'food', s: 'Groceries' }] };
    const f = filterFromConds(start, []);
    expect(f).toMatchObject({ search: '', minAmount: null, tags: [], receipt: 'with', sort: 'largest', include: [{ c: 'food', s: 'Groceries' }] });
  });
  test('a range typed backwards, bad amounts and bad dates are tidied', () => {
    const f = filterFromConds(base, [{ id: 1, field: 'amountMin', value: '900' }, { id: 2, field: 'amountMax', value: '100' }, { id: 3, field: 'amountMin', value: 'abc' }, { id: 4, field: 'from', value: 'yesterday' }]);
    expect([f.minAmount, f.maxAmount, f.period]).toEqual([100, 900, base.period]);
  });
  test('only a start date runs to today; only an end date starts long ago', () => {
    expect(filterFromConds(base, [{ id: 1, field: 'from', value: '2026-01-01' }]).period).toMatchObject({ kind: 'range', from: '2026-01-01' });
    expect(filterFromConds(base, [{ id: 1, field: 'to', value: '2026-02-01' }]).period).toEqual({ kind: 'range', from: '2000-01-01', to: '2026-02-01' });
  });
});

describe('tags in the filter', () => {
  test('a tag is a chip, can be removed, and survives the address', () => {
    const f = { ...base, tags: ['trip', 'food'] };
    expect(filterChips(f).filter(c => c.kind === 'tag').map(c => c.ref)).toEqual(['trip', 'food']);
    expect(removeChip(f, { key: 'tag:trip', kind: 'tag', ref: 'trip' }).tags).toEqual(['food']);
    const q = filterToQuery(f);
    expect(q.tg).toBe('trip,food');
    expect(filterFromQuery(q, base).tags).toEqual(['trip', 'food']);
    expect(filterFromQuery({ tg: 'a|b,ok' }, base).tags).toEqual(['ok']);
  });
});

describe('calendar and chart numbers', () => {
  const rows = [
    row({ id: '1', amount: -1000, date: '2026-10-05T09:00:00' }), row({ id: '2', amount: -500, date: '2026-10-05T20:00:00' }), row({ id: '3', type: 'INCOME', category: 'salary', amount: 3000, date: '2026-10-06T08:00:00' }),
    row({ id: '4', type: 'TRANSFER', amount: 700, date: '2026-10-06T09:00:00' }), row({ id: '5', amount: -200, currency: 'USD', date: '2026-10-06T10:00:00' }),
    row({ id: '6', category: 'transport', amount: -300, date: '2026-10-06T11:00:00' }), row({ id: '7', category: 'loan', amount: -900, debtRole: 'REPAY_OUT', date: '2026-10-06T12:00:00' }),
  ];
  test('days add up in one currency; transfers and other currencies are left out', () => {
    const d = dayTotals(rows, 'RWF', 'RWF');
    expect(d.get('2026-10-05')).toEqual({ in: 0, out: 1500 });
    expect(d.get('2026-10-06')).toEqual({ in: 3000, out: 1200 });
    expect(dayTotals(rows, 'USD', 'RWF').get('2026-10-06')).toEqual({ in: 0, out: 200 });
  });
  test('categories rank spending and leave loans out', () => {
    expect(categoryTotals(rows, 'RWF', 'RWF')).toEqual([{ category: 'food', total: 1500 }, { category: 'transport', total: 300 }]);
  });
  test('a moment belongs to the day it is on the person’s own clock', () => {
    expect(localDay(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
    expect(localDay('2026-10-05T00:00:00')).toBe('2026-10-05');
  });
});
