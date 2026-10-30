import { describe, expect, test } from 'vitest';
import {
  changeOf, currencyOf, dayKey, dayName, emptyKind, groupByDay, netEffect, pickCurrency, repaymentProgress, rowBadges, shortAmount, signedAmount, sparkline, transferAmounts, variantOf,
  type CurrencySummary, type FeedRow, type FeedSummary,
} from '@/utils/history';

const NOW = new Date(2026, 9, 29, 15, 0, 0);
const at = (days: number, hour = 12) => new Date(2026, 9, 29 + days, hour, 0, 0).toISOString();
const wallet = (name: string, currency = 'RWF') => ({ name, color: '#E0A800', currency, archived: false });
const row = (id: string, days: number, extra: Partial<FeedRow> = {}): FeedRow => ({
  id, type: 'EXPENSE', category: 'food', title: id, subCategory: null, description: null, amount: -1000, date: at(days), walletId: 'w1', wallet: wallet('MoMo'), currency: 'RWF',
  receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, debt: null, fundedBy: null, schedule: null, transfer: null, ...extra,
});

describe('days', () => {
  test('a row belongs to the person\'s own calendar day', () => {
    expect(dayKey(new Date(2026, 9, 29, 0, 5))).toBe('2026-10-29');
    expect(dayKey(new Date(2026, 9, 29, 23, 55))).toBe('2026-10-29');
  });
  test('names: today, yesterday, a date, a date with its year', () => {
    expect(dayName(new Date(2026, 9, 29), NOW)).toEqual({ kind: 'today' });
    expect(dayName(new Date(2026, 9, 28), NOW)).toEqual({ kind: 'yesterday' });
    expect(dayName(new Date(2026, 9, 12), NOW)).toMatchObject({ kind: 'date', withYear: false });
    expect(dayName(new Date(2025, 11, 31), NOW)).toMatchObject({ kind: 'date', withYear: true });
  });
});

describe('grouping rows into days', () => {
  test('keeps the order, one group per day, and rows of a day stay together', () => {
    const g = groupByDay([row('a', 0, { date: at(0, 14) }), row('b', 0, { date: at(0, 9) }), row('c', -1), row('d', -5)], 'RWF');
    expect(g.map(x => x.key)).toEqual(['2026-10-29', '2026-10-28', '2026-10-24']);
    expect(g[0].rows.map(r => r.id)).toEqual(['a', 'b']);
  });
  test('the day net is per currency and ignores transfers and borrowed money', () => {
    const g = groupByDay([
      row('inc', 0, { type: 'INCOME', amount: 850_000 }), row('exp', 0, { amount: -12_400 }), row('usd', 0, { amount: -12.99, wallet: wallet('Card', 'USD'), currency: 'USD' }),
      row('xf', 0, { type: 'TRANSFER', amount: 50_000 }), row('borrow', 0, { type: 'INCOME', amount: 200_000, debtRole: 'BORROW_IN' }),
    ], 'RWF')[0];
    expect(g.net).toEqual([{ currency: 'RWF', amount: 837_600 }, { currency: 'USD', amount: -12.99 }]);
  });
  test('a row without a wallet uses the person\'s own currency', () => {
    expect(currencyOf(row('n', 0, { wallet: null, currency: null }), 'EUR')).toBe('EUR');
    expect(groupByDay([row('n', 0, { wallet: null, currency: null, amount: -5 })], 'EUR')[0].net).toEqual([{ currency: 'EUR', amount: -5 }]);
  });
  test('no rows, no groups', () => {
    expect(groupByDay([], 'RWF')).toEqual([]);
  });
  test('net effect', () => {
    expect(netEffect(row('x', 0, { amount: -5 }))).toBe(-5);
    expect(netEffect(row('x', 0, { type: 'TRANSFER', amount: 5 }))).toBe(0);
    expect(netEffect(row('x', 0, { type: 'INCOME', amount: 5, debtRole: 'BORROW_IN' }))).toBe(0);
    expect(netEffect(row('x', 0, { type: 'INCOME', amount: 5, debtRole: 'REPAY_IN' }))).toBe(5);
  });
});

describe('money text', () => {
  test.each([
    [12_400, '12,400'], [0.5, '0.50'], [-0.01, '0.01'], [1_250_000_000, '1.25B'], [10_000_000, '10M'], [9_999_999, '9,999,999'], [123_456_789, '123.46M'],
  ])('%d is %s', (n, text) => { expect(shortAmount(n)).toBe(text); });
  test('signs use a real minus, and a transfer has none', () => {
    expect(signedAmount(850_000)).toBe('+850,000');
    expect(signedAmount(-12_400)).toBe('−12,400');
    expect(signedAmount(50_000, { transfer: true })).toBe('50,000');
    expect(signedAmount(-12.99)).toBe('−12.99');
    expect(signedAmount(0)).toBe('0');
  });
});

