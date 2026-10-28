import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RepeatRule } from '../scheduled/recurrence';
import { finalDeadline } from './debt-installments';
import { PlanInput, PlanResult, PlanRow, planChanges } from './debt-plan';

/** What the planner needs, read from a saved loan (with its installments). */
export function planInputOf(d: any, now: Date): PlanInput {
  const rows: PlanRow[] = (d.installments ?? []).map((i: any) => ({
    id: i.id, dueAt: new Date(i.dueAt), plannedAmount: i.plannedAmount == null ? null : Number(i.plannedAmount), status: i.status, fromPlan: !!i.fromPlan,
  }));
  const hasPlan = d.kind === 'BORROWED' && d.planAmount != null && d.planRepeat && d.planStartAt;
  return {
    amount: Number(d.amount),
    paid: Number(d.paid),
    writtenOff: Number(d.writtenOffAmount ?? 0),
    live: d.status === 'OPEN' && !d.archivedAt,
    plan: hasPlan ? { amount: Number(d.planAmount), rule: d.planRepeat as RepeatRule, startAt: new Date(d.planStartAt), timezone: d.planTimezone || 'UTC' } : null,
    installments: rows,
    now,
  };
}

export const noChange = (r: PlanResult) => !r.create.length && !r.update.length && !r.remove.length;

/**
 * Keeps a loan's pay dates in step with its estimated payment plan. Called after every change to a loan and
 * once an hour (so a long plan keeps getting its next dates as time passes). Safe to call any time: when nothing
 * needs to change it does nothing.
 */
@Injectable()
export class DebtPlanService {
  private readonly logger = new Logger(DebtPlanService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcile(debtId: string, now = new Date()): Promise<PlanResult | null> {
    const d = await this.prisma.debt.findUnique({ where: { id: debtId }, include: { installments: true } });
    if (!d) return null;
    const input = planInputOf(d, now);
    const hasPlanDatesAhead = input.installments.some(r => r.fromPlan && r.status === 'PENDING' && r.dueAt.getTime() > now.getTime());
    if (!input.plan && !hasPlanDatesAhead) return null;

    const result = planChanges(input);
    if (noChange(result)) return result;

    await this.prisma.$transaction(async prx => {
      if (result.remove.length) await prx.debtInstallment.deleteMany({ where: { id: { in: result.remove }, debtId } });
      for (const u of result.update) await prx.debtInstallment.update({ where: { id: u.id }, data: { plannedAmount: u.plannedAmount } });
      if (result.create.length) {
        await prx.debtInstallment.createMany({ data: result.create.map(c => ({ debtId, dueAt: c.dueAt, plannedAmount: c.plannedAmount, fromPlan: true })) });
      }
      // The loan's final deadline is its last pay date.
      const rows = await prx.debtInstallment.findMany({ where: { debtId } });
      const deadline = finalDeadline(rows.map(r => ({ id: r.id, dueAt: r.dueAt, plannedAmount: r.plannedAmount == null ? null : Number(r.plannedAmount), status: r.status })));
      if (rows.length) await prx.debt.update({ where: { id: debtId }, data: { dueDate: deadline } });
    });
    return result;
  }

  /** The hourly pass: every open loan that has a plan. One failing loan never stops the others. */
  async reconcileAll(now = new Date()): Promise<number> {
    const ids = await this.prisma.debt.findMany({ where: { planAmount: { not: null }, status: 'OPEN', archivedAt: null }, select: { id: true } });
    let changed = 0;
    for (const { id } of ids) {
      try {
        const r = await this.reconcile(id, now);
        if (r && !noChange(r)) changed++;
      } catch (e: any) {
        this.logger.warn(`plan reconcile failed for ${id}: ${e?.message ?? e}`);
      }
    }
    return changed;
  }
}
