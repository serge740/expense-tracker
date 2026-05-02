import api from '@/api';
import { ComponentProps } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type TransactionType = 'INCOME' | 'EXPENSE';
export type CategorySlug =
  | 'food' | 'transport' | 'shopping' | 'health'
  | 'entertainment' | 'travel' | 'groceries' | 'salary' | 'other';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export const CATEGORY_ICON: Record<CategorySlug, IconName> = {
  food:          'restaurant',
  transport:     'directions-car',
  shopping:      'shopping-bag',
  health:        'local-hospital',
  entertainment: 'movie',
  travel:        'flight',
  groceries:     'local-grocery-store',
  salary:        'trending-up',
  other:         'more-horiz',
};

export const CATEGORY_LABEL: Record<CategorySlug, string> = {
  food: 'Food', transport: 'Transport', shopping: 'Shopping',
  health: 'Health', entertainment: 'Entertainment', travel: 'Travel',
  groceries: 'Groceries', salary: 'Salary', other: 'Other',
};

export interface Transaction {
  id: string;
  type: TransactionType;
  category: CategorySlug;
  title: string;
  description: string | null;
  amount: number;
  date: string;
  walletId: string | null;
  receiptUrl: string | null;
}

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
  description?: string;
  amount: number;
  date?: string;
  walletId?: string;
  receiptUrl?: string;
}

export const getTransactions = (params?: Record<string, any>): Promise<PaginatedTransactions> =>
  api.get('/transactions', { params }).then(r => r.data);

export const getRecentTransactions = (limit = 3): Promise<Transaction[]> =>
  api.get('/transactions/recent', { params: { limit } }).then(r => r.data);

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
