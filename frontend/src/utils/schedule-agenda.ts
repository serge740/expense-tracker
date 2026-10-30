/**
 * "What is coming": scheduled transactions and the pay dates of loans and credits as one list, how far away each
 * one is in plain words, and the status cards and filters of the Scheduled page. All pure, so they are tested.
 */
export type AgendaSource = 'SCHEDULED' | 'DEBT' | 'CREDIT';

export interface AgendaItem {
  key: string;
  source: AgendaSource;
  /** The schedule, loan or credit this belongs to. */
  refId: string;
  /** Set for a scheduled date that is waiting for an answer. */
  occurrenceId: string | null;
  title: string;
  person: string | null;
  dueAt: string;
  overdue: boolean;
  waiting: boolean;
  /** A scheduled date that tried to post and could not; confirming it again retries. */
  failed: boolean;
  failReason: string | null;
  amount: number | null;
  currency: string;
  direction: 'IN' | 'OUT';
}

export interface LastScheduled { title: string; at: string; status: 'POSTED' | 'SKIPPED' | 'FAILED' | 'CREATED' }

export interface HomeSchedule {
  upcoming: AgendaItem[];
  /** How many more there are after the ones shown. */
  more: number;
  /** The latest one, only given when nothing is ahead. */
  last: LastScheduled | null;
  /** How many schedules exist (active or paused): 0 means the person has never made one. */
  scheduleCount: number;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole calendar days from today to that moment: 0 today, 1 tomorrow, -1 yesterday (the person's own calendar). */
export function calendarDays(at: Date | string, now = new Date()): number {
  const d = typeof at === 'string' ? new Date(at) : at;
  return Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
}

export type WhenKey = 'sched.today' | 'sched.tomorrow' | 'sched.inDays' | 'sched.inMonths' | 'sched.yesterday' | 'sched.overdueDays';

/** "Today", "Tomorrow", "in 5 days", "in 2 months", "Yesterday", "12 days overdue": the key to translate and its numbers. */
export function whenPhrase(days: number): { key: WhenKey; vars?: { n: number } } {
  if (days === 0) return { key: 'sched.today' };
  if (days === 1) return { key: 'sched.tomorrow' };
  if (days === -1) return { key: 'sched.yesterday' };
  if (days < -1) return { key: 'sched.overdueDays', vars: { n: -days } };
  if (days <= 60) return { key: 'sched.inDays', vars: { n: days } };
  return { key: 'sched.inMonths', vars: { n: Math.round(days / 30) } };
}

export type AgoKey = 'sched.today' | 'sched.yesterday' | 'sched.daysAgo' | 'sched.monthsAgo';

/** For something already past: "Today", "Yesterday", "12 days ago", "3 months ago". */
export function agoPhrase(days: number): { key: AgoKey; vars?: { n: number } } {
  const ago = Math.max(0, -days);
  if (ago === 0) return { key: 'sched.today' };
  if (ago === 1) return { key: 'sched.yesterday' };
  if (ago <= 60) return { key: 'sched.daysAgo', vars: { n: ago } };
  return { key: 'sched.monthsAgo', vars: { n: Math.round(ago / 30) } };
}

// ── The Scheduled page: status cards and filters ─────────────────────────────

export type StatusFilter = 'overdue' | 'waiting' | 'week' | 'later' | 'paused' | 'ended';
export type KindFilter = 'all' | 'in' | 'out' | 'scheduled' | 'loans' | 'credits';

export const STATUS_ORDER: StatusFilter[] = ['overdue', 'waiting', 'week', 'later', 'paused', 'ended'];
export const KIND_ORDER: KindFilter[] = ['all', 'in', 'out', 'scheduled', 'loans', 'credits'];

/** Where an item sits for the status cards: overdue, waiting for an answer, due within a week, or later. */
export function statusOf(item: AgendaItem, now = new Date()): 'overdue' | 'waiting' | 'week' | 'later' {
  if (item.overdue) return 'overdue';
  if (item.waiting) return 'waiting';
  return calendarDays(item.dueAt, now) <= 7 ? 'week' : 'later';
}

export function matchesKind(item: AgendaItem, kind: KindFilter): boolean {
  switch (kind) {
    case 'all': return true;
    case 'in': return item.direction === 'IN';
    case 'out': return item.direction === 'OUT';
    case 'scheduled': return item.source === 'SCHEDULED';
    case 'loans': return item.source === 'DEBT';
    case 'credits': return item.source === 'CREDIT';
  }
}

/** The numbers on the status cards. An overdue date that is also waiting counts as waiting too (it is waiting for you). */
export function statusCounts(items: AgendaItem[], paused: number, ended: number, kind: KindFilter = 'all', now = new Date()): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { overdue: 0, waiting: 0, week: 0, later: 0, paused, ended };
  for (const i of items) {
    if (!matchesKind(i, kind)) continue;
    if (i.overdue) out.overdue++;
    if (i.waiting) out.waiting++;
    if (!i.overdue && !i.waiting) out[calendarDays(i.dueAt, now) <= 7 ? 'week' : 'later']++;
  }
  return out;
}

/** The dates to list (paused and ended are about the schedules themselves, not about dates). */
export function filterItems(items: AgendaItem[], kind: KindFilter, status: StatusFilter | null, now = new Date()): AgendaItem[] {
  if (status === 'paused' || status === 'ended') return [];
  return items.filter(i => {
    if (!matchesKind(i, kind)) return false;
    if (!status) return true;
    if (status === 'overdue') return i.overdue;
    if (status === 'waiting') return i.waiting;
    return !i.overdue && !i.waiting && statusOf(i, now) === status;
  });
}

/** Whether the list of schedules (the templates) is relevant to this kind. Loans and credits are not schedules. */
export const showsSchedules = (kind: KindFilter) => kind === 'all' || kind === 'in' || kind === 'out' || kind === 'scheduled';
