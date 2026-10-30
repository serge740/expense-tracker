// Ported from expo_app/services/home.service.ts
import api from '@/api';
import type { DebtKind } from '@/services/debt.service';
import { periodParams, thisMonth, type Period } from '@/utils/period';
import type { AgendaItem, HomeSchedule, LastScheduled } from '@/utils/schedule-agenda';

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
  /** What is coming (scheduled items and loan / credit pay dates), or the latest one when nothing is ahead. */
  schedule: HomeSchedule;
  attention: AttentionItem[];
  attentionTotal: number;
  netWorth: NetWorth[];
}

export const getHomeSummary = (params: { period?: Period; includeLoans?: boolean } = {}): Promise<HomeSummary> =>
  api.get('/home/summary', { params: { ...periodParams(params.period ?? thisMonth()), includeLoans: params.includeLoans === false ? 'false' : undefined } }).then(r => r.data);

/** Scheduled items and loan / credit pay dates in one list (personal only: a family has none). */
export const getAgenda = (): Promise<{ items: AgendaItem[]; last: LastScheduled | null; scheduleCount: number }> =>
  api.get('/home/agenda').then(r => r.data);
