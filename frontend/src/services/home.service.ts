// Ported from expo_app/services/home.service.ts
import api from '@/api';
import type { DebtKind } from '@/services/debt.service';

export interface DebtBucket {
  amount: number;
  count: number;
  overdue: number;
  nextDueAt: string | null;
}

export interface DebtAttention {
  source: 'DEBT';
  debtId: string;
  kind: DebtKind;
  person: string;
  currency: string;
  remaining: number;
  dueAt: string;
  overdue: boolean;
}

export interface ScheduledAttention {
  source: 'SCHEDULED';
  occurrenceId: string;
  scheduleId: string;
  title: string;
  txType: 'INCOME' | 'EXPENSE';
  /** '' when the schedule has no wallet. */
  currency: string;
  remaining: number;
  dueAt: string;
  overdue: boolean;
}

export type AttentionItem = DebtAttention | ScheduledAttention;

export interface NetWorth {
  currency: string;
  wallets: number;
  owed: number;
  owe: number;
  total: number;
}

/** Everything Home shows, in one response. */
export interface HomeSummary {
  month: number;
  year: number;
  includeLoans: boolean;
  totals: { income: number; expense: number; net: number };
  /** Loan movements this month, always reported (whatever the switch says). */
  loans: { out: number; in: number; borrowed: number };
  owe: Record<string, DebtBucket>;
  owed: Record<string, DebtBucket>;
  scheduled: { waiting: number; next: { id: string; title: string; nextDueAt: string } | null };
  attention: AttentionItem[];
  attentionTotal: number;
  netWorth: NetWorth[];
}

export const getHomeSummary = (params: { month?: number; year?: number; includeLoans?: boolean } = {}): Promise<HomeSummary> =>
  api.get('/home/summary', { params: { ...params, includeLoans: params.includeLoans === false ? 'false' : undefined } }).then(r => r.data);
