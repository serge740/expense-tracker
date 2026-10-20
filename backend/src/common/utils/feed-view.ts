import { Prisma } from '../../../generated/prisma';
import { loanFilter } from './loan-filter';

/** The filter chips on Home and History. */
export const FEED_VIEWS = ['all', 'income', 'expense', 'debt', 'credit', 'scheduled'] as const;
export type FeedView = (typeof FEED_VIEWS)[number];

/** Anything unknown (or missing) means "all", so an old or tampered link can never break a list. */
export const parseView = (value?: string): FeedView => ((FEED_VIEWS as readonly string[]).includes(value ?? '') ? (value as FeedView) : 'all');

/**
 * Where-fragment for one chip. Combine it with other filters using AND (it may use OR inside).
 * - income / expense follow the loans switch, and income never includes borrowed money;
 * - debt = borrowed + repayments I made, credit = lent + repayments I received (always shown);
 * - scheduled = what a schedule has posted.
 */
export function viewFilter(view: FeedView, includeLoans = true): Prisma.TransactionWhereInput {
  switch (view) {
    case 'income':    return { type: 'INCOME', ...loanFilter('INCOME', includeLoans) };
    case 'expense':   return { type: 'EXPENSE', ...loanFilter('EXPENSE', includeLoans) };
    case 'debt':      return { debtRole: { in: ['BORROW_IN', 'REPAY_OUT'] } };
    case 'credit':    return { debtRole: { in: ['LEND_OUT', 'REPAY_IN'] } };
    case 'scheduled': return { scheduledOccurrenceId: { not: null } };
    default:          return includeLoans ? {} : { debtRole: null };
  }
}
