import { buildFacets, decodeOffset, encodeOffset, groupTotals, legacyWithSub, parseFeedFilter, parsePicks, parseSavedView, slugsFor } from './feed';

const NOW = new Date(2026, 9, 29, 10, 0, 0);

describe('the richer filter', () => {
  it('kinds: several at once, from the chip or the list, never duplicated, never "all"', () => {
    expect(parseFeedFilter({ kinds: 'income,transfer,income,all,bogus' }, NOW).kinds).toEqual(['income', 'transfer']);
    expect(parseFeedFilter({ view: 'debt', kinds: 'credit' }, NOW).kinds.sort()).toEqual(['credit', 'debt']);
  });
  it('amounts: numbers only, and a range typed backwards means between the two', () => {
    expect(parseFeedFilter({ minAmount: '5000', maxAmount: '100' }, NOW)).toMatchObject({ minAmount: 100, maxAmount: 5000 });
    expect(parseFeedFilter({ minAmount: 'lots', maxAmount: '-4' }, NOW)).toMatchObject({ minAmount: null, maxAmount: null });
    expect(parseFeedFilter({ minAmount: '0' }, NOW).minAmount).toBe(0);
  });
  it('receipt, source and sort fall back to the default', () => {
    expect(parseFeedFilter({ receipt: 'with', source: 'schedule', sort: 'largest' }, NOW)).toMatchObject({ receipt: 'with', source: 'schedule', sort: 'largest' });
    expect(parseFeedFilter({ receipt: 'x', source: 'x', sort: 'x' }, NOW)).toMatchObject({ receipt: 'any', source: 'any', sort: 'newest' });
  });
});

describe('picks', () => {
  it('reads whole categories, sub-categories and "no sub-category"', () => {
    expect(parsePicks(JSON.stringify([{ c: 'food' }, { c: 'food', s: ' Pizza ' }, { c: 'bills', none: true }]))).toEqual([{ c: 'food' }, { c: 'food', s: 'Pizza' }, { c: 'bills', none: true }]);
  });
  it.each([['not json'], ['{"c":"food"}'], [JSON.stringify([{ c: 'nonsense' }, { s: 'x' }, 5, null])], [''], [undefined], ['x'.repeat(7000)]])('drops %p', raw => {
    expect(parsePicks(raw)).toEqual([]);
  });
  it('caps the list and the length of a name', () => {
    expect(parsePicks(JSON.stringify(Array.from({ length: 90 }, () => ({ c: 'food' })))).length).toBe(60);
    expect(parsePicks(JSON.stringify([{ c: 'food', s: 'x'.repeat(100) }]))[0].s!.length).toBe(40);
  });
  it('travels in the filter', () => {
    const f = parseFeedFilter({ categories: JSON.stringify([{ c: 'food', s: 'Pizza' }]), excludeCategories: JSON.stringify([{ c: 'bills', s: 'Rent' }]) }, NOW);
    expect(f.include).toEqual([{ c: 'food', s: 'Pizza' }]);
    expect(f.exclude).toEqual([{ c: 'bills', s: 'Rent' }]);
  });
});

describe('retired categories', () => {
  it('a category includes the old values that became it', () => {
    expect(slugsFor('food').sort()).toEqual(['food', 'groceries']);
    expect(slugsFor('bills').sort()).toEqual(['bills', 'rent', 'subscriptions', 'utilities']);
    expect(slugsFor('groceries').sort()).toEqual(['food', 'groceries']);
    expect(slugsFor('salary')).toEqual(['salary']);
  });
  it('a sub-category that an old value implies', () => {
    expect(legacyWithSub('food', 'groceries')).toEqual(['groceries']);
    expect(legacyWithSub('food', 'Pizza')).toEqual([]);
    expect(legacyWithSub('bills', 'Rent')).toEqual(['rent']);
  });
});

describe('offset cursor', () => {
  it('round-trips, and anything odd is the start', () => {
    expect(decodeOffset(encodeOffset(120))).toBe(120);
    expect(decodeOffset(null)).toBe(0);
    expect(decodeOffset('nonsense')).toBe(0);
    expect(decodeOffset(Buffer.from('{"o":-3}').toString('base64url'))).toBe(0);
  });
});

