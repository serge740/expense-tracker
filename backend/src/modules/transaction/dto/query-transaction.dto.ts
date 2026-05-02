import { CategorySlug } from '../../../../generated/prisma';

export class QueryTransactionDto {
  type?: 'income' | 'expense' | 'all';
  category?: CategorySlug;
  walletId?: string;
  month?: number;
  year?: number;
  startDate?: string; // ISO string — takes priority over month/year when present
  endDate?: string;   // ISO string
  page?: number;
  limit?: number;
}
