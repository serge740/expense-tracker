import type { ComponentProps } from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

/** Every value the server can store. Only the ones in CATEGORIES are offered; the rest are retired (see LEGACY_CATEGORY). */
export type CategorySlug =
  | 'food' | 'groceries' | 'transport' | 'fuel' | 'shopping' | 'bills' | 'rent' | 'utilities'
  | 'subscriptions' | 'health' | 'personal_care' | 'education' | 'family' | 'gifts'
  | 'entertainment' | 'travel' | 'insurance' | 'business'
  | 'salary' | 'freelance' | 'investment' | 'refund' | 'savings' | 'loan' | 'other';

export type CategoryDef = {
  id: CategorySlug;
  icon: IconName;
  color: string;
  /** Which transaction types offer this category. */
  for: ('EXPENSE' | 'INCOME')[];
  /** Set automatically (e.g. by Debts); not offered when adding by hand. */
  system?: boolean;
};

/**
 * Single source of truth for the categories people see (labels come from i18n: `cat.<id>`).
 * Some stored values are shown under a new name: `health` is "Personal" (medical, school, grooming),
 * `gifts` is "Giving" for spending and "Gifts" for income, `insurance` is "Finance".
 */
export const CATEGORIES: CategoryDef[] = [
  { id: 'food',          icon: 'restaurant',         color: '#F97316', for: ['EXPENSE'] },
  { id: 'transport',     icon: 'directions-car',     color: '#3B82F6', for: ['EXPENSE'] },
  { id: 'bills',         icon: 'receipt-long',       color: '#F59E0B', for: ['EXPENSE'] },
  { id: 'shopping',      icon: 'shopping-bag',       color: '#EC4899', for: ['EXPENSE'] },
  { id: 'health',        icon: 'person',             color: '#EF4444', for: ['EXPENSE'] },
  { id: 'entertainment', icon: 'movie',              color: '#F43F5E', for: ['EXPENSE'] },
  { id: 'gifts',         icon: 'volunteer-activism', color: '#E11D48', for: ['EXPENSE', 'INCOME'] },
  { id: 'business',      icon: 'business-center',    color: '#0F766E', for: ['EXPENSE', 'INCOME'] },
  { id: 'insurance',     icon: 'account-balance',    color: '#64748B', for: ['EXPENSE'] },
  { id: 'salary',        icon: 'work',               color: '#16A34A', for: ['INCOME'] },
  { id: 'freelance',     icon: 'laptop-mac',         color: '#0D9488', for: ['INCOME'] },
  { id: 'investment',    icon: 'trending-up',        color: '#059669', for: ['INCOME'] },
  { id: 'refund',        icon: 'replay',             color: '#0284C7', for: ['INCOME'] },
  { id: 'savings',       icon: 'savings',            color: '#15803D', for: ['INCOME'] },
  { id: 'loan',          icon: 'handshake',          color: '#B45309', for: ['EXPENSE', 'INCOME'], system: true },
  { id: 'other',         icon: 'more-horiz',         color: '#94A3B8', for: ['EXPENSE', 'INCOME'] },
];

/**
 * Categories that were merged into the ones above. The server moves old rows and old app versions' requests over, so
 * these only matter for anything cached or not yet moved. `sub` is filled in where the old name says what it was.
 */
export const LEGACY_CATEGORY: Partial<Record<CategorySlug, { id: CategorySlug; sub?: string }>> = {
  groceries: { id: 'food', sub: 'Groceries' },
  fuel: { id: 'transport', sub: 'Fuel' },
  travel: { id: 'transport' },
  rent: { id: 'bills', sub: 'Rent' },
  utilities: { id: 'bills' },
  subscriptions: { id: 'bills' },
  personal_care: { id: 'health' },
  education: { id: 'health' },
  family: { id: 'gifts', sub: 'Family support' },
};

/** Every value the server may still return, current and retired (for lookups keyed by stored value). */
export const ALL_CATEGORY_SLUGS: CategorySlug[] = [...CATEGORIES.map(c => c.id), ...(Object.keys(LEGACY_CATEGORY) as CategorySlug[])];

/** The category a stored value is shown as (a retired one becomes its new home). */
export const canonicalCategory = (slug?: string | null): { id: CategorySlug; sub?: string } => {
  const legacy = LEGACY_CATEGORY[slug as CategorySlug];
  if (legacy) return legacy;
  return { id: (CATEGORIES.some(c => c.id === slug) ? slug : 'other') as CategorySlug };
};

export const categoryOf = (slug?: string | null): CategoryDef => {
  const { id } = canonicalCategory(slug);
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
};

/** The translation key for a category's name; income "gifts" is just "Gifts" (the spending one is "Giving"). */
export const categoryLabelKey = (slug?: string | null, kind?: 'EXPENSE' | 'INCOME' | string): string => {
  const { id } = canonicalCategory(slug);
  return id === 'gifts' && kind === 'INCOME' ? 'cat.gifts_in' : `cat.${id}`;
};
