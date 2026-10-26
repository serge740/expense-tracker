// Ported from expo_app/constants/categories.ts
import type { ComponentProps } from 'react';

type IconName = string;

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

/** Single source of truth for categories (labels come from i18n: `cat.<id>`). */
export const CATEGORIES: CategoryDef[] = [
  { id: 'food',          icon: 'restaurant',          color: '#F97316', for: ['EXPENSE'] },
  { id: 'groceries',     icon: 'local-grocery-store', color: '#22C55E', for: ['EXPENSE'] },
  { id: 'transport',     icon: 'directions-bus',      color: '#3B82F6', for: ['EXPENSE'] },
  { id: 'fuel',          icon: 'local-gas-station',   color: '#EAB308', for: ['EXPENSE'] },
  { id: 'shopping',      icon: 'shopping-bag',        color: '#EC4899', for: ['EXPENSE'] },
  { id: 'bills',         icon: 'receipt-long',        color: '#0EA5E9', for: ['EXPENSE'] },
  { id: 'rent',          icon: 'home',                color: '#14B8A6', for: ['EXPENSE'] },
  { id: 'utilities',     icon: 'bolt',                color: '#F59E0B', for: ['EXPENSE'] },
  { id: 'subscriptions', icon: 'subscriptions',       color: '#0891B2', for: ['EXPENSE'] },
  { id: 'health',        icon: 'local-hospital',      color: '#EF4444', for: ['EXPENSE'] },
  { id: 'personal_care', icon: 'spa',                 color: '#F472B6', for: ['EXPENSE'] },
  { id: 'education',     icon: 'school',              color: '#2563EB', for: ['EXPENSE'] },
  { id: 'family',        icon: 'family-restroom',     color: '#10B981', for: ['EXPENSE'] },
  { id: 'gifts',         icon: 'card-giftcard',       color: '#E11D48', for: ['EXPENSE', 'INCOME'] },
  { id: 'entertainment', icon: 'movie',               color: '#F43F5E', for: ['EXPENSE'] },
  { id: 'travel',        icon: 'flight',              color: '#06B6D4', for: ['EXPENSE'] },
  { id: 'insurance',     icon: 'health-and-safety',   color: '#64748B', for: ['EXPENSE'] },
  { id: 'business',      icon: 'business-center',     color: '#0F766E', for: ['EXPENSE', 'INCOME'] },
  { id: 'salary',        icon: 'work',                color: '#16A34A', for: ['INCOME'] },
  { id: 'freelance',     icon: 'laptop-mac',          color: '#0D9488', for: ['INCOME'] },
  { id: 'investment',    icon: 'trending-up',         color: '#059669', for: ['INCOME'] },
  { id: 'refund',        icon: 'replay',              color: '#0284C7', for: ['INCOME'] },
  { id: 'savings',       icon: 'savings',             color: '#15803D', for: ['INCOME'] },
  { id: 'loan',          icon: 'handshake',           color: '#B45309', for: ['EXPENSE', 'INCOME'], system: true },
  { id: 'other',         icon: 'more-horiz',          color: '#94A3B8', for: ['EXPENSE', 'INCOME'] },
];

export const categoryOf = (slug?: string | null): CategoryDef =>
  CATEGORIES.find(c => c.id === slug) ?? CATEGORIES[CATEGORIES.length - 1];
