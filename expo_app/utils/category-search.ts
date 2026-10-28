import { CATEGORIES, CategoryDef, CategorySlug } from '@/constants/categories';
import { CatalogItem, groupsOf } from '@/constants/category-catalog';

export type Kind = 'EXPENSE' | 'INCOME';

/** One row of a person's own list (what they typed or picked before), as the server returns it. */
export interface MySubCategory {
  id: string;
  kind: Kind;
  category: CategorySlug;
  name: string;
  usageCount: number;
  lastUsedAt: string;
}

export const MAX_SUBCATEGORY_LENGTH = 40;

/**
 * What the server answered, as a list of the person's own items. Anything else (an error page, an older server without
 * this feature, a half-made row) gives an empty list instead of breaking the sheet: the built-in suggestions still work.
 */
export function asMySubCategories(data: unknown): MySubCategory[] {
  if (!Array.isArray(data)) return [];
  return data.filter((r): r is MySubCategory => !!r && typeof r === 'object'
    && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.category === 'string'
    && (r.kind === 'EXPENSE' || r.kind === 'INCOME')
    && typeof r.usageCount === 'number' && typeof r.lastUsedAt === 'string');
}

/** Lower case, no accents, trimmed: "Café" is found by "cafe". */
export const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** A subcategory as it is saved (the server does the same): single spaces, not too long. */
export const cleanSubCategory = (raw: string): string => raw.trim().replace(/\s+/g, ' ').slice(0, MAX_SUBCATEGORY_LENGTH).trim();

const INCOME_ORDER: CategorySlug[] = ['salary', 'business', 'freelance', 'investment', 'gifts', 'refund', 'savings', 'other'];

/** The categories offered for spending or income, in the order shown. */
export function categoriesFor(kind: Kind): CategoryDef[] {
  const list = CATEGORIES.filter(c => !c.system && c.for.includes(kind));
  return kind === 'INCOME' ? [...list].sort((a, b) => INCOME_ORDER.indexOf(a.id) - INCOME_ORDER.indexOf(b.id)) : list;
}

/** Every item of a category, with the group it sits in. */
export function itemsOf(kind: Kind, category: CategorySlug): (CatalogItem & { group: string })[] {
  return groupsOf(kind, category).flatMap(g => g.items.map(i => ({ ...i, group: g.id })));
}

/** The person's own rows for one category, the ones they use most first. */
export function mineFor(mine: MySubCategory[], kind: Kind, category: CategorySlug): MySubCategory[] {
  return mine
    .filter(m => m.kind === kind && m.category === category)
    .sort((a, b) => b.usageCount - a.usageCount || b.lastUsedAt.localeCompare(a.lastUsedAt) || a.name.localeCompare(b.name));
}

/** True when this name is not one of the built-in suggestions (so it is the person's own). */
export const isOwnName = (kind: Kind, category: CategorySlug, name: string): boolean =>
  !itemsOf(kind, category).some(i => fold(i.name) === fold(name));

/** Matches an item by its name or by any of its search words; says which search word matched when the name did not. */
export function matchItem(item: CatalogItem, query: string): { hit: boolean; alias: string | null } {
  const q = fold(query);
  if (!q) return { hit: false, alias: null };
  if (fold(item.name).includes(q)) return { hit: true, alias: null };
  const alias = item.aliases.find(a => fold(a).includes(q)) ?? null;
  return { hit: !!alias, alias };
}

export interface SubSearch {
  /** The person's own rows that match what they typed. */
  yours: MySubCategory[];
  /** Built-in suggestions that match, from every group of the category. */
  found: { item: CatalogItem; group: string; alias: string | null }[];
  /** What they typed is already in the list, so there is nothing new to add. */
  exact: boolean;
}

/** Searching inside one category (step 2): the typed text finds items across all its groups, and their own rows. */
export function searchWithin(kind: Kind, category: CategorySlug, draft: string, mine: MySubCategory[]): SubSearch {
  const q = fold(draft);
  const own = mineFor(mine, kind, category);
  const yours = own.filter(m => fold(m.name).includes(q));
  const found = itemsOf(kind, category)
    .map(i => ({ item: i, group: i.group, ...matchItem(i, draft) }))
    .filter(r => r.hit && !yours.some(y => fold(y.name) === fold(r.item.name)))
    .map(({ item, group, alias }) => ({ item, group, alias }));
  const exact = !!q && (own.some(m => fold(m.name) === q) || itemsOf(kind, category).some(i => fold(i.name) === q));
  return { yours, found, exact };
}

export interface SearchHit {
  category: CategorySlug;
  /** null when the hit is the category itself. */
  sub: string | null;
  group: string | null;
  alias: string | null;
}

/** The search box on step 1: finds categories by name and items by name or brand, across every category at once. */
export function searchEverything(kind: Kind, query: string, mine: MySubCategory[], labelOf: (slug: CategorySlug) => string, limit = 16): SearchHit[] {
  const q = fold(query);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const c of categoriesFor(kind)) {
    if (fold(labelOf(c.id)).includes(q)) hits.push({ category: c.id, sub: null, group: null, alias: null });
    for (const i of itemsOf(kind, c.id)) {
      const m = matchItem(i, query);
      if (m.hit) hits.push({ category: c.id, sub: i.name, group: i.group, alias: m.alias });
    }
    for (const row of mineFor(mine, kind, c.id)) {
      if (isOwnName(kind, c.id, row.name) && fold(row.name).includes(q)) hits.push({ category: c.id, sub: row.name, group: null, alias: null });
    }
  }
  return hits.slice(0, limit);
}

/** The categories this person uses most (by how often they picked an item in them), for the quick row on step 1. */
export function frequentCategories(kind: Kind, mine: MySubCategory[], max = 3): CategoryDef[] {
  const total = new Map<CategorySlug, number>();
  for (const m of mine) if (m.kind === kind) total.set(m.category, (total.get(m.category) ?? 0) + m.usageCount);
  return categoriesFor(kind)
    .filter(c => total.has(c.id) && c.id !== 'other')
    .sort((a, b) => (total.get(b.id) ?? 0) - (total.get(a.id) ?? 0))
    .slice(0, max);
}
