/**
 * The categories people see (10 for spending, 8 for income) and what became of the older ones.
 *
 * The database keeps every old category value so nothing already stored breaks, but only the ones below are offered.
 * Some stored values are shown under a new name: "health" is Personal, "gifts" is Giving, "insurance" is Finance.
 * Anything an older app version still sends is turned into the new category here, with a subcategory where the old
 * name said what it was (groceries -> Food, "Groceries").
 */

/** Old value -> where it lives now. `subCategory` is only set when the old name says exactly what was bought. */
export const LEGACY_CATEGORY: Record<string, { category: string; subCategory?: string }> = {
  groceries: { category: 'food', subCategory: 'Groceries' },
  fuel: { category: 'transport', subCategory: 'Fuel' },
  travel: { category: 'transport' },
  rent: { category: 'bills', subCategory: 'Rent' },
  utilities: { category: 'bills' },
  subscriptions: { category: 'bills' },
  personal_care: { category: 'health' },
  education: { category: 'health' },
  family: { category: 'gifts', subCategory: 'Family support' },
};

export interface CanonicalCategory { category: string; subCategory?: string }

export function canonicalCategory(slug: string): CanonicalCategory {
  return LEGACY_CATEGORY[slug] ?? { category: slug };
}

/** Names used in reports and AI summaries. Old values are listed too, for rows not yet moved. */
export const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food', transport: 'Transport', bills: 'Bills', shopping: 'Shopping', health: 'Personal',
  entertainment: 'Entertainment', gifts: 'Giving', business: 'Business', insurance: 'Finance', other: 'Other',
  salary: 'Salary', freelance: 'Freelance', investment: 'Investments', refund: 'Refunds', savings: 'Savings', loan: 'Loans',
  groceries: 'Food', fuel: 'Transport', travel: 'Transport', rent: 'Bills', utilities: 'Bills', subscriptions: 'Bills',
  personal_care: 'Personal', education: 'Personal', family: 'Giving',
};

export const labelOf = (slug: string): string => CATEGORY_LABELS[slug] ?? slug;

export const MAX_SUBCATEGORY_LENGTH = 40;

/** A subcategory as it is stored: trimmed, single spaces, not too long. Empty means "none". */
export function normalizeSubCategory(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_SUBCATEGORY_LENGTH).trim();
  return clean || null;
}
