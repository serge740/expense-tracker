import api from '@/api';
import { ComponentProps } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ALL_CATEGORY_SLUGS, CategorySlug, canonicalCategory, categoryOf } from '@/constants/categories';

export type TransactionType = 'INCOME' | 'EXPENSE';
export type { CategorySlug } from '@/constants/categories';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// Keyed by every stored value, so a retired one still gets the icon and name of the category it became.
export const CATEGORY_ICON = Object.fromEntries(ALL_CATEGORY_SLUGS.map(s => [s, categoryOf(s).icon])) as Record<CategorySlug, IconName>;

const ENGLISH_LABEL: Partial<Record<CategorySlug, string>> = {
  food: 'Food', transport: 'Transport', bills: 'Bills', shopping: 'Shopping', health: 'Personal', entertainment: 'Entertainment',
  gifts: 'Giving', business: 'Business', insurance: 'Finance', salary: 'Salary', freelance: 'Freelance', investment: 'Investments',
  refund: 'Refunds', savings: 'Savings', loan: 'Loans', other: 'Other',
};

/** English fallback labels for older screens; new screens use t('cat.<id>'). */
export const CATEGORY_LABEL = Object.fromEntries(
  ALL_CATEGORY_SLUGS.map(s => [s, ENGLISH_LABEL[canonicalCategory(s).id] ?? 'Other']),
) as Record<CategorySlug, string>;

export interface Transaction {
  id: string;
  type: TransactionType;
  category: CategorySlug;
  title: string;
  subCategory: string | null;
  description: string | null;
  amount: number;
  date: string;
  walletId: string | null;
  receiptUrl: string | null;
  receiptReportUrl: string | null;
  /** Set when this money belongs to a debt or credit (see Debts & loans). */
  debtId: string | null;
  debtRole: DebtRole | null;
}

/** BORROW_IN is borrowed cash (never income); the others are loan flows. */
export type DebtRole = 'BORROW_IN' | 'LEND_OUT' | 'REPAY_OUT' | 'REPAY_IN';

export interface TransactionGroup {
  date: string;
  items: Transaction[];
}

export interface PaginatedTransactions {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateTransactionDto {
  type: TransactionType;
  category: CategorySlug;
  title: string;
  subCategory?: string;
  description?: string;
  amount: number;
  date?: string;
  walletId?: string;
  receiptUrl?: string;
  receiptReportUrl?: string;
  fundedByDebtId?: string;
}

export const getTransactions = (params?: Record<string, any>): Promise<PaginatedTransactions> =>
  api.get('/transactions', { params }).then(r => r.data);

/** `view` is a Home chip (income | expense | debt | credit | scheduled); `includeLoans: false` leaves loan rows out of all / income / expense. */
export const getRecentTransactions = (limit = 3, view?: string, includeLoans?: boolean): Promise<Transaction[]> =>
  api.get('/transactions/recent', {
    params: { limit, ...(view && view !== 'all' ? { view } : {}), ...(includeLoans === false ? { includeLoans: 'false' } : {}) },
  }).then(r => r.data);

export const getTransactionHistory = (params?: Record<string, any>): Promise<TransactionGroup[]> =>
  api.get('/transactions/history', { params }).then(r => r.data);

export const createTransaction = (data: CreateTransactionDto): Promise<Transaction> =>
  api.post('/transactions', data).then(r => r.data);

export const updateTransaction = (id: string, data: Partial<CreateTransactionDto>): Promise<Transaction> =>
  api.patch(`/transactions/${id}`, data).then(r => r.data);

export const deleteTransaction = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/transactions/${id}`).then(r => r.data);

export function formatSubtitle(tx: Transaction): string {
  const cat  = CATEGORY_LABEL[tx.category] ?? tx.category;
  const d    = new Date(tx.date);
  const now  = new Date();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);

  let dateStr: string;
  if (d.toDateString() === now.toDateString()) dateStr = 'Today';
  else if (d.toDateString() === yest.toDateString()) dateStr = 'Yesterday';
  else dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${cat} · ${dateStr}`;
}
