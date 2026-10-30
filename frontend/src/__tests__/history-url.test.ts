import { describe, expect, test } from 'vitest';
import { filterFromQuery, filterToQuery, fromStored, hasFilterQuery, periodFromText, periodToText, picksFrom, toStored } from '@/utils/history-url';
import { cyclePick, emptyFilter, groupByKey, groupShare, rowFlags, type FeedRow, type HistoryFilter } from '@/utils/history';
import { presetPeriod, thisMonth } from '@/utils/period';

const NOW = new Date(2026, 9, 29, 10, 0, 0);
const base = (): HistoryFilter => emptyFilter(thisMonth(NOW));

describe('periods as text', () => {
  test.each([
    [{ kind: 'month', month: 3, year: 2025 }, 'm:2025-03'], [{ kind: 'year', year: 2024 }, 'y:2024'], [{ kind: 'all' }, 'all'], [{ kind: 'range', from: '2026-10-05', to: '2026-10-09' }, 'r:2026-10-05~2026-10-09'],
  ])('%j', (p, text) => { expect(periodToText(p as never)).toBe(text); expect(periodFromText(text)).toEqual(p); });
  test.each([[null], ['m:2025-13'], ['m:2025'], ['y:abc'], ['r:2026-02-30~2026-03-01'], ['r:2026-10-09~2026-10-05'], ['nonsense'], [42]])('refuses %p', v => { expect(periodFromText(v)).toBeNull(); });
});

describe('the whole filter as an address', () => {
  test('the default filter is an empty address', () => {
    expect(filterToQuery(base(), NOW)).toEqual({});
    expect(hasFilterQuery({})).toBe(false);
  });
  test('everything round-trips', () => {
    let f: HistoryFilter = { ...base(), period: { kind: 'range', from: '2026-10-05', to: '2026-10-09' }, kinds: ['income', 'transfer'], walletIds: ['w1', 'w2'], memberId: 'm1', search: 'pizza',
      minAmount: 100, maxAmount: 900, receipt: 'with', source: 'schedule', schedules: ['s1'], schedMode: 'auto', flags: ['duplicates'], phase: 'upcoming', due: ['overdue', 'failed'], sort: 'largest', group: 'category', includeLoans: false };
    f = cyclePick(cyclePick(f, { c: 'food', s: 'Pizza' }), { c: 'bills' });
    f = cyclePick(cyclePick(f, { c: 'transport' }), { c: 'transport' });
    const q = filterToQuery(f, NOW);
    expect(hasFilterQuery(q)).toBe(true);
    expect(filterFromQuery(q, base())).toEqual(f);
  });
  test('an edited or old address can only show less: junk is dropped', () => {
    const f = filterFromQuery({ k: 'income,bogus', w: 'ok,bad id!', sort: 'sideways', grp: 'sky', rc: 'maybe', min: 'lots', inc: 'not json', p: 'm:2025-99', ph: 'x', due: 'overdue,nope' }, base());
    expect(f).toEqual({ ...base(), kinds: ['income'], walletIds: ['ok'], due: ['overdue'] });
  });
  test('amounts typed backwards still mean between the two', () => {
    expect(filterFromQuery({ min: '900', max: '100' }, base())).toMatchObject({ minAmount: 100, maxAmount: 900 });
  });
  test('picks are checked', () => {
    expect(picksFrom(JSON.stringify([{ c: 'food' }, { c: 'food', s: 'Pizza' }, { c: 'Bad!' }, 5, null, { c: 'bills', none: true }]))).toEqual([{ c: 'food' }, { c: 'food', s: 'Pizza' }, { c: 'bills', none: true }]);
    expect(picksFrom('x'.repeat(7000))).toEqual([]);
  });
});