describe('what kind of row it is', () => {
  test.each([
    [{}, 'expense'], [{ type: 'INCOME' }, 'income'], [{ type: 'TRANSFER' }, 'transfer'], [{ type: 'INCOME', debtRole: 'BORROW_IN' }, 'borrowed'],
    [{ debtRole: 'LEND_OUT' }, 'lent'], [{ debtRole: 'REPAY_OUT' }, 'repayPaid'], [{ type: 'INCOME', debtRole: 'REPAY_IN' }, 'repayReceived'],
  ])('%j is %s', (extra, variant) => { expect(variantOf(row('x', 0, extra as never))).toBe(variant); });

  test('badges carry icon and word, never colour alone', () => {
    const b = rowBadges(row('x', 0, { receiptUrl: 'r.jpg', receiptReportUrl: 'r.pdf', schedule: { id: 's', title: 'Rent', repeat: { unit: 'MONTH' }, mode: 'REMIND_CONFIRM', status: 'ACTIVE' } }));
    expect(b.map(x => x.label)).toEqual(['badge.monthly', 'badge.receipt', 'badge.report']);
    expect(b.every(x => !!x.icon)).toBe(true);
    expect(rowBadges(row('x', 0, { type: 'INCOME', debtRole: 'BORROW_IN' }))[0]).toMatchObject({ label: 'badge.borrowed', tone: 'warn' });
    expect(rowBadges(row('x', 0, { fundedBy: { debtId: 'd', person: 'Mama' } })).find(x => x.label === 'badge.fundedBy')?.vars).toEqual({ person: 'Mama' });
    expect(rowBadges(row('x', 0))).toEqual([]);
  });

  test('a repayment shows "3 of 5" only when there are pay dates and payments', () => {
    const debt = { person: 'Jean', kind: 'BORROWED' as const, status: 'OPEN', amount: 500, paid: 150, currency: 'RWF', payments: 3, installments: 5 };
    expect(repaymentProgress(row('x', 0, { debtRole: 'REPAY_OUT', debt }))).toEqual({ done: 3, total: 5 });
    expect(repaymentProgress(row('x', 0, { debtRole: 'REPAY_OUT', debt: { ...debt, installments: 0 } }))).toBeNull();
    expect(repaymentProgress(row('x', 0, { debtRole: 'BORROW_IN', debt }))).toBeNull();
    expect(repaymentProgress(row('x', 0, { debtRole: 'REPAY_OUT', debt: { ...debt, payments: 9 } }))).toEqual({ done: 5, total: 5 });
  });

  test('a transfer between two currencies shows both amounts and the rate', () => {
    const t = row('x', 0, { type: 'TRANSFER', amount: 130_000, wallet: wallet('Bank'), transfer: { toWalletId: 'w2', toWallet: wallet('Dollar', 'USD'), toAmount: 100, exchangeRate: 0.00077 } });
    expect(transferAmounts(t)).toEqual({ out: 130_000, in: 100, outCurrency: 'RWF', inCurrency: 'USD', rate: 0.00077 });
    const same = row('y', 0, { type: 'TRANSFER', amount: 50_000, wallet: wallet('MoMo'), transfer: { toWalletId: 'w3', toWallet: wallet('Cash'), toAmount: 50_000, exchangeRate: null } });
    expect(transferAmounts(same).in).toBeNull();
  });
});

describe('the summary card', () => {
  const cur = (currency: string, extra: Partial<CurrencySummary> = {}): CurrencySummary => ({ currency, income: 0, expense: 0, net: 0, count: 1, series: [], previous: null, spendingChangePct: null, ...extra });
  const summary = (...c: CurrencySummary[]): FeedSummary => ({ period: { kind: 'month', from: null, to: null }, count: 1, currencies: c, converted: null });

  test('shows the chosen currency, or the busiest when it is gone', () => {
    const s = summary(cur('RWF'), cur('USD'));
    expect(pickCurrency(s, 'USD')!.currency).toBe('USD');
    expect(pickCurrency(s, 'EUR')!.currency).toBe('RWF');
    expect(pickCurrency(s, null)!.currency).toBe('RWF');
    expect(pickCurrency(summary(), null)).toBeNull();
    expect(pickCurrency(null, null)).toBeNull();
  });
  test('the change: up, down, same, or nothing to compare', () => {
    expect(changeOf(cur('RWF', { spendingChangePct: 23 }))).toEqual({ dir: 'up', pct: 23 });
    expect(changeOf(cur('RWF', { spendingChangePct: -8 }))).toEqual({ dir: 'down', pct: 8 });
    expect(changeOf(cur('RWF', { spendingChangePct: 0 }))).toEqual({ dir: 'same', pct: 0 });
    expect(changeOf(cur('RWF'))).toBeNull();
  });
  test('the trend line', () => {
    expect(sparkline([])).toBe('');
    expect(sparkline([5])).toBe('');
    const flat = sparkline([0, 0, 0]);
    expect(flat.startsWith('M4 36')).toBe(true);
    const up = sparkline([0, 10], 84, 40, 4);
    expect(up).toBe('M4 36 L80 4');
  });
  test('which empty state', () => {
    expect(emptyKind({ rows: 3, hasAny: true, filtered: false, periodIsAll: false })).toBeNull();
    expect(emptyKind({ rows: 0, hasAny: false, filtered: false, periodIsAll: true })).toBe('none');
    expect(emptyKind({ rows: 0, hasAny: true, filtered: true, periodIsAll: false })).toBe('filter');
    expect(emptyKind({ rows: 0, hasAny: true, filtered: false, periodIsAll: false })).toBe('period');
    expect(emptyKind({ rows: 0, hasAny: true, filtered: false, periodIsAll: true })).toBe('none');
  });
});

