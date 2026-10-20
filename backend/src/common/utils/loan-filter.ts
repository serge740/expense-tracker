import { Prisma } from '../../../generated/prisma';

/**
 * Where-fragment for income / expense TOTALS (reports, summaries).
 * - Borrowed cash (BORROW_IN) is never income.
 * - includeLoans=false removes every debt-tagged row: borrow, lend and repayments.
 * Wallet balances and transaction lists are NOT filtered: that money really moved.
 */
export function loanFilter(type: 'INCOME' | 'EXPENSE', includeLoans = true): Prisma.TransactionWhereInput {
  if (!includeLoans) return { debtRole: null };
  if (type === 'INCOME') return { OR: [{ debtRole: null }, { debtRole: { not: 'BORROW_IN' } }] };
  return {};
}

/** Budgets track everyday spending, so debt flows never count against them. */
export const NO_DEBT_FLOWS: Prisma.TransactionWhereInput = { debtRole: null };

/** Query-string flag: anything except "false" / "0" means include loans. */
export const parseIncludeLoans = (value?: string) => value !== 'false' && value !== '0';
