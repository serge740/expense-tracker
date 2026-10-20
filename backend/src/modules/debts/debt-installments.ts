import { round2 } from './debt-accounting';

export type InstallmentState = 'PENDING' | 'MOVED' | 'SKIPPED';
export type InstallmentView = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UPCOMING' | 'MOVED' | 'SKIPPED';

export interface InstallmentInput {
  id: string;
  dueAt: Date;
  plannedAmount: number | null;
  status: InstallmentState;
}

export interface DerivedInstallment {
  id: string;
  view: InstallmentView;
  /** How much of this pay date the money paid so far covers. */
  covered: number;
  /** What this pay date asks for (a date without an amount means "the rest"). */
  planned: number;
}

/**
 * Work out each pay date's state from the money actually paid.
 * Payments fill active pay dates oldest first, so nothing extra is stored and undoing a
 * payment just recalculates. A date with no planned amount asks for whatever is not yet
 * planned elsewhere. Moved and skipped dates are history and take no money.
 */
export function deriveInstallments(args: {
  amount: number;
  writtenOff: number;
  paid: number;
  installments: InstallmentInput[];
  now?: Date;
}): DerivedInstallment[] {
  const now = args.now ?? new Date();
  const total = round2(Math.max(0, args.amount - args.writtenOff));
  const active = args.installments
    .filter(i => i.status === 'PENDING')
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id));

  // Dates with an amount keep it. The first date without one takes whatever those leave over;
  // any further dates without an amount are reminders only (they ask for nothing extra).
  const explicit = round2(active.reduce((s, i) => s + (i.plannedAmount ?? 0), 0));
  let leftover = round2(Math.max(0, total - explicit));

  let pool = args.paid;
  const byId = new Map<string, DerivedInstallment>();
  for (const i of active) {
    let planned: number;
    if (i.plannedAmount != null) planned = i.plannedAmount;
    else { planned = leftover; leftover = 0; }
    const covered = round2(Math.min(pool, planned));
    pool = round2(pool - covered);
    let view: InstallmentView;
    if (planned > 0 ? covered >= planned : args.paid >= total) view = 'PAID';
    else if (i.dueAt.getTime() < now.getTime()) view = 'OVERDUE';
    else if (covered > 0) view = 'PARTIAL';
    else view = 'UPCOMING';
    byId.set(i.id, { id: i.id, view, covered, planned });
  }

  return args.installments.map(i =>
    byId.get(i.id) ?? { id: i.id, view: i.status === 'MOVED' ? 'MOVED' : 'SKIPPED', covered: 0, planned: i.plannedAmount ?? 0 },
  );
}

/** The next unpaid pay date: it is what reminders count down to. */
export function nextUnpaid(installments: InstallmentInput[], derived: DerivedInstallment[]): InstallmentInput | null {
  const open = new Set(derived.filter(d => d.view === 'UPCOMING' || d.view === 'PARTIAL' || d.view === 'OVERDUE').map(d => d.id));
  const rows = installments.filter(i => open.has(i.id)).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return rows[0] ?? null;
}

/** The last active pay date: the debt's final deadline. */
export function finalDeadline(installments: InstallmentInput[]): Date | null {
  const active = installments.filter(i => i.status === 'PENDING');
  if (!active.length) return null;
  return new Date(Math.max(...active.map(i => i.dueAt.getTime())));
}

/** True when any active pay date is late and not covered. */
export const isOverdue = (derived: DerivedInstallment[]) => derived.some(d => d.view === 'OVERDUE');