describe('a saved view', () => {
  test('a quick period is kept by name, so the view stays current', () => {
    const saved = toStored({ ...base(), period: presetPeriod('last7', NOW), kinds: ['expense'] }, NOW);
    expect(saved.pp).toBe('last7');
    expect(saved.p).toBeUndefined();
    const later = new Date(2026, 10, 20);
    const back = fromStored(saved, emptyFilter(thisMonth(later)), later);
    expect(back.period).toEqual(presetPeriod('last7', later));
    expect(back.kinds).toEqual(['expense']);
  });
  test('this month is a name too; a custom range is kept exactly', () => {
    expect(toStored(base(), NOW).pp).toBe('thisMonth');
    const custom = toStored({ ...base(), period: { kind: 'range', from: '2026-10-05', to: '2026-10-09' } }, NOW);
    expect(custom.pp).toBeUndefined();
    expect(fromStored(custom, base(), NOW).period).toEqual({ kind: 'range', from: '2026-10-05', to: '2026-10-09' });
  });
  test('the search words are not part of a view', () => {
    expect(toStored({ ...base(), search: 'pizza' }, NOW).q).toBeUndefined();
  });
  test('a saved view round-trips every other choice', () => {
    const f: HistoryFilter = { ...base(), walletIds: ['w1'], include: [{ c: 'food' }], minAmount: 500, receipt: 'without', sort: 'oldest', group: 'wallet', flags: ['uncategorised'], includeLoans: false };
    expect(fromStored(toStored(f, NOW), base(), NOW)).toEqual(f);
  });
  test('a view that came back without a period means this month', () => {
    expect(fromStored({ k: 'income' }, { ...base(), period: { kind: 'all' } }, NOW).period).toEqual(thisMonth(NOW));
  });
});

describe('server groupings on the page', () => {
  const row = (id: string, extra: Partial<FeedRow>): FeedRow => ({
    id, type: 'EXPENSE', category: 'food', title: id, subCategory: null, description: null, amount: -10, date: new Date(2026, 9, 29).toISOString(), walletId: 'w1', wallet: null, currency: 'RWF',
    receiptUrl: null, receiptReportUrl: null, debtId: null, debtRole: null, debt: null, fundedBy: null, schedule: null, transfer: null, ...extra,
  });
  const canon = (s: string) => (s === 'groceries' ? 'food' : s);
  test('by category, retired ones joining the one they became; by wallet; by title ignoring case', () => {
    const rows = [row('a', { category: 'food' }), row('b', { category: 'bills' }), row('c', { category: 'groceries' })];
    expect(groupByKey(rows, 'category', canon).map(g => [g.key, g.rows.length])).toEqual([['food', 2], ['bills', 1]]);
    expect(groupByKey([row('a', { walletId: 'w1' }), row('b', { walletId: 'w2' }), row('c', { walletId: 'w1' })], 'wallet', canon).map(g => g.key)).toEqual(['w1', 'w2']);
    expect(groupByKey([row('a', { title: 'Netflix' }), row('b', { title: 'netflix ' })], 'title', canon)).toHaveLength(1);
  });
  test('by member', () => {
    const me = { clientId: 'm1', name: 'Aline', isYou: true }, gr = { clientId: 'm2', name: 'Grace', isYou: false };
    expect(groupByKey([row('a', { author: me }), row('b', { author: gr }), row('c', { author: me })], 'member', canon).map(g => g.rows.length)).toEqual([2, 1]);
  });
  test('the share of spending a group is, in one currency', () => {
    const all = [{ key: 'food', count: 3, totals: [{ currency: 'RWF', income: 0, expense: 750 }] }, { key: 'bills', count: 1, totals: [{ currency: 'RWF', income: 0, expense: 250 }] }, { key: 'x', count: 1, totals: [{ currency: 'USD', income: 0, expense: 9 }] }];
    expect(groupShare(all[0], all, 'RWF')).toBe(75);
    expect(groupShare(all[1], all, 'RWF')).toBe(25);
    expect(groupShare(all[2], all, 'RWF')).toBe(0);
    expect(groupShare(undefined, all, 'RWF')).toBeNull();
    expect(groupShare(all[0], [], 'RWF')).toBeNull();
  });
  test('flags on a row', () => {
    expect(rowFlags(row('a', {}))).toEqual([]);
    expect(rowFlags(row('a', { possibleDuplicate: true }))).toEqual(['duplicate']);
    expect(rowFlags(row('a', { category: 'other' }))).toEqual(['uncategorised']);
    expect(rowFlags(row('a', { category: 'other', subCategory: 'Gifts' }))).toEqual([]);
    expect(rowFlags(row('a', { category: 'other', type: 'TRANSFER' }))).toEqual([]);
    expect(rowFlags(row('a', { category: 'other', debtRole: 'LEND_OUT' }))).toEqual([]);
    expect(rowFlags(row('a', { category: 'other', possibleDuplicate: true }))).toEqual(['duplicate', 'uncategorised']);
  });
});
