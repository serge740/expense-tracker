import api from '@/api';
import type { DebtKind } from '@/services/debt.service';

interface PendingBase {
  id: string;
  dueAt: string;
  overdue: boolean;
  fireCount: number;
  lastFiredAt: string | null;
}

/** A debt pay date that fired and is still waiting for an answer. */
export interface PendingDebtReminder extends PendingBase {
  source: 'DEBT';
  debtId: string;
  kind: DebtKind;
  person: string;
  currency: string;
  remaining: number;
  /** This pay date's own amount (an estimated payment), when it has one. */
  payment?: number | null;
  /** The wallet the debt was recorded against, if any. */
  walletId?: string | null;
}

/** A scheduled transaction's due date that fired and is still waiting for an answer. */
export interface PendingScheduledReminder extends PendingBase {
  source: 'SCHEDULED';
  occurrenceId: string;
  scheduleId: string;
  txType: 'INCOME' | 'EXPENSE';
  title: string;
  /** '' when the schedule has no wallet. */
  currency: string;
  amount: number;
  remaining: number;
  walletId: string | null;
}

/** What the popup shows. */
export type PendingReminder = PendingDebtReminder | PendingScheduledReminder;

export type SnoozeChoice = { minutes: number } | { until: string };

// An older server sends debt reminders without `source`.
export const getPendingReminders = (): Promise<PendingReminder[]> =>
  api.get('/reminders/pending').then(r => (r.data as PendingReminder[]).map(x => ({ ...x, source: x.source ?? 'DEBT' }) as PendingReminder));

export const snoozeReminder = (id: string, choice: SnoozeChoice): Promise<{ id: string; snoozedUntil: string }> =>
  api.post(`/reminders/${id}/snooze`, choice).then(r => r.data);

export const wakeReminder = (id: string): Promise<{ id: string }> => api.post(`/reminders/${id}/wake`).then(r => r.data);
export const dismissReminder = (id: string): Promise<{ id: string }> => api.post(`/reminders/${id}/dismiss`).then(r => r.data);
export const doneReminder = (id: string): Promise<{ id: string }> => api.post(`/reminders/${id}/done`).then(r => r.data);
export const markReminderOpened = (id: string): Promise<{ id: string }> => api.post(`/reminders/${id}/opened`).then(r => r.data);