import { activeFilterCount, clearFilter, cyclePick, emptyFilter, filterChips, groupRows, isFiltered, isKindOn, parseMoney, pickState, removeChip, setKind, toggleKind, visibleSubs } from '@/utils/history';
import { thisMonth as thisMonthP } from '@/utils/period';

describe('the filter', () => {
  const f0 = () => emptyFilter(thisMonthP(new Date(2026, 9, 29)));
  test('starts empty: nothing is filtered, no badge', () => {
    expect(activeFilterCount(f0())).toBe(0);
    expect(isFiltered(f0())).toBe(false);
    expect(isKindOn(f0(), 'all')).toBe(true);
  });
  test('a chip tap is one kind; the sheet can pick several', () => {
    const one = setKind(f0(), 'transfer');
    expect(one.kinds).toEqual(['transfer']);
    expect(isKindOn(one, 'all')).toBe(false);
    expect(setKind(one, 'all').kinds).toEqual([]);
    expect(toggleKind(toggleKind(f0(), 'income'), 'expense').kinds).toEqual(['income', 'expense']);
    expect(toggleKind(toggleKind(f0(), 'income'), 'income').kinds).toEqual([]);
  });
  test('tap once to include, again to leave out, again to clear', () => {
    const food = { c: 'food' };
    const a = cyclePick(f0(), food);
    expect(pickState(a, food)).toBe('include');
    const b = cyclePick(a, food);
    expect(pickState(b, food)).toBe('exclude');
    expect(b.include).toEqual([]);
    expect(pickState(cyclePick(b, food), food)).toBe('none');
  });
  test('a whole category and its own sub-categories never sit together', () => {
    const food = { c: 'food' }, pizza = { c: 'food', s: 'Pizza' }, lunch = { c: 'food', s: 'Lunch' };
    let f = cyclePick(f0(), pizza);
    expect(pickState(f, food)).toBe('some');
    f = cyclePick(f, lunch);
    expect(f.include).toEqual([pizza, lunch]);
    f = cyclePick(f, food); // choosing the whole category replaces its parts
    expect(f.include).toEqual([food]);
    f = cyclePick(f0(), food);
    f = cyclePick(f, pizza); // choosing one part replaces the whole
    expect(f.include).toEqual([pizza]);
  });
  test('"no sub-category" is its own choice, and sub-category names ignore case', () => {
    const none = { c: 'food', none: true };
    expect(pickState(cyclePick(f0(), none), none)).toBe('include');
    const f = cyclePick(f0(), { c: 'food', s: 'Pizza' });
    expect(pickState(f, { c: 'food', s: 'pizza' })).toBe('include');
  });
  test('chips: one per choice, included and left-out apart; removing one takes only that', () => {
    let f = f0();
    f = cyclePick(f, { c: 'food', s: 'Pizza' });
    f = cyclePick(cyclePick(f, { c: 'bills', s: 'Rent' }), { c: 'bills', s: 'Rent' }); // second tap leaves it out
    f = { ...f, walletIds: ['w1', 'w2'], minAmount: 5000, receipt: 'with', source: 'schedule', includeLoans: false, kinds: ['income'] };
    const chips = filterChips(f);
    expect(chips.map(c => c.kind).sort()).toEqual(['amount', 'category', 'category', 'kind', 'loans', 'receipt', 'source', 'wallet', 'wallet']);
    expect(chips.find(c => c.exclude)).toBeTruthy();
    expect(activeFilterCount(f)).toBe(chips.length);
    const wallet = chips.find(c => c.kind === 'wallet')!;
    expect(removeChip(f, wallet).walletIds).toEqual(['w2']);
    expect(removeChip(f, chips.find(c => c.kind === 'amount')!)).toMatchObject({ minAmount: null, maxAmount: null });
    expect(removeChip(f, chips.find(c => c.kind === 'loans')!).includeLoans).toBe(true);
    expect(removeChip(f, chips.find(c => c.exclude)!).exclude).toEqual([]);
  });
  test('clear all keeps the period and the sort', () => {
    const f = { ...f0(), walletIds: ['w'], sort: 'largest' as const, search: 'x' };
    const c = clearFilter(f);
    expect(c.period).toEqual(f.period);
    expect(c.sort).toBe('largest');
    expect(c.walletIds).toEqual([]);
    expect(c.search).toBe('');
  });
  test('search counts as filtered but not as a badge', () => {
    const f = { ...f0(), search: 'pizza' };
    expect(isFiltered(f)).toBe(true);
    expect(activeFilterCount(f)).toBe(0);
  });
  test('money boxes', () => {
    expect(parseMoney('5,000')).toBe(5000);
    expect(parseMoney(' 12.5 ')).toBe(12.5);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
  });
  test('"show more" keeps a long list short', () => {
    const subs = Array.from({ length: 9 }, (_, i) => ({ name: `s${i}`, count: 1, lastUsed: null }));
    expect(visibleSubs(subs, false)).toEqual({ shown: subs.slice(0, 5), hidden: 4 });
    expect(visibleSubs(subs, true)).toEqual({ shown: subs, hidden: 0 });
    expect(visibleSubs(subs.slice(0, 4), false).hidden).toBe(0);
  });
});

