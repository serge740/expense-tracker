// Ported from expo_app/services/scheduled.service.ts
import api from '@/api';
import type { RepeatRule } from '@/utils/recurrence';
import type { CategorySlug } from '@/services/transaction.service';

export type ScheduleMode = 'REMIND_CONFIRM' | 'AUTO_POST';
export type ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface WaitingDate { id: string; dueAt: string; overdue: boolean }

export interface Scheduled {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  category: CategorySlug;
  title: string;
  subCategory: string | null;
  description: string | null;
  amount: number;
  walletId: string | null;
  /** The wallet's currency, or '' when the schedule has no wallet. */
  currency: string;
  startAt: string;
  timezone: string;
  repeat: RepeatRule | null;
  mode: ScheduleMode;
  status: ScheduleStatus;
  nextDueAt: string | null;
  waiting: WaitingDate[];
}

export interface HistoryItem {
  id: string;
  dueAt: string;
  status: 'POSTED' | 'SKIPPED' | 'FAILED' | 'PENDING';
  failReason: string | null;
  transactionId: string | null;
}

export interface ScheduledDetail extends Scheduled {
  /** The next dates after now, worked out by the server (up to 5). */
  upcoming: string[];
  history: HistoryItem[];
}

/** A date waiting for an answer, across every schedule (the "waiting for you" list). */
export interface WaitingItem {
  id: string;
  scheduleId: string;
  dueAt: string;
  overdue: boolean;
  type: 'INCOME' | 'EXPENSE';
  title: string;
  amount: number;
  category: CategorySlug;
  walletId: string | null;
  currency: string;
  mode: ScheduleMode;
}

export interface CreateScheduledInput {
  type: 'INCOME' | 'EXPENSE';
  category: CategorySlug;
  subCategory?: string;
  title: string;
  amount: number;
  description?: string;
  walletId?: string;
  startAt: string;
  timezone: string;
  repeat: RepeatRule | null;
  mode: ScheduleMode;
}

export interface UpdateScheduledInput {
  title?: string;
  amount?: number;
  walletId?: string | null;
  repeat?: RepeatRule | null;
  mode?: ScheduleMode;
}

export const createScheduled = (data: CreateScheduledInput): Promise<ScheduledDetail> => api.post('/scheduled', data).then(r => r.data);
export const getScheduledList = (status?: ScheduleStatus): Promise<Scheduled[]> =>
  api.get('/scheduled', { params: status ? { status } : undefined }).then(r => r.data);
export const getScheduled = (id: string): Promise<ScheduledDetail> => api.get(`/scheduled/${id}`).then(r => r.data);
export const updateScheduled = (id: string, data: UpdateScheduledInput): Promise<ScheduledDetail> => api.patch(`/scheduled/${id}`, data).then(r => r.data);
export const pauseScheduled = (id: string): Promise<ScheduledDetail> => api.post(`/scheduled/${id}/pause`).then(r => r.data);
export const resumeScheduled = (id: string): Promise<ScheduledDetail> => api.post(`/scheduled/${id}/resume`).then(r => r.data);
export const endScheduled = (id: string): Promise<ScheduledDetail> => api.delete(`/scheduled/${id}`).then(r => r.data);
export const getWaitingDates = (): Promise<WaitingItem[]> => api.get('/scheduled/waiting').then(r => r.data);

export const confirmOccurrence = (id: string, data: { amount?: number; walletId?: string | null } = {}): Promise<{ occurrenceId: string; status: string; transactionId: string }> =>
  api.post(`/scheduled/occurrences/${id}/confirm`, data).then(r => r.data);
export const skipOccurrence = (id: string): Promise<{ occurrenceId: string; status: string }> =>
  api.post(`/scheduled/occurrences/${id}/skip`).then(r => r.data);
