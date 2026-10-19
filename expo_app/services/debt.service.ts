import api from '@/api';

export type DebtKind = 'BORROWED' | 'LENT';

export interface DebtPayment {
  id: string;
  amount: number;
  date: string;
  walletId: string | null;
  note: string | null;
}

export interface Debt {
  id: string;
  kind: DebtKind;
  person: string;
  phone: string | null;
  amount: number;
  paid: number;
  remaining: number;
  currency: string;
  date: string;
  dueDate: string | null;
  note: string | null;
  walletId: string | null;
  status: 'OPEN' | 'SETTLED';
  overdue: boolean;
  payments: DebtPayment[];
}

export interface DebtSummary {
  owe: Record<string, number>;
  owed: Record<string, number>;
  openCount: number;
  overdue: number;
}

export const getDebts = (): Promise<Debt[]> => api.get('/debts').then(r => r.data);
export const getDebtSummary = (): Promise<DebtSummary> => api.get('/debts/summary').then(r => r.data);

export const createDebt = (data: {
  kind: DebtKind; person: string; phone?: string; amount: number; currency?: string;
  walletId?: string; date?: string; dueDate?: string; note?: string;
}): Promise<Debt> => api.post('/debts', data).then(r => r.data);

export const updateDebt = (id: string, data: { person?: string; phone?: string; amount?: number; dueDate?: string | null; note?: string }): Promise<Debt> =>
  api.patch(`/debts/${id}`, data).then(r => r.data);

export const addDebtPayment = (id: string, data: { amount: number; walletId?: string; date?: string; note?: string }): Promise<Debt> =>
  api.post(`/debts/${id}/payments`, data).then(r => r.data);

export const removeDebtPayment = (id: string, paymentId: string): Promise<Debt> =>
  api.delete(`/debts/${id}/payments/${paymentId}`).then(r => r.data);

export const deleteDebt = (id: string): Promise<{ success: boolean }> =>
  api.delete(`/debts/${id}`).then(r => r.data);
