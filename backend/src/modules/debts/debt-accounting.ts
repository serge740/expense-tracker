import { DebtRole, DebtStatus } from '../../../generated/prisma';

export type DebtKindName = 'BORROWED' | 'LENT';

/**
 * What people call each kind: money they borrowed is a "loan", money other people owe them is a "debt".
 * The stored values stay BORROWED and LENT; only the words in messages use these.
 */
export const nounOf = (kind: DebtKindName | string): 'loan' | 'debt' => (kind === 'LENT' ? 'debt' : 'loan');
export const capitalNoun = (kind: DebtKindName | string): 'Loan' | 'Debt' => (kind === 'LENT' ? 'Debt' : 'Loan');
export type DebtEvent = 'principal' | 'payment';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sum money values without floating-point drift. */
export const sumMoney = (values: Array<number | string | { toString(): string }>) =>
  round2(values.reduce<number>((s, v) => s + Number(v), 0));

/** Which way money moves relative to my wallet for a debt event. */
export function directionFor(kind: DebtKindName, event: DebtEvent): 'in' | 'out' {
  const borrowed = kind === 'BORROWED';
  if (event === 'principal') return borrowed ? 'in' : 'out';
  return borrowed ? 'out' : 'in';
}

/** The tag stored on a debt-linked transaction. Only BORROW_IN is never income. */
export function roleFor(kind: DebtKindName, event: DebtEvent): DebtRole {
  if (event === 'principal') return kind === 'BORROWED' ? 'BORROW_IN' : 'LEND_OUT';
  return kind === 'BORROWED' ? 'REPAY_OUT' : 'REPAY_IN';
}

/** Roles whose transactions belong to a kind's ledger. */
export function rolesOf(kind: DebtKindName): DebtRole[] {
  return kind === 'BORROWED' ? ['BORROW_IN', 'REPAY_OUT'] : ['LEND_OUT', 'REPAY_IN'];
}

export const remainingOf = (amount: number, paid: number, writtenOff = 0) =>
  round2(Math.max(0, amount - paid - writtenOff));

/**
 * Status after any change to what is paid or written off.
 * A debt that still has a balance is OPEN; one closed only by payments is SETTLED;
 * one closed with a written-off remainder keeps (or gets) its write-off outcome.
 */
export function statusFor(args: {
  kind: DebtKindName;
  amount: number;
  paid: number;
  writtenOff: number;
  current: DebtStatus;
}): DebtStatus {
  if (remainingOf(args.amount, args.paid, args.writtenOff) > 0) return 'OPEN';
  if (args.writtenOff > 0) {
    if (args.current === 'WRITTEN_OFF' || args.current === 'FORGIVEN') return args.current;
    return args.kind === 'LENT' ? 'WRITTEN_OFF' : 'FORGIVEN';
  }
  return 'SETTLED';
}

/** Statuses that count as "closed" (everything except OPEN). */
export const CLOSED_STATUSES: DebtStatus[] = ['SETTLED', 'WRITTEN_OFF', 'FORGIVEN'];

export interface LedgerDebt {
  amount: number;
  paid: number;
  writtenOff: number;
  currency: string;
  status: DebtStatus;
  dueDate: Date | null;
}

export interface LedgerCurrency {
  currency: string;
  /** Total of all principal amounts (what was borrowed / lent). */
  taken: number;
  paid: number;
  writtenOff: number;
  remaining: number;
  debtCount: number;
  openCount: number;
  /** Fully paid by payments alone. */
  settledCount: number;
  /** Closed by writing off / forgiving the remainder. */
  closedOutCount: number;
  overdueCount: number;
}

/** Per-currency ledger totals. Currencies are never converted into each other. */
export function buildLedger(debts: LedgerDebt[], now = new Date()): LedgerCurrency[] {
  const byCurrency = new Map<string, LedgerCurrency>();
  for (const d of debts) {
    let row = byCurrency.get(d.currency);
    if (!row) {
      row = { currency: d.currency, taken: 0, paid: 0, writtenOff: 0, remaining: 0, debtCount: 0, openCount: 0, settledCount: 0, closedOutCount: 0, overdueCount: 0 };
      byCurrency.set(d.currency, row);
    }
    row.taken += d.amount;
    row.paid += d.paid;
    row.writtenOff += d.writtenOff;
    row.remaining += remainingOf(d.amount, d.paid, d.writtenOff);
    row.debtCount += 1;
    if (d.status === 'OPEN') {
      row.openCount += 1;
      if (d.dueDate && d.dueDate < now) row.overdueCount += 1;
    } else if (d.status === 'SETTLED') {
      row.settledCount += 1;
    } else {
      row.closedOutCount += 1;
    }
  }
  return [...byCurrency.values()]
    .map(r => ({ ...r, taken: round2(r.taken), paid: round2(r.paid), writtenOff: round2(r.writtenOff), remaining: round2(r.remaining) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
