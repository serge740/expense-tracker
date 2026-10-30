/**
 * "What is coming": scheduled transactions and the pay dates of loans and credits, as one list.
 * Everything here is pure (no database), so the rules are easy to test.
 */
export type AgendaSource = 'SCHEDULED' | 'DEBT' | 'CREDIT';

export interface AgendaItem {
  key: string;
  source: AgendaSource;
  /** The schedule id, or the loan / credit id. */
  refId: string;
  /** Set for a scheduled date that is waiting for an answer. */
  occurrenceId: string | null;
  title: string;
  /** Who it is with, for a loan or credit. */
  person: string | null;
  dueAt: Date;
  overdue: boolean;
  /** A scheduled date waiting for the person to confirm or skip it. */
  waiting: boolean;
  /** A scheduled date that tried to post and could not (confirming it again retries). */
  failed: boolean;
  failReason: string | null;
  amount: number | null;
  currency: string;
  /** IN: money coming to me. OUT: money I pay. */
  direction: 'IN' | 'OUT';
}

/** Overdue first (the oldest first), then by date. */
export function sortAgenda(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) =>
    Number(b.overdue) - Number(a.overdue) || a.dueAt.getTime() - b.dueAt.getTime() || a.key.localeCompare(b.key));
}

export interface LastScheduled { title: string; at: Date; status: 'POSTED' | 'SKIPPED' | 'FAILED' | 'CREATED' }

/** What Home shows: the next two things, how many more there are, and the latest one when nothing is ahead. */
export function homeSchedule(items: AgendaItem[], last: LastScheduled | null, scheduleCount: number) {
  const sorted = sortAgenda(items);
  return {
    upcoming: sorted.slice(0, 2),
    more: Math.max(0, sorted.length - 2),
    last: sorted.length === 0 ? last : null,
    scheduleCount,
  };
}
