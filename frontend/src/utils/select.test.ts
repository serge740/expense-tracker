import { describe, expect, it } from 'vitest';
import { deleteEffect, isLocked, type FeedRow } from './history';

const row = (o: Partial<FeedRow>): FeedRow => ({ id: 'x', type: 'EXPENSE', amount: -100, wallet: { currency: 'RWF' }, debtId: null, ...o } as FeedRow);

describe('deleteEffect', () => {
  it('gives spending back and takes income out, per currency', () => {
    const e = deleteEffect([row({ amount: -100 }), row({ amount: -50 }), row({ type: 'INCOME', amount: 300 }), row({ amount: -5, wallet: { currency: 'USD' } as any })], 'RWF');
    expect(e).toEqual([{ currency: 'RWF', change: -150 }, { currency: 'USD', change: 5 }]);
  });
  it('leaves out transfers, counts loan rows like any other', () => {
    expect(deleteEffect([row({ type: 'TRANSFER', amount: 80 })], 'RWF')).toEqual([]);
    expect(deleteEffect([row({ debtId: 'd1', amount: -9 })], 'RWF')).toEqual([{ currency: 'RWF', change: 9 }]);
    expect(isLocked(row({ debtId: 'd1' }))).toBe(false);
    expect(isLocked(row({}))).toBe(false);
  });
});

import { duplicateParams, recurringParams, similarRows } from './history';
describe('quick peek helpers', () => {
  const r = (o: any) => row({ title: 'Lunch', category: 'food', walletId: 'w1', date: '2026-10-31T09:00:00.000Z', ...o });
  it('offers other rows with the same title in another category', () => {
    const a = r({ id: 'a' });
    const list = [a, r({ id: 'b', category: 'other' }), r({ id: 'c', title: ' lunch ', category: 'other' }), r({ id: 'd', category: 'food' }), r({ id: 'f', title: 'Taxi', category: 'other' })];
    expect(similarRows(list, a, 'transport').map(x => x.id)).toEqual(['d', 'b', 'c'].sort((x, y) => list.findIndex(z => z.id === x) - list.findIndex(z => z.id === y)));
  });
  it('copies an expense positive, but not a transfer', () => {
    expect(duplicateParams(r({ amount: -4200 }))).toEqual({ type: 'EXPENSE', amount: '4200', category: 'food', description: 'Lunch', walletId: 'w1' });
    expect(duplicateParams(r({ type: 'TRANSFER' }))).toBeNull();
  });
  it('makes a monthly rule starting next month, on a day every month has', () => {
    const p = recurringParams(r({ amount: -10 }), new Date(2026, 9, 29))!;
    expect(JSON.parse(p.repeat).monthDays).toEqual([28]);
    expect(new Date(p.date).getMonth()).toBe(10);
  });
});
