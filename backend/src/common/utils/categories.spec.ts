import { CategorySlug } from '../../../generated/prisma';
import { CATEGORY_LABELS, LEGACY_CATEGORY, canonicalCategory, normalizeSubCategory } from './categories';

const ALL = Object.values(CategorySlug) as string[];

describe('categories after the clean-up', () => {
  it('every old category moves to a real one that is not itself retired', () => {
    for (const [old, to] of Object.entries(LEGACY_CATEGORY)) {
      expect(ALL).toContain(old);
      expect(ALL).toContain(to.category);
      expect(LEGACY_CATEGORY[to.category]).toBeUndefined();
    }
  });

  it('turns groceries into Food > Groceries, and fuel into Transport > Fuel', () => {
    expect(canonicalCategory('groceries')).toEqual({ category: 'food', subCategory: 'Groceries' });
    expect(canonicalCategory('fuel')).toEqual({ category: 'transport', subCategory: 'Fuel' });
    expect(canonicalCategory('family')).toEqual({ category: 'gifts', subCategory: 'Family support' });
  });

  it('only fills in a subcategory where the old name says what was bought', () => {
    expect(canonicalCategory('travel')).toEqual({ category: 'transport' });
    expect(canonicalCategory('education')).toEqual({ category: 'health' });
    expect(canonicalCategory('utilities')).toEqual({ category: 'bills' });
  });

  it('leaves the categories people see alone', () => {
    for (const slug of ['food', 'transport', 'bills', 'shopping', 'health', 'entertainment', 'gifts', 'business', 'insurance', 'other', 'salary', 'loan']) {
      expect(canonicalCategory(slug)).toEqual({ category: slug });
    }
  });

  it('has a name for every stored category', () => {
    for (const slug of ALL) expect(CATEGORY_LABELS[slug]).toBeTruthy();
    expect(CATEGORY_LABELS.health).toBe('Personal');
    expect(CATEGORY_LABELS.gifts).toBe('Giving');
    expect(CATEGORY_LABELS.insurance).toBe('Finance');
  });
});

describe('normalizeSubCategory', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(normalizeSubCategory('  Boda   to market ')).toBe('Boda to market');
    expect(normalizeSubCategory('x'.repeat(100))).toHaveLength(40);
  });
  it('treats empty, blank and non-text as none', () => {
    expect(normalizeSubCategory('')).toBeNull();
    expect(normalizeSubCategory('   ')).toBeNull();
    expect(normalizeSubCategory(undefined)).toBeNull();
    expect(normalizeSubCategory(42)).toBeNull();
  });
});
