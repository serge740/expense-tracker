import { describe, expect, test } from 'vitest';
import {
  MySubCategory, asMySubCategories, cleanSubCategory, fold, frequentCategories, isOwnName, matchItem, mineFor, searchEverything, searchWithin,
} from '@/utils/category-search';

const label = (slug: string) => ({ food: 'Food', transport: 'Transport', bills: 'Bills', shopping: 'Shopping', health: 'Personal', entertainment: 'Entertainment', gifts: 'Giving', business: 'Business', insurance: 'Finance', other: 'Other' } as Record<string, string>)[slug] ?? slug;

let n = 0;
const row = (o: Partial<MySubCategory>): MySubCategory => ({
  id: `r${++n}`, kind: 'EXPENSE', category: 'food', name: 'Pizza', usageCount: 1, lastUsedAt: '2030-01-01T00:00:00.000Z', ...o,
});

describe('what the server answers for the person own list', () => {
  const good = { id: 'a', kind: 'EXPENSE', category: 'food', name: 'Pizza', usageCount: 2, lastUsedAt: '2030-01-01T00:00:00.000Z' };

  test('a proper list is used as it is', () => {
    expect(asMySubCategories([good])).toEqual([good]);
    expect(asMySubCategories([])).toEqual([]);
  });

  test('anything that is not a list gives an empty one (an error page, an older server, nothing)', () => {
    for (const bad of ['<!doctype html><html></html>', { statusCode: 404, message: 'Not Found' }, null, undefined, 42, true]) {
      expect(asMySubCategories(bad)).toEqual([]);
    }
  });

  test('a half-made row is dropped, the good ones stay', () => {
    const rows = asMySubCategories([good, null, 'x', { ...good, id: 7 }, { ...good, kind: 'TRANSFER' }, { ...good, name: undefined }, { ...good, usageCount: '3' }, { ...good, id: 'b', name: 'Rice' }]);
    expect(rows.map(r => r.id)).toEqual(['a', 'b']);
  });
});

describe('folding and cleaning what is typed', () => {
  test('accents and capitals do not matter', () => {
    expect(fold('  Café ')).toBe('cafe');
    expect(fold('ÉCOLE')).toBe('ecole');
  });
  test('a typed name is trimmed, single-spaced and capped like the server does', () => {
    expect(cleanSubCategory('  Boda   to market ')).toBe('Boda to market');
    expect(cleanSubCategory('x'.repeat(60))).toHaveLength(40);
  });
});

describe('matching an item', () => {
  const ride = { name: 'Ride app', aliases: ['Uber', 'Bolt', 'Yego'] };
  test('finds it by name, and by a brand name (saying which)', () => {
    expect(matchItem(ride, 'ride')).toEqual({ hit: true, alias: null });
    expect(matchItem(ride, 'bolt')).toEqual({ hit: true, alias: 'Bolt' });
    expect(matchItem(ride, 'train')).toEqual({ hit: false, alias: null });
  });
  test('an empty search matches nothing', () => expect(matchItem(ride, '  ').hit).toBe(false));
});

describe('the search box on the category step', () => {
  test('"netflix" goes straight to Entertainment', () => {
    const hits = searchEverything('EXPENSE', 'netflix', [], label);
    expect(hits[0]).toMatchObject({ category: 'entertainment', sub: 'Netflix', group: 'streaming' });
  });

  test('a brand name finds the item that carries it: "bolt" is Transport › Ride app', () => {
    const hits = searchEverything('EXPENSE', 'bolt', [], label);
    expect(hits[0]).toMatchObject({ category: 'transport', sub: 'Ride app', alias: 'Bolt' });
  });

  test('a category is found by its name, in the language shown', () => {
    expect(searchEverything('EXPENSE', 'person', [], label)[0]).toMatchObject({ category: 'health', sub: null });
  });

  test('a subcategory the person typed before is found too, once', () => {
    const hits = searchEverything('EXPENSE', 'boda', [row({ category: 'transport', name: 'Boda to market' })], label);
    expect(hits.filter(h => h.sub === 'Boda to market')).toHaveLength(1);
    // but a built-in they have used is not listed twice
    const pizza = searchEverything('EXPENSE', 'pizza', [row({ category: 'food', name: 'Pizza' })], label);
    expect(pizza.filter(h => h.sub === 'Pizza')).toHaveLength(1);
  });

  test('spending and income do not see each other\'s items', () => {
    expect(searchEverything('INCOME', 'netflix', [], label)).toEqual([]);
    expect(searchEverything('INCOME', 'bonus', [], label)[0]).toMatchObject({ category: 'salary', sub: 'Bonus' });
  });

  test('nothing typed finds nothing, and the list is capped', () => {
    expect(searchEverything('EXPENSE', '', [], label)).toEqual([]);
    expect(searchEverything('EXPENSE', 'e', [], label, 5).length).toBeLessThanOrEqual(5);
  });
});

