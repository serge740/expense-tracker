import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';
import { NO_DEBT_FLOWS } from '../../common/utils/loan-filter';
import { Scope, assertScopeCan, scopeData, scopeKeyOf, scopeWhere } from '../family/scope/scope';
import { errors } from '../family/family-errors';
import { recordActivity } from '../activity/activity';

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  /** This month's limit and spending for the scope asked for: your own, or the family's. They never share a number. */
  async getCurrent(scope: Scope) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const budget = await this.prisma.budget.findUnique({
      where: { scopeKey_month_year: { scopeKey: scopeKeyOf(scope), month, year } },
    });

    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    const agg = await this.prisma.transaction.aggregate({
      where: { ...scopeWhere(scope), type: 'EXPENSE', date: { gte: start, lt: end }, ...NO_DEBT_FLOWS },
      _sum: { amount: true },
    });

    const limit     = budget ? Number(budget.limit) : 0;
    const spent     = Number(agg._sum.amount ?? 0);
    const remaining = Math.max(0, limit - spent);
    const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;

    return { limit, spent, remaining, percentage, month, year };
  }

  /** Setting a family budget is for the Owner and Admins; your own budget is always yours to set. */
  async upsert(scope: Scope, dto: UpsertBudgetDto) {
    assertScopeCan(scope, 'budget.set');
    const limit = Number(dto?.limit);
    if (!Number.isFinite(limit) || limit < 0) throw errors.invalid('The budget must be a number, zero or more');
    const now   = new Date();
    const month = dto.month ?? now.getMonth() + 1;
    const year  = dto.year  ?? now.getFullYear();

    const before = await this.prisma.budget.findFirst({ where: { ...scopeWhere(scope), month, year }, select: { limit: true } });
    const budget = await this.prisma.budget.upsert({
      where:  { scopeKey_month_year: { scopeKey: scopeKeyOf(scope), month, year } },
      create: { ...scopeData(scope), scopeKey: scopeKeyOf(scope), month, year, limit },
      update: { limit },
    });

    await recordActivity(this.prisma, scope, { kind: 'budget.set', entity: 'budget', entityId: budget.id, title: `${String(month).padStart(2, '0')}/${year}`, amount: limit, changes: before && Number(before.limit) !== limit ? [{ field: 'limit', from: Number(before.limit), to: limit }] : undefined });
    return { ...budget, limit: Number(budget.limit) };
  }
}
