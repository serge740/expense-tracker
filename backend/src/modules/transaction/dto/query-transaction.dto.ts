import { CategorySlug } from '../../../../generated/prisma';

export class QueryTransactionDto {
  type?: 'income' | 'expense' | 'transfer' | 'all';
  category?: CategorySlug;
  walletId?: string;
  month?: number;
  year?: number;
  startDate?: string; // ISO string — takes priority over month/year when present
  endDate?: string;   // ISO string
  page?: number;
  limit?: number;
  search?: string;    // searches title + description (case-insensitive)
  /** Home / History chip: all | income | expense | debt | credit | scheduled. */
  view?: string;
  /** "false" or "0" leaves every loan row out of all / income / expense. */
  includeLoans?: string;
}
