import { Prisma, CategorySlug, TransactionType } from '../../../generated/prisma';
import { normalizeSubCategory } from './categories';

/**
 * Remembers that this person used (or typed) a subcategory, so it can be offered to them first next time.
 * Rows belong to one account only. Names match without regard to capitals ("pizza" and "Pizza" are one row; the
 * first spelling stays). Does nothing when there is no subcategory.
 */
export async function rememberSubCategory(
  prx: Prisma.TransactionClient,
  clientId: string,
  kind: TransactionType,
  category: CategorySlug | string,
  subCategory: unknown,
): Promise<void> {
  // Only spending and income have categories; anything else (a transfer) is never remembered.
  if (kind !== 'EXPENSE' && kind !== 'INCOME') return;
  const name = normalizeSubCategory(subCategory);
  if (!name) return;
  const slug = category as CategorySlug;
  await prx.userSubCategory.upsert({
    where: { clientId_kind_category_name: { clientId, kind, category: slug, name } },
    update: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    create: { clientId, kind, category: slug, name, usageCount: 1, lastUsedAt: new Date() },
  });
}
