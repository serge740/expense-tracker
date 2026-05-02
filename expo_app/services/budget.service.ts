import api from '@/api';

export interface BudgetStatus {
  limit: number;
  spent: number;
  remaining: number;
  percentage: number;
  month: number;
  year: number;
}

export const getCurrentBudget = (): Promise<BudgetStatus> =>
  api.get('/budget/current').then(r => r.data);

export const upsertBudget = (data: { limit: number; month?: number; year?: number }): Promise<any> =>
  api.put('/budget', data).then(r => r.data);
