// Ported from expo_app/utils/debt-plan.ts
import { RepeatRule, dateOfWall, occurrences, wallOfDate } from '@/utils/recurrence';

/** What an estimated payment adds up to, shown while the person is still typing it (the server makes the real dates). */
export interface PlanPreview {
  /** How many payments it takes. */
  payments: number;
  /** The date of the last payment, or null when the repeat rule stops before the loan is paid off. */
  lastAt: Date | null;
  /** What would still be unpaid if the rule stops first (0 when it reaches the end). */
  shortfall: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const LOOK_CAP = 1200;

/**
 * "About N payments, the last one around D." `start` is the first pay date (the rule counts its repeats from it);
 * `from` hides dates already behind (an existing loan only needs the ones still ahead).
 */
export function planPreview(a: { loanAmount: number; planAmount: number; rule: RepeatRule; start: Date; from?: Date }): PlanPreview | null {
  if (!(a.loanAmount > 0) || !(a.planAmount > 0)) return null;
  // One payment can never be more than what is owed.
  const each = Math.min(a.planAmount, a.loanAmount);
  const need = Math.min(LOOK_CAP, Math.ceil(a.loanAmount / each - 1e-9));
  const startWall = wallOfDate(a.start);
  const walls = occurrences(a.rule, startWall, need, a.from ? wallOfDate(a.from) : startWall);
  const payments = walls.length;
  const shortfall = round2(Math.max(0, a.loanAmount - payments * each));
  return { payments, lastAt: shortfall > 0.005 || !payments ? null : dateOfWall(walls[payments - 1]), shortfall };
}

/** The estimated payment as typed: a positive number no bigger than the loan, or an error key for the form. */
export function planAmountError(text: string, loanAmount: number): 'plan.errAmount' | null {
  const value = parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 && value <= loanAmount + 0.001 ? null : 'plan.errAmount';
}
