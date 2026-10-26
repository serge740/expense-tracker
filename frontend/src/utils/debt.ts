// Ported from expo_app/utils/debt.ts
import type { StringKey } from '@/i18n/strings';
import type { DebtInstallment, DebtStatus, InstallmentView } from '@/services/debt.service';
import type { DebtRole } from '@/services/transaction.service';

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'muted';

/** Label and colour family for each pay-date state. */
export const VIEW_STYLE: Record<InstallmentView, { label: StringKey; tone: Tone }> = {
  PAID:     { label: 'debt2.viewPaid',     tone: 'green' },
  PARTIAL:  { label: 'debt2.viewPartial',  tone: 'amber' },
  OVERDUE:  { label: 'debt2.viewOverdue',  tone: 'red' },
  UPCOMING: { label: 'debt2.viewUpcoming', tone: 'blue' },
  MOVED:    { label: 'debt2.viewMoved',    tone: 'amber' },
  SKIPPED:  { label: 'debt2.viewSkipped',  tone: 'muted' },
};

/** Moved and skipped dates are history: they are only listed when asked for. */
export const isHistory = (i: Pick<DebtInstallment, 'view'>) => i.view === 'MOVED' || i.view === 'SKIPPED';

/** Pay dates oldest first; history hidden unless `showHistory`. */
export function visibleInstallments(list: DebtInstallment[], showHistory: boolean): DebtInstallment[] {
  return list
    .filter(i => showHistory || !isHistory(i))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

/** A pay date can still be moved or skipped while it is not paid and not history. */
export const canChange = (i: Pick<DebtInstallment, 'view'>) => i.view !== 'PAID' && !isHistory(i);

export const hasHistory = (list: DebtInstallment[]) => list.some(isHistory);

/** Tag shown on ledger rows. */
export const ROLE_TAG: Record<DebtRole, { label: StringKey; tone: Tone }> = {
  BORROW_IN: { label: 'debt2.tagBorrowed', tone: 'blue' },
  REPAY_OUT: { label: 'debt2.tagRepaid',   tone: 'red' },
  LEND_OUT:  { label: 'debt2.tagLent',     tone: 'amber' },
  REPAY_IN:  { label: 'debt2.tagReceived', tone: 'green' },
};

/** Label for a closed record's outcome, or null while it is open. */
export function closedTag(status: DebtStatus): { label: StringKey; tone: Tone } | null {
  if (status === 'OPEN') return null;
  if (status === 'FORGIVEN') return { label: 'debt2.forgivenTag', tone: 'amber' };
  if (status === 'WRITTEN_OFF') return { label: 'debt2.writtenOffTag', tone: 'amber' };
  return { label: 'debts.settled', tone: 'green' };
}

import type { Debt } from '@/services/debt.service';

/**
 * Order for the Debt / Credit wallet screens: open ones first (overdue, then the soonest pay date, then those
 * with no date), then the closed ones, newest first.
 */
export function sortForLedger(debts: Debt[]): Debt[] {
  const when = (d: Debt) => {
    const iso = d.nextDueAt ?? d.dueDate;
    return iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY;
  };
  const open = debts.filter(d => d.status === 'OPEN').sort((a, b) => Number(b.overdue) - Number(a.overdue) || when(a) - when(b) || a.person.localeCompare(b.person));
  const closed = debts.filter(d => d.status !== 'OPEN').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return [...open, ...closed];
}
