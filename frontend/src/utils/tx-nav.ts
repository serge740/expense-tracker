// Ported from expo_app/utils/tx-nav.ts
import type { Transaction } from '@/services/transaction.service';

/**
 * What the Transaction detail screen is given when a row is tapped. The author (inside a family) travels along so the
 * screen can say who added it and whether the person may change it without asking the server again.
 */
export function detailParams(t: Transaction): Record<string, string> {
  return {
    id: t.id, type: t.type, category: t.category,
    title: t.title, subCategory: t.subCategory ?? '',
    description: t.description ?? '',
    amount: String(t.amount), date: String(t.date),
    walletId: t.walletId ?? '', receiptUrl: t.receiptUrl ?? '',
    receiptReportUrl: t.receiptReportUrl ?? '',
    authorId: t.author?.clientId ?? '',
    authorName: t.author?.name ?? '',
    authorIsYou: t.author?.isYou ? '1' : '',
  };
}
