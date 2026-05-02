import { CategorySlug, TransactionType } from '../../../../generated/prisma';

export class CreateTransactionDto {
  type: TransactionType;
  category: CategorySlug;
  title: string;
  description?: string;
  amount: number;
  date?: string;
  walletId?: string;
  receiptUrl?: string;
}