describe('buildFacets', () => {
  const d = (day: number) => new Date(2026, 9, day);
  it('counts per category, folds retired ones in and merges spellings (first wins)', () => {
    const out = buildFacets([
      { type: 'EXPENSE', category: 'food', subCategory: 'Pizza', count: 8, lastUsed: d(10) },
      { type: 'EXPENSE', category: 'food', subCategory: 'pizza', count: 4, lastUsed: d(12) },
      { type: 'EXPENSE', category: 'food', subCategory: null, count: 6, lastUsed: d(2) },
      { type: 'EXPENSE', category: 'groceries', subCategory: null, count: 5, lastUsed: d(20) },
      { type: 'EXPENSE', category: 'transport', subCategory: 'Bus', count: 3, lastUsed: d(1) },
    ]);
    const food = out.find(c => c.category === 'food')!;
    expect(food.count).toBe(23);
    expect(food.noSub).toBe(6);
    expect(food.subs).toEqual([{ name: 'Pizza', count: 12, lastUsed: d(12).toISOString() }, { name: 'Groceries', count: 5, lastUsed: d(20).toISOString() }]);
    expect(food.lastUsed).toBe(d(20).toISOString());
    expect(out.map(c => c.category)).toEqual(['food', 'transport']);
  });
  it('income and spending stay apart, and transfers are left out', () => {
    const out = buildFacets([
      { type: 'INCOME', category: 'gifts', subCategory: 'Birthday money', count: 2, lastUsed: d(3) },
      { type: 'EXPENSE', category: 'gifts', subCategory: 'Tithe', count: 5, lastUsed: d(4) },
      { type: 'TRANSFER', category: 'other', subCategory: null, count: 9, lastUsed: d(5) },
    ]);
    expect(out.map(c => `${c.kind}:${c.category}`)).toEqual(['EXPENSE:gifts', 'INCOME:gifts']);
  });
  it('nothing in, nothing out', () => { expect(buildFacets([])).toEqual([]); });
});

describe('schedules, flags and groupings in the filter', () => {
  it('reads them, and ignores what it does not know', () => {
    expect(parseFeedFilter({ schedules: 'a1, b2,a1,bad id', schedMode: 'confirm', flags: 'duplicates,uncategorised,nonsense,duplicates', groupBy: 'wallet' }, NOW)).toMatchObject({ schedules: ['a1', 'b2'], schedMode: 'confirm', flags: ['duplicates', 'uncategorised'], groupBy: 'wallet' });
    expect(parseFeedFilter({ schedMode: 'x', groupBy: 'x' }, NOW)).toMatchObject({ schedules: [], schedMode: 'any', flags: [], groupBy: 'none' });
  });
});

describe('groupTotals', () => {
  const r = (key: string, walletCurrency: string, type: string, count: number, amount: number, debtRole: string | null = null) => ({ key, walletCurrency, type, count, amount, debtRole });
  it('adds up per group and per currency, never across currencies', () => {
    const out = groupTotals([r('food', 'RWF', 'EXPENSE', 3, 9000), r('food', 'USD', 'EXPENSE', 1, 12), r('food', 'RWF', 'INCOME', 1, 500), r('bills', 'RWF', 'EXPENSE', 2, 50000)], 'category');
    expect(out.map(g => g.key)).toEqual(['food', 'bills']);
    expect(out[0].count).toBe(5);
    expect(out[0].totals).toEqual([{ currency: 'RWF', income: 500, expense: 9000 }, { currency: 'USD', income: 0, expense: 12 }]);
  });
  it('a retired category counts with the one it became', () => {
    const out = groupTotals([r('food', 'RWF', 'EXPENSE', 2, 100), r('groceries', 'RWF', 'EXPENSE', 3, 200)], 'category');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: 'food', count: 5 });
    expect(out[0].totals[0].expense).toBe(300);
  });
  it('titles ignore case; borrowed money is not income; transfers are neither', () => {
    const out = groupTotals([r('Netflix', 'USD', 'EXPENSE', 1, 10), r('netflix', 'USD', 'EXPENSE', 1, 10), r('Loan', 'RWF', 'INCOME', 1, 5000, 'BORROW_IN'), r('Loan', 'RWF', 'TRANSFER', 1, 7)], 'title');
    expect(out.find(g => g.key === 'netflix')!.totals[0].expense).toBe(20);
    expect(out.find(g => g.key === 'loan')!.totals[0]).toEqual({ currency: 'RWF', income: 0, expense: 0 });
  });
  it('nothing in, nothing out', () => { expect(groupTotals([], 'wallet')).toEqual([]); });
});

describe('a saved view', () => {
  it('needs a name and a filter object', () => {
    expect(parseSavedView({ name: '  Rent   and bills ', filter: { kinds: ['expense'] } })).toEqual({ name: 'Rent and bills', filter: { kinds: ['expense'] } });
    expect(parseSavedView({ name: 'x'.repeat(60), filter: {} })!.name.length).toBe(40);
  });
  it.each([[null], [{}], [{ name: '', filter: {} }], [{ name: 'a', filter: [] }], [{ name: 'a', filter: 'x' }], [{ name: 5, filter: {} }], [{ name: 'a', filter: { big: 'x'.repeat(9000) } }]])('refuses %j', body => {
    expect(parseSavedView(body)).toBeNull();
  });
});
