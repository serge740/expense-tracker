import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food', transport: 'Transport', shopping: 'Shopping',
  health: 'Health', entertainment: 'Entertainment', travel: 'Travel',
  groceries: 'Groceries', salary: 'Salary', other: 'Other',
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async monthly(clientId: string, year: number, months: number) {
    const now = new Date();
    const results: { month: string; year: number; total: number; heightPct: number }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const agg = await this.prisma.transaction.aggregate({
        where: { clientId, type: 'EXPENSE', date: { gte: start, lt: end } },
        _sum: { amount: true },
      });

      results.push({
        month: MONTH_NAMES[d.getMonth()],
        year: d.getFullYear(),
        total: Number(agg._sum.amount ?? 0),
        heightPct: 0,
      });
    }

    const max = Math.max(...results.map(r => r.total), 1);
    return results.map(r => ({ ...r, heightPct: Math.round((r.total / max) * 100) }));
  }

  private resolveDateRange(month: number, year: number, startDate?: string, endDate?: string): [Date, Date] {
    if (startDate && endDate) return [new Date(startDate), new Date(endDate)];
    return [new Date(year, month - 1, 1), new Date(year, month, 1)];
  }

  async byCategory(clientId: string, month: number, year: number, startDate?: string, endDate?: string) {
    const [start, end] = this.resolveDateRange(month, year, startDate, endDate);

    const groups = await this.prisma.transaction.groupBy({
      by: ['category'],
      where: { clientId, type: 'EXPENSE', date: { gte: start, lt: end } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const total = groups.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0);

    return groups.map(g => ({
      category: g.category,
      label: CATEGORY_LABELS[g.category] ?? g.category,
      amount: Number(g._sum.amount ?? 0),
      percentage: total > 0 ? Math.round((Number(g._sum.amount ?? 0) / total) * 100) : 0,
    }));
  }

  async summary(clientId: string, month: number, year: number, startDate?: string, endDate?: string) {
    const [start, end] = this.resolveDateRange(month, year, startDate, endDate);

    const [inc, exp] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { clientId, type: 'INCOME', date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { clientId, type: 'EXPENSE', date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
    ]);

    const totalIncome  = Number(inc._sum.amount ?? 0);
    const totalExpense = Number(exp._sum.amount ?? 0);
    return { totalIncome, totalExpense, net: totalIncome - totalExpense };
  }

  async topExpenses(clientId: string, month: number, year: number, limit: number) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    const txns = await this.prisma.transaction.findMany({
      where: { clientId, type: 'EXPENSE', date: { gte: start, lt: end } },
      orderBy: { amount: 'desc' },
      take: limit,
    });

    return txns.map(t => ({
      id: t.id,
      category: t.category,
      title: t.title,
      amount: -Number(t.amount),
      date: t.date,
    }));
  }
}
