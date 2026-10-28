import { compareWall, normalizeRule, occurrences, RepeatRule, ruleProblem, Wall } from '../scheduled/recurrence';
import { localParts, zonedToUtc } from '../reminders/reminder-policy';
import { round2 } from './debt-accounting';
import { deriveInstallments, InstallmentInput } from './debt-installments';

/**
 * A loan's estimated payment: "I will pay about X every month (or week...) until the loan is finished".
 *
 * The plan lives on the loan (amount, repeat rule, first date). The pay dates it makes are ordinary pay dates
 * (DebtInstallment rows marked fromPlan), so reminders, the waterfall of payments and the history all work as they
 * already do. This file only decides WHICH dates should exist; it touches no database.
 *
 * How it stays right as life happens:
 *  - A date that has not come yet and was made by the plan is re-worked every time anything changes (a payment, a new
 *    amount, a new rule), so extra payments shorten the plan and the last date only asks for what is left.
 *  - A date that is already past, or that the person added, moved or skipped by hand, is never rewritten. A missed
 *    payment stays owed on its own date; the plan does not pile it onto later dates.
 *  - Dates are only made for what the loan still needs: once the planned dates cover the balance, no more are added.
 */

/** How many future dates are kept ready at once. More are added as time passes, so a long loan never fills the list. */
export const PLAN_AHEAD = 36;
/** Safety limit when looking for the date the loan ends (e.g. 5,000 a week on a very large loan). */
export const PLAN_LOOKUP_CAP = 1200;

export interface PlanRow extends InstallmentInput {
  fromPlan: boolean;
}

export interface Plan {
  amount: number;
  rule: RepeatRule;
  /** The first pay date. The plan counts its repeats from here. */
  startAt: Date;
  timezone: string;
}

export interface PlanInput {
  /** The loan: what was borrowed, paid and written off. */
  amount: number;
  paid: number;
  writtenOff: number;
  /** Open and not archived. A closed loan has no plan dates ahead. */
  live: boolean;
  plan: Plan | null;
  installments: PlanRow[];
  now: Date;
}

export interface PlanResult {
  create: { dueAt: Date; plannedAmount: number }[];
  update: { id: string; plannedAmount: number }[];
  remove: string[];
  /** The date of the last payment that finishes the loan, or null when the plan does not reach the end. */
  finishesAt: Date | null;
  /** Payments still ahead, counting the ones not made yet. */
  paymentsLeft: number;
  /** What the plan leaves unpaid when its repeat rule ends first (0 when it covers the loan). */
  shortfall: number;
}

/** A readable reason the plan cannot be used, or null. */
export function planProblem(plan: { amount: unknown; rule: unknown; loanAmount: number }): string | null {
  const amount = Number(plan.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter an estimated payment greater than zero';
  if (amount > plan.loanAmount + 0.001) return 'The estimated payment cannot be more than the loan';
  if (plan.rule === null || plan.rule === undefined) return 'Choose how often you will pay';
  return ruleProblem(plan.rule);
}

export const normalizePlanRule = (rule: RepeatRule): RepeatRule => normalizeRule(rule);

const ms = (d: Date) => d.getTime();

export function planChanges(i: PlanInput): PlanResult {
  const { now } = i;
  const isFuturePlanRow = (r: PlanRow) => r.fromPlan && r.status === 'PENDING' && ms(r.dueAt) > ms(now);
  const aheadNow = i.installments.filter(isFuturePlanRow);
  const none: PlanResult = { create: [], update: [], remove: aheadNow.map(r => r.id), finishesAt: null, paymentsLeft: 0, shortfall: 0 };

  const total = round2(Math.max(0, i.amount - i.writtenOff));
  const needed = round2(Math.max(0, total - i.paid));
  if (!i.live || !i.plan || needed <= 0) return none;

  // What the dates that are fixed (past, or made by hand) already ask for.
  const fixed = i.installments.filter(r => !isFuturePlanRow(r));
  const derived = deriveInstallments({ amount: i.amount, writtenOff: i.writtenOff, paid: i.paid, installments: fixed, now });
  const open = derived.filter(d => d.view === 'UPCOMING' || d.view === 'PARTIAL' || d.view === 'OVERDUE');
  const asked = round2(open.reduce((s, d) => s + Math.max(0, d.planned - d.covered), 0));
  let left = round2(Math.max(0, needed - asked));

  // Every date that already exists in any state (a moved or skipped one too) is taken: the plan never recreates it.
  const taken = new Set(fixed.map(r => ms(r.dueAt)));

  const { amount: each, rule, startAt, timezone: tz } = i.plan;
  const startWall = localParts(startAt, tz);
  const nowWall = localParts(new Date(ms(now) + 60_000), tz);
  const fromWall: Wall = compareWall(startWall, nowWall) >= 0 ? startWall : nowWall;
  const look = Math.min(PLAN_LOOKUP_CAP, Math.ceil(left / each - 1e-9) + fixed.length + 2);

  const all: { dueAt: Date; plannedAmount: number }[] = [];
  if (left > 0.005) {
    for (const wall of occurrences(rule, startWall, look, fromWall)) {
      const dueAt = zonedToUtc(wall, tz);
      if (ms(dueAt) <= ms(now) || taken.has(ms(dueAt))) continue;
      if (left <= 0.005) break;
      const plannedAmount = round2(Math.min(each, left));
      left = round2(left - plannedAmount);
      all.push({ dueAt, plannedAmount });
    }
  }
  const covered = left <= 0.005;
  const desired = all.slice(0, PLAN_AHEAD);

  // Line the wanted dates up with the ones already there (matched by the instant), changing as little as possible.
  const byInstant = new Map(aheadNow.map(r => [ms(r.dueAt), r]));
  const keep = new Set<string>();
  const create: PlanResult['create'] = [];
  const update: PlanResult['update'] = [];
  for (const want of desired) {
    const have = byInstant.get(ms(want.dueAt));
    if (!have) { create.push(want); continue; }
    keep.add(have.id);
    if (have.plannedAmount === null || round2(have.plannedAmount) !== want.plannedAmount) update.push({ id: have.id, plannedAmount: want.plannedAmount });
  }
  const remove = aheadNow.filter(r => !keep.has(r.id)).map(r => r.id);

  const stillOwed = open.filter(d => d.planned - d.covered > 0.005).length;
  const lastFixed = open.length ? Math.max(...fixed.filter(r => open.some(d => d.id === r.id)).map(r => ms(r.dueAt))) : null;
  const finishesAt = !covered ? null : all.length ? all[all.length - 1].dueAt : lastFixed !== null ? new Date(lastFixed) : null;

  return { create, update, remove, finishesAt, paymentsLeft: stillOwed + all.length, shortfall: covered ? 0 : left };
}
