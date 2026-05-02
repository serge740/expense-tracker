import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(clientId: string) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const budget = await this.prisma.budget.findUnique({
      where: { clientId_month_year: { clientId, month, year } },
    });

    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    const agg = await this.prisma.transaction.aggregate({
      where: { clientId, type: 'EXPENSE', date: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    const limit     = budget ? Number(budget.limit) : 0;
    const spent     = Number(agg._sum.amount ?? 0);
    const remaining = Math.max(0, limit - spent);
    const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;

    return { limit, spent, remaining, percentage, month, year };
  }

  async upsert(clientId: string, dto: UpsertBudgetDto) {
    const now   = new Date();
    const month = dto.month ?? now.getMonth() + 1;
    const year  = dto.year  ?? now.getFullYear();

    const budget = await this.prisma.budget.upsert({
      where:  { clientId_month_year: { clientId, month, year } },
      create: { clientId, month, year, limit: dto.limit },
      update: { limit: dto.limit },
    });

    return { ...budget, limit: Number(budget.limit) };
  }
}
