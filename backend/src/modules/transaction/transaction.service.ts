import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { CategorySlug, Prisma, TransactionType } from '../../../generated/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { NO_DEBT_FLOWS, parseIncludeLoans } from '../../common/utils/loan-filter';
import { parseView, viewFilter } from '../../common/utils/feed-view';
import { canonicalCategory, normalizeSubCategory } from '../../common/utils/categories';
import { rememberSubCategory } from '../../common/utils/subcategory';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(clientId: string, query: QueryTransactionDto) {
    const { type, category, walletId, month, year, startDate, endDate, page = 1, limit = 20, search, view, includeLoans } = query;

    // Transfers only appear when asked for: older screens treat non-income as spending.
    const where: Prisma.TransactionWhereInput = { clientId, type: { notIn: ['TRANSFER', 'DEBT'] } };
    if (type === 'income')   where.type = 'INCOME';
    if (type === 'expense')  where.type = 'EXPENSE';
    if (type === 'transfer') where.type = 'TRANSFER';
    // The chip is combined with AND so it can never clash with the other filters (or the search's OR).
    const chip = parseView(view);
    if (chip !== 'all' || includeLoans !== undefined) where.AND = [viewFilter(chip, parseIncludeLoans(includeLoans))];
    if (category)  where.category = category as CategorySlug;
    if (walletId)  where.walletId = walletId;
    if (startDate || endDate) {
      where.date = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate   ? { lte: new Date(endDate)   } : {}),
      };
    } else if (month && year) {
      where.date = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
    }
    if (search) {
      where.OR = [
        { title:       { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data: data.map(t => this.mapTx(t)), total, page, limit };
  }

  async findRecent(clientId: string, limit = 3, view?: string, includeLoans?: string) {
    const chip = parseView(view);
    const txns = await this.prisma.transaction.findMany({
      where: {
        clientId, type: { notIn: ['TRANSFER', 'DEBT'] },
        ...(chip !== 'all' || includeLoans !== undefined ? { AND: [viewFilter(chip, parseIncludeLoans(includeLoans))] } : {}),
      },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return txns.map(t => this.mapTx(t));
  }

  async history(clientId: string, query: QueryTransactionDto) {
    const { category, month, year, startDate, endDate, search, view, includeLoans } = query;
    const where: Prisma.TransactionWhereInput = { clientId, type: { notIn: ['TRANSFER', 'DEBT'] } };
    const chip = parseView(view);
    if (chip !== 'all' || includeLoans !== undefined) where.AND = [viewFilter(chip, parseIncludeLoans(includeLoans))];

    if (category) where.category = category as CategorySlug;
    if (startDate || endDate) {
      where.date = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate   ? { lte: new Date(endDate)   } : {}),
      };
    } else if (month && year) {
      where.date = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
    }
    if (search) {
      where.OR = [
        { title:       { contains: search } },
        { description: { contains: search } },
      ];
    }

    const txns = await this.prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groupMap = new Map<string, ReturnType<typeof this.mapTx>[]>();

    for (const t of txns) {
      const d = new Date(t.date);
      let label: string;
      if (d.toDateString() === today.toDateString()) {
        label = 'TODAY';
      } else if (d.toDateString() === yesterday.toDateString()) {
        label = 'YESTERDAY';
      } else {
        const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
        const mon = MONTH_NAMES[d.getMonth()].toUpperCase();
        label = `${weekday}, ${mon} ${d.getDate()}`;
      }

      if (!groupMap.has(label)) groupMap.set(label, []);
      groupMap.get(label)!.push(this.mapTx(t));
    }

    return Array.from(groupMap.entries()).map(([date, items]) => ({ date, items }));
  }

  /**
   * Creates the transaction and moves the wallet, inside a database transaction the caller owns.
   * Scheduled posting uses this so the transaction and its occurrence change together or not at all.
   */
  async createInTx(
    prx: Prisma.TransactionClient,
    clientId: string,
    dto: CreateTransactionDto,
    extra: { scheduledOccurrenceId?: string } = {},
  ) {
    const amount = Math.abs(dto.amount);
    const date = dto.date ? new Date(dto.date) : new Date();
    // An older app may still send a retired category: it becomes the new one (groceries -> Food, "Groceries").
    const canon = canonicalCategory(dto.category);
    const category = canon.category as CategorySlug;
    const subCategory = normalizeSubCategory(dto.subCategory) ?? canon.subCategory ?? null;
    if (dto.fundedByDebtId) {
      if (dto.type !== 'EXPENSE') throw new BadRequestException('Only an expense can be paid from borrowed money');
      const debt = await prx.debt.findFirst({ where: { id: dto.fundedByDebtId, clientId } });
      if (!debt || debt.kind !== 'BORROWED') throw new BadRequestException('Choose a debt you borrowed');
      if (debt.status !== 'OPEN' || debt.archivedAt) throw new BadRequestException('That debt is closed');
      const unspent = Number(debt.amount) - Number(debt.spent);
      if (amount > unspent + 0.001) throw new BadRequestException(`Only ${unspent} ${debt.currency} of this debt is unspent`);
      dto = { ...dto, walletId: undefined };
      await prx.debt.update({ where: { id: debt.id }, data: { spent: { increment: amount } } });
    }
    const created = await prx.transaction.create({
      data: {
        clientId,
        type: dto.type,
        category,
        title: dto.title,
        subCategory,
        description: dto.description,
        amount,
        date,
        walletId: dto.walletId,
        receiptUrl: dto.receiptUrl,
        receiptReportUrl: dto.receiptReportUrl,
        fundedByDebtId: dto.fundedByDebtId,
        ...extra,
      },
    });

    // What this person typed or picked is offered to them first next time. A scheduled post is not a new choice.
    if (!extra.scheduledOccurrenceId) await rememberSubCategory(prx, clientId, dto.type, category, subCategory);

    if (dto.walletId) {
      const delta = new Prisma.Decimal(amount);
      await prx.wallet.update({
        where: { id: dto.walletId },
        data: {
          balance: dto.type === 'INCOME'
            ? { increment: delta }
            : { decrement: delta },
        },
      });
    }
    return created;
  }

  /** The push (and budget alert) a new transaction causes. Never throws. */
  notifyCreated(clientId: string, tx: { type: TransactionType; amount: unknown; title: string; date: Date }) {
    this.notifyNewTransaction(clientId, tx.type, Number(tx.amount), tx.title, tx.date).catch(() => {});
  }

  async create(clientId: string, dto: CreateTransactionDto) {
    const tx = await this.prisma.$transaction(prx => this.createInTx(prx, clientId, dto));
    this.notifyCreated(clientId, tx);
    return this.mapTx(tx);
  }

  /** Push for the new transaction, plus a budget alert when it crosses 80% / 100%. */
  private async notifyNewTransaction(clientId: string, type: TransactionType, amount: number, title: string, date: Date) {
    const money = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
    this.notifications.notify(
      clientId,
      type === 'INCOME' ? 'Money received' : 'New expense',
      `${type === 'INCOME' ? '+' : '−'}${money} · ${title}`,
      'transaction',
    );
    if (type !== 'EXPENSE') return;

    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const budget = await this.prisma.budget.findUnique({ where: { clientId_month_year: { clientId, month, year } } });
    const limit = budget ? Number(budget.limit) : 0;
    if (limit <= 0) return;

    const agg = await this.prisma.transaction.aggregate({
      where: { clientId, type: 'EXPENSE', date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) }, ...NO_DEBT_FLOWS },
      _sum: { amount: true },
    });
    const after = Number(agg._sum.amount ?? 0);
    const before = after - amount;
    const pct = (v: number) => (v / limit) * 100;

    if (pct(before) < 100 && pct(after) >= 100) {
      this.notifications.notify(clientId, 'Budget exceeded', `You've spent ${Math.round(pct(after))}% of this month's budget.`, 'transaction');
    } else if (pct(before) < 80 && pct(after) >= 80) {
      this.notifications.notify(clientId, 'Budget almost used', `You've used ${Math.round(pct(after))}% of this month's budget.`, 'transaction');
    }
  }

  async update(clientId: string, id: string, dto: Partial<CreateTransactionDto>) {
    const existing = await this.assertOwner(clientId, id);
    if (existing.type === 'DEBT' || existing.debtId) throw new BadRequestException('This was recorded by Debts & loans — change it there.');
    if (existing.fundedByDebtId || dto.fundedByDebtId) throw new BadRequestException('This was paid from borrowed money — delete it and add it again to change it.');
    if (existing.type === 'TRANSFER' || (dto.type as string) === 'TRANSFER') {
      throw new BadRequestException('Transfers cannot be edited. Delete it and make a new transfer.');
    }
    const amount = dto.amount !== undefined ? Math.abs(dto.amount) : undefined;
    const date = dto.date ? new Date(dto.date) : undefined;

    const updated = await this.prisma.$transaction(async (prx) => {
      // Reverse old balance effect
      if (existing.walletId) {
        const oldDelta = new Prisma.Decimal(Number(existing.amount));
        await prx.wallet.update({
          where: { id: existing.walletId },
          data: {
            balance: existing.type === 'INCOME'
              ? { decrement: oldDelta }
              : { increment: oldDelta },
          },
        });
      }

      const data: Prisma.TransactionUncheckedUpdateInput = { ...dto, amount, date } as Prisma.TransactionUncheckedUpdateInput;
      let finalCategory = existing.category as CategorySlug;
      if (dto.category !== undefined) {
        const canon = canonicalCategory(dto.category);
        finalCategory = canon.category as CategorySlug;
        data.category = finalCategory;
        if (dto.subCategory === undefined && canon.subCategory) data.subCategory = canon.subCategory;
      }
      if (dto.subCategory !== undefined) data.subCategory = normalizeSubCategory(dto.subCategory);
      const result = await prx.transaction.update({ where: { id }, data });
      if (typeof data.subCategory === 'string') await rememberSubCategory(prx, clientId, (dto.type ?? existing.type) as TransactionType, finalCategory, data.subCategory);

      // Apply new balance effect
      const newWalletId = dto.walletId ?? existing.walletId;
      if (newWalletId) {
        const newType = dto.type ?? existing.type;
        const newAmount = new Prisma.Decimal(amount ?? Number(existing.amount));
        await prx.wallet.update({
          where: { id: newWalletId },
          data: {
            balance: newType === 'INCOME'
              ? { increment: newAmount }
              : { decrement: newAmount },
          },
        });
      }

      return result;
    });

    return this.mapTx(updated);
  }

  async remove(clientId: string, id: string) {
    const existing = await this.assertOwner(clientId, id);

    if (existing.type === 'DEBT' || existing.debtId) throw new BadRequestException('This was recorded by Debts & loans — change it there.');
    if (existing.type === 'TRANSFER') {
      // Undo both sides: money goes back to the source, leaves the destination.
      await this.prisma.$transaction(async (prx) => {
        await prx.transaction.delete({ where: { id } });
        if (existing.walletId) {
          await prx.wallet.updateMany({ where: { id: existing.walletId }, data: { balance: { increment: existing.amount } } });
        }
        if (existing.toWalletId) {
          await prx.wallet.updateMany({ where: { id: existing.toWalletId }, data: { balance: { decrement: existing.toAmount ?? existing.amount } } });
        }
      });
      return { success: true };
    }

    await this.prisma.$transaction(async (prx) => {
      await prx.transaction.delete({ where: { id } });
      if (existing.fundedByDebtId) {
        await prx.debt.updateMany({ where: { id: existing.fundedByDebtId }, data: { spent: { decrement: existing.amount } } });
      }

      if (existing.walletId) {
        const delta = new Prisma.Decimal(Number(existing.amount));
        await prx.wallet.update({
          where: { id: existing.walletId },
          data: {
            balance: existing.type === 'INCOME'
              ? { decrement: delta }
              : { increment: delta },
          },
        });
      }
    });

    return { success: true };
  }

  private mapTx(t: { id: string; type: TransactionType; category: CategorySlug; title: string; subCategory?: string | null; description: string | null; amount: Prisma.Decimal | number; date: Date; walletId: string | null; receiptUrl: string | null; receiptReportUrl?: string | null; debtId?: string | null; debtRole?: string | null }) {
    const raw = Number(t.amount);
    return {
      id: t.id,
      type: t.type,
      category: t.category,
      title: t.title,
      subCategory: t.subCategory ?? null,
      description: t.description,
      amount: t.type === 'INCOME' ? raw : -raw,
      date: t.date,
      walletId: t.walletId,
      receiptUrl: t.receiptUrl,
      receiptReportUrl: t.receiptReportUrl ?? null,
      debtId: t.debtId ?? null,
      debtRole: t.debtRole ?? null,
    };
  }

  private async assertOwner(clientId: string, id: string) {
    const t = await this.prisma.transaction.findFirst({ where: { id, clientId } });
    if (!t) throw new NotFoundException('Transaction not found');
    return t;
  }
}
