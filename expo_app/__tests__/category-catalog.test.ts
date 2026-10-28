import { describe, expect, test } from '@jest/globals';
import { CATEGORIES, LEGACY_CATEGORY, canonicalCategory, categoryLabelKey, categoryOf } from '@/constants/categories';
import { EXPENSE_CATALOG, INCOME_CATALOG, groupKey, type Catalog } from '@/constants/category-catalog';
import { STRINGS, LANGUAGES } from '@/i18n/strings';
import { MAX_SUBCATEGORY_LENGTH, categoriesFor, itemsOf, fold, type Kind } from '@/utils/category-search';

const codes = LANGUAGES.map(l => l.code);

describe('the categories people see', () => {
  test('spending has the ten, in the order of the design', () => {
    expect(categoriesFor('EXPENSE').map(c => c.id)).toEqual(
      ['food', 'transport', 'bills', 'shopping', 'health', 'entertainment', 'gifts', 'business', 'insurance', 'other']);
  });

  test('income has eight, salary first', () => {
    expect(categoriesFor('INCOME').map(c => c.id)).toEqual(['salary', 'business', 'freelance', 'investment', 'gifts', 'refund', 'savings', 'other']);
  });

  test('the automatic loan category is never offered', () => {
    expect(categoriesFor('EXPENSE').some(c => c.id === 'loan')).toBe(false);
    expect(categoriesFor('INCOME').some(c => c.id === 'loan')).toBe(false);
  });

  test.each(codes)('%s has a name for every category, and income gifts are just "Gifts"', code => {
    for (const c of CATEGORIES) expect(STRINGS[code][`cat.${c.id}` as keyof typeof STRINGS.en]?.trim()).toBeTruthy();
    expect(STRINGS[code]['cat.gifts_in']?.trim()).toBeTruthy();
  });

  test('the renamed ones say what the design asked for', () => {
    expect(STRINGS.en['cat.health']).toBe('Personal');
    expect(STRINGS.en['cat.gifts']).toBe('Giving');
    expect(STRINGS.en['cat.insurance']).toBe('Finance');
    expect(categoryLabelKey('gifts', 'EXPENSE')).toBe('cat.gifts');
    expect(categoryLabelKey('gifts', 'INCOME')).toBe('cat.gifts_in');
  });
});

describe('what happened to the old categories', () => {
  test('every retired one lands on a category that is offered', () => {
    const offered = new Set(CATEGORIES.map(c => c.id));
    for (const [old, to] of Object.entries(LEGACY_CATEGORY)) {
      expect(offered.has(to!.id)).toBe(true);
      expect(old in LEGACY_CATEGORY && LEGACY_CATEGORY[to!.id]).toBeFalsy();
    }
  });

  test('a stored retired value shows as its new home, with a subcategory where it is obvious', () => {
    expect(canonicalCategory('groceries')).toEqual({ id: 'food', sub: 'Groceries' });
    expect(canonicalCategory('fuel')).toEqual({ id: 'transport', sub: 'Fuel' });
    expect(canonicalCategory('travel')).toEqual({ id: 'transport' });
    expect(categoryOf('personal_care').id).toBe('health');
    expect(categoryOf('something-new').id).toBe('other');
  });

  test('the suggestions of a category it moved into include what the old name meant', () => {
    expect(itemsOf('EXPENSE', 'food').map(i => i.name)).toContain('Groceries');
    expect(itemsOf('EXPENSE', 'transport').map(i => i.name)).toEqual(expect.arrayContaining(['Fuel', 'Flights', 'Hotel']));
    expect(itemsOf('EXPENSE', 'bills').map(i => i.name)).toContain('Rent');
    expect(itemsOf('EXPENSE', 'health').map(i => i.name)).toEqual(expect.arrayContaining(['School fees', 'Haircut']));
    expect(itemsOf('EXPENSE', 'gifts').map(i => i.name)).toContain('Family support');
  });
});

const CATALOGS: [Kind, Catalog][] = [['EXPENSE', EXPENSE_CATALOG], ['INCOME', INCOME_CATALOG]];
describe.each(CATALOGS)('the %s catalog', (kind, catalog) => {
  test('it covers exactly the categories offered', () => {
    expect(Object.keys(catalog).sort()).toEqual(categoriesFor(kind).map(c => c.id).sort());
  });

  test('every item is a short, clean name, never repeated inside its category', () => {
    for (const c of categoriesFor(kind)) {
      const seen = new Set<string>();
      for (const i of itemsOf(kind, c.id)) {
        expect(i.name).toBe(i.name.trim());
        expect(i.name.length).toBeGreaterThan(0);
        expect(i.name.length).toBeLessThanOrEqual(MAX_SUBCATEGORY_LENGTH);
        expect(seen.has(fold(i.name))).toBe(false);
        seen.add(fold(i.name));
      }
    }
  });

  test('only "Other" is empty: the person types their own there', () => {
    for (const c of categoriesFor(kind)) {
      expect(itemsOf(kind, c.id).length > 0).toBe(c.id !== 'other');
    }
  });
});

describe('group names are translated', () => {
  test.each(codes)('%s names every group of the spending categories', code => {
    for (const [category, groups] of Object.entries(EXPENSE_CATALOG)) {
      for (const g of groups ?? []) {
        const key = groupKey(category as never, g.id) as keyof typeof STRINGS.en;
        expect(STRINGS[code][key]?.trim()).toBeTruthy();
      }
    }
  });

  test('the design\'s own examples are there', () => {
    const names = (c: keyof typeof EXPENSE_CATALOG) => itemsOf('EXPENSE', c as never).map(i => i.name);
    expect(names('food')).toEqual(expect.arrayContaining(['Pizza', 'Brochettes', 'Bottled water', 'Ice cream']));
    expect(names('entertainment')).toEqual(expect.arrayContaining(['Netflix', 'Showmax', 'Boomplay', 'Game Pass']));
    expect(names('insurance')).toEqual(expect.arrayContaining(['MoMo fees', 'Bank fees', 'Traffic fine']));
    expect(names('gifts')).toEqual(expect.arrayContaining(['Tithe', 'Zakat', 'Dowry', 'Funeral']));
  });
});
