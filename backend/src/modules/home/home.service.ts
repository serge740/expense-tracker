import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { loanFilter } from '../../common/utils/loan-filter';
import { DebtsService } from '../debts/debts.service';
import { ScheduledService } from '../scheduled/scheduled.service';
import { Scope, isFamily, scopeWhere } from '../family/scope/scope';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);
const MAX_ATTENTION = 10;

/** Everything the Home screen shows in one call, so it paints once instead of piecing itself together. */
@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debts: DebtsService,
    private readonly scheduled: ScheduledService,
  ) {}

  async summary(scope: Scope, month: number, year: number, includeLoans = true, now = new Date()) {
    const range = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
    const sum = async (where: object) =>
      num((await this.prisma.transaction.aggregate({ where: { ...scopeWhere(scope), date: range, ...where }, _sum: { amount: true } }))._sum.amount);

    // Month figures. Borrowed money is never income; the switch can leave every loan row out.
    const [income, expense, loanOut, loanIn, borrowed] = await Promise.all([
      sum({ type: 'INCOME', ...loanFilter('INCOME', includeLoans) }),
      sum({ type: 'EXPENSE', ...loanFilter('EXPENSE', includeLoans) }),
      sum({ type: 'EXPENSE', debtRole: { in: ['REPAY_OUT', 'LEND_OUT'] } }),
      sum({ type: 'INCOME', debtRole: 'REPAY_IN' }),
      sum({ type: 'INCOME', debtRole: 'BORROW_IN' }),
    ]);

    // Loans, debts and schedules are personal. Inside a family they are simply not there.
    const personalOnly = !isFamily(scope);
    const clientId = scope.clientId;
    const [overview, waiting, nextSchedule, wallets] = await Promise.all([
      personalOnly ? this.debts.overview(clientId, now) : Promise.resolve({ attention: [] as any[], owe: {} as Record<string, any>, owed: {} as Record<string, any> }),
      personalOnly ? this.scheduled.waiting(clientId, now) : Promise.resolve([] as any[]),
      personalOnly
        ? this.prisma.scheduledTransaction.findFirst({
            where: { clientId, status: 'ACTIVE', nextDueAt: { not: null } }, orderBy: { nextDueAt: 'asc' },
            select: { id: true, title: true, nextDueAt: true },
          })
        : Promise.resolve(null),
      this.prisma.wallet.groupBy({ by: ['currency'], where: { ...scopeWhere(scope), archived: false }, _sum: { balance: true } }),
    ]);

    // Needs attention: overdue pay dates and near ones, plus scheduled dates waiting for an answer.
    const attention = [
      ...overview.attention,
      ...waiting.map(w => ({
        source: 'SCHEDULED' as const, occurrenceId: w.id, scheduleId: w.scheduleId, title: w.title, txType: w.type, currency: w.currency,
        remaining: w.amount, dueAt: w.dueAt, overdue: w.overdue,
      })),
    ].sort((a, b) => Number(b.overdue) - Number(a.overdue) || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

    // Net worth per currency: wallets + owed to you − you owe. Currencies are never mixed.
    const currencies = new Set<string>([...wallets.map(w => w.currency), ...Object.keys(overview.owe), ...Object.keys(overview.owed)]);
    const netWorth = [...currencies].sort().map(currency => {
      const inWallets = num(wallets.find(w => w.currency === currency)?._sum.balance);
      const owedToYou = overview.owed[currency]?.amount ?? 0;
      const youOwe = overview.owe[currency]?.amount ?? 0;
      return { currency, wallets: round2(inWallets), owed: owedToYou, owe: youOwe, total: round2(inWallets + owedToYou - youOwe) };
    });

    return {
      month, year, includeLoans,
      totals: { income: round2(income), expense: round2(expense), net: round2(income - expense) },
      loans: { out: round2(loanOut), in: round2(loanIn), borrowed: round2(borrowed) },
      owe: overview.owe,
      owed: overview.owed,
      scheduled: { waiting: waiting.length, next: nextSchedule },
      attention: attention.slice(0, MAX_ATTENTION),
      attentionTotal: attention.length,
      netWorth,
    };
  }
}