describe('searching inside one category', () => {
  test('finds items across every group, not just the open tab', () => {
    const r = searchWithin('EXPENSE', 'health', 'school', []);
    expect(r.found.map(f => f.item.name)).toEqual(expect.arrayContaining(['School fees', 'School supplies']));
    expect(r.found.every(f => f.group.length > 0)).toBe(true);
  });

  test('"yours" matches come first and are not repeated in the suggestions', () => {
    const mine = [row({ category: 'food', name: 'Pizza', usageCount: 4 })];
    const r = searchWithin('EXPENSE', 'food', 'pizz', mine);
    expect(r.yours.map(y => y.name)).toEqual(['Pizza']);
    expect(r.found.map(f => f.item.name)).not.toContain('Pizza');
  });

  test('typing something already in the list is "exact", so there is nothing new to add', () => {
    expect(searchWithin('EXPENSE', 'food', 'pizza', []).exact).toBe(true);
    expect(searchWithin('EXPENSE', 'food', ' PIZZA ', []).exact).toBe(true);
    expect(searchWithin('EXPENSE', 'food', 'pizza hut', []).exact).toBe(false);
    expect(searchWithin('EXPENSE', 'transport', 'boda to market', [row({ category: 'transport', name: 'Boda to market' })]).exact).toBe(true);
  });

  test('a brand name finds the item', () => {
    expect(searchWithin('EXPENSE', 'transport', 'uber', []).found[0].item.name).toBe('Ride app');
  });
});

describe('the person\'s own list', () => {
  test('is kept apart by category and by spending / income, the most used first', () => {
    const rows = [
      row({ id: 'a', category: 'food', name: 'Pizza', usageCount: 1 }),
      row({ id: 'b', category: 'food', name: 'Rice', usageCount: 7 }),
      row({ id: 'c', category: 'gifts', kind: 'INCOME', name: 'Family support', usageCount: 9 }),
      row({ id: 'd', category: 'food', name: 'Bread', usageCount: 7, lastUsedAt: '2031-01-01T00:00:00.000Z' }),
    ];
    expect(mineFor(rows, 'EXPENSE', 'food').map(r => r.name)).toEqual(['Bread', 'Rice', 'Pizza']);
    expect(mineFor(rows, 'EXPENSE', 'gifts')).toEqual([]);
    expect(mineFor(rows, 'INCOME', 'gifts').map(r => r.name)).toEqual(['Family support']);
  });

  test('tells the person\'s own words from the built-in ones', () => {
    expect(isOwnName('EXPENSE', 'food', 'pizza')).toBe(false);
    expect(isOwnName('EXPENSE', 'food', 'Mama Ntilie')).toBe(true);
  });

  test('the quick row shows the categories used most, never "Other"', () => {
    const rows = [
      row({ category: 'transport', name: 'Fuel', usageCount: 6 }),
      row({ category: 'food', name: 'Pizza', usageCount: 3 }),
      row({ category: 'food', name: 'Rice', usageCount: 4 }),
      row({ category: 'other', name: 'Thing', usageCount: 50 }),
      row({ category: 'bills', name: 'Rent', usageCount: 1 }),
      row({ category: 'gifts', kind: 'INCOME', name: 'Gift received', usageCount: 80 }),
    ];
    expect(frequentCategories('EXPENSE', rows).map(c => c.id)).toEqual(['food', 'transport', 'bills']);
    expect(frequentCategories('EXPENSE', [])).toEqual([]);
    expect(frequentCategories('EXPENSE', rows, 2)).toHaveLength(2);
  });
});
