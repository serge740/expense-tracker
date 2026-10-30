// Ported from expo_app/services/transaction.service.ts
import api from '@/api';
import { periodParams, type Period } from '@/utils/period';
import { ComponentProps } from 'react';
import { MaterialIcons } from '@/rn';
import { ALL_CATEGORY_SLUGS, CategorySlug, canonicalCategory, categoryOf } from '@/constants/categories';

export type TransactionType = 'INCOME' | 'EXPENSE';
export type { CategorySlug } from '@/constants/categories';

type IconName = string;

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
  /** Only in a family: who added it, and whether that is the person looking. */
  author?: TransactionAuthor;
}

export interface TransactionAuthor { clientId: string; name: string; isYou: boolean }

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
export const getRecentTransactions = (limit = 3, view?: string, includeLoans?: boolean, period?: Period): Promise<Transaction[]> =>
  api.get('/transactions/recent', {
    params: { limit, ...(view && view !== 'all' ? { view } : {}), ...(includeLoans === false ? { includeLoans: 'false' } : {}), ...(period ? periodParams(period) : {}) },
  }).then(r => r.data);

export const getTransactionHistory = (params?: Record<string, any>): Promise<TransactionGroup[]> =>
  api.get('/transactions/history', { params }).then(r => r.data);

export const createTransaction = (data: CreateTransactionDto): Promise<Transaction> =>
  api.post('/transactions', data).then(r => r.data);

export const updateTransaction = (id: string, data: Partial<CreateTransactionDto>): Promise<Transaction> =>
  api.patch(`/transactions/${id}`, data).then(r => r.data);

export const deleteTransaction = (id: string): Promise<{ success: boolean; trashId?: string }> =>
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

// ── Select mode, Undo and Recently deleted ──
export interface BulkResult { done: string[]; failed: Array<{ id: string; reason: string }>; trashIds: string[] }
export type BulkAction = { action: 'delete' } | { action: 'category'; category: string; subCategory?: string } | { action: 'wallet'; walletId: string };
export const bulkChange = (ids: string[], change: BulkAction): Promise<BulkResult> =>
  api.post('/transactions/bulk', { ids, ...change }).then(r => r.data);

export interface TrashItem { id: string; title: string; type: string; category: string; subCategory: string | null; amount: number; currency: string | null; date: string; deletedAt: string; expiresAt: string; mine: boolean }
export const getTrash = (): Promise<{ days: number; items: TrashItem[] }> => api.get('/transactions/trash').then(r => r.data);
export const restoreTrash = (id: string): Promise<{ success: boolean; transactionId: string }> => api.post(`/transactions/trash/${id}/restore`).then(r => r.data);
export const purgeTrash = (id: string): Promise<{ success: boolean }> => api.delete(`/transactions/trash/${id}`).then(r => r.data);