describe('grouping by week, month or not at all', () => {
  const r = (id: string, y: number, m: number, d: number, extra: Partial<FeedRow> = {}) => row(id, 0, { date: new Date(y, m, d, 12).toISOString(), ...extra });
  const rows = [r('a', 2026, 9, 29), r('b', 2026, 9, 27), r('c', 2026, 9, 25), r('d', 2026, 8, 30)];
  test('weeks start on the chosen day', () => {
    const mon = groupRows(rows, 'week', 'RWF', 'monday');
    expect(mon.map(g => g.key)).toEqual(['2026-10-26', '2026-10-19', '2026-09-28']);
    expect(mon[0].rows.map(x => x.id)).toEqual(['a', 'b']);
    const sun = groupRows(rows, 'week', 'RWF', 'sunday');
    expect(sun.map(g => g.key)).toEqual(['2026-10-25', '2026-09-27']);
  });
  test('months', () => {
    const g = groupRows(rows, 'month', 'RWF');
    expect(g.map(x => x.key)).toEqual(['2026-10', '2026-09']);
    expect(g[0].net).toEqual([{ currency: 'RWF', amount: -3000 }]);
  });
  test('none is one list', () => {
    const g = groupRows(rows, 'none', 'RWF');
    expect(g).toHaveLength(1);
    expect(g[0].rows).toHaveLength(4);
  });
  test('day is the day grouping', () => {
    expect(groupRows(rows, 'day', 'RWF').map(g => g.key)).toEqual(['2026-10-29', '2026-10-27', '2026-10-25', '2026-09-30']);
  });
});

import { mergeKinds, type FacetCategory } from '@/utils/history';

describe('one choice per category, even when it is both income and spending', () => {
  const cat = (category: string, kind: 'EXPENSE' | 'INCOME', count: number, subs: Array<[string, number, string | null]>, noSub = 0): FacetCategory => ({
    category, kind, count, noSub, lastUsed: null, subs: subs.map(([name, c, lastUsed]) => ({ name, count: c, lastUsed })),
  });
  test('gifts given and gifts received become one row with both lists of sub-categories', () => {
    const out = mergeKinds([cat('gifts', 'EXPENSE', 5, [['Tithe', 5, '2026-10-02']], 0), cat('gifts', 'INCOME', 3, [['Birthday money', 2, '2026-10-05'], ['tithe', 1, '2026-10-09']], 1), cat('food', 'EXPENSE', 20, [])]);
    expect(out.map(c => c.category)).toEqual(['food', 'gifts']);
    const gifts = out[1];
    expect(gifts.count).toBe(8);
    expect(gifts.noSub).toBe(1);
    expect(gifts.subs.map(s => [s.name, s.count])).toEqual([['Tithe', 6], ['Birthday money', 2]]);
    expect(gifts.subs[0].lastUsed).toBe('2026-10-09');
    expect(gifts.kind).toBe('EXPENSE');
  });
  test('nothing in, nothing out', () => { expect(mergeKinds([])).toEqual([]); });
});
