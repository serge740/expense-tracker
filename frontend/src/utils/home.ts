// Ported from expo_app/utils/home.ts
import type { StringKey } from '@/i18n/strings';
import type { AttentionItem } from '@/services/home.service';

/** The filter chips on Home (and the same filter on History). Same names the server understands. */
export type FeedView = 'all' | 'income' | 'expense' | 'debt' | 'credit' | 'scheduled';

export const FEED_CHIPS: { id: FeedView; label: StringKey }[] = [
  { id: 'all', label: 'home.vAll' },
  { id: 'income', label: 'home.vIncome' },
  { id: 'expense', label: 'home.vExpense' },
  { id: 'debt', label: 'home.vDebt' },
  { id: 'credit', label: 'home.vCredit' },
  { id: 'scheduled', label: 'home.vScheduled' },
];

/** A remembered or linked value is only trusted if it is one of the six chips. */
export const asFeedView = (value: unknown): FeedView =>
  (FEED_CHIPS.some(c => c.id === value) ? (value as FeedView) : 'all');

/** Per-currency figures as a stable, sorted list (currencies are never added together). */
export function currencyEntries<T>(record: Record<string, T> | undefined | null): Array<[string, T]> {
  return Object.entries(record ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

/** How many "needs attention" rows to show: three, or all of them when expanded. */
export const VISIBLE_ATTENTION = 3;
export const visibleAttention = (items: AttentionItem[], expanded: boolean) => (expanded ? items : items.slice(0, VISIBLE_ATTENTION));

/**
 * Debt and credit rows are loans. With the loans switch off they are not in the totals, but the Debt and
 * Credit chips still list them, so say why they are there.
 */
export const needsLoansHint = (view: FeedView, includeLoans: boolean) => !includeLoans && (view === 'debt' || view === 'credit');

/** True when the month had any loan movement at all (so the loans line is worth showing). */
export const hasLoanMovement = (loans: { out: number; in: number; borrowed: number }) => loans.out > 0 || loans.in > 0 || loans.borrowed > 0;
