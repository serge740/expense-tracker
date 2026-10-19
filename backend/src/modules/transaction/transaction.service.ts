import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { CategorySlug, Prisma, TransactionType } from '../../../generated/prisma';
import { NotificationsService } from '../notifications/notifications.service';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(clientId: string, query: QueryTransactionDto) {
    const { type, category, walletId, month, year, startDate, endDate, page = 1, limit = 20, search } = query;

    // Transfers only appear when asked for: older screens treat non-income as spending.
    const where: Prisma.TransactionWhereInput = { clientId, type: { notIn: ['TRANSFER', 'DEBT'] } };
    if (type === 'income')   where.type = 'INCOME';
    if (type === 'expense')  where.type = 'EXPENSE';
    if (type === 'transfer') where.type = 'TRANSFER';
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

  /** Store a receipt image on disk and return its path under /uploads. */
  async saveReceipt(clientId: string, buffer: Buffer, mimeType: string): Promise<{ receiptUrl: string }> {
    const { join } = await import('path');
    const { mkdirSync, writeFileSync } = await import('fs');
    const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
    const filename = `receipt_${clientId.slice(0, 8)}_${Date.now()}${ext}`;
    const dir = join(process.cwd(), 'uploads', 'receipts');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), buffer);
    return { receiptUrl: `receipts/${filename}` };
  }

  async findRecent(clientId: string, limit = 3) {
    const txns = await this.prisma.transaction.findMany({
      where: { clientId, type: { notIn: ['TRANSFER', 'DEBT'] } },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return txns.map(t => this.mapTx(t));
  }

  async history(clientId: string, query: QueryTransactionDto) {
    const { category, month, year, startDate, endDate, search } = query;
    const where: Prisma.TransactionWhereInput = { clientId, type: { notIn: ['TRANSFER', 'DEBT'] } };

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

  async create(clientId: string, dto: CreateTransactionDto) {
    const amount = Math.abs(dto.amount);
    const date = dto.date ? new Date(dto.date) : new Date();

    const tx = await this.prisma.$transaction(async (prx) => {
      const created = await prx.transaction.create({
        data: {
          clientId,
          type: dto.type,
          category: dto.category,
          title: dto.title,
          description: dto.description,
          amount,
          date,
          walletId: dto.walletId,
          receiptUrl: dto.receiptUrl,
        },
      });

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
    });

    this.notifyNewTransaction(clientId, tx.type, amount, dto.title, date).catch(() => {});
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
      where: { clientId, type: 'EXPENSE', date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) } },
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

      const result = await prx.transaction.update({
        where: { id },
        data: { ...dto, amount, date },
      });

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

  private mapTx(t: { id: string; type: TransactionType; category: CategorySlug; title: string; description: string | null; amount: Prisma.Decimal | number; date: Date; walletId: string | null; receiptUrl: string | null }) {
    const raw = Number(t.amount);
    return {
      id: t.id,
      type: t.type,
      category: t.category,
      title: t.title,
      description: t.description,
      amount: t.type === 'INCOME' ? raw : -raw,
      date: t.date,
      walletId: t.walletId,
      receiptUrl: t.receiptUrl,
    };
  }

  private async assertOwner(clientId: string, id: string) {
    const t = await this.prisma.transaction.findFirst({ where: { id, clientId } });
    if (!t) throw new NotFoundException('Transaction not found');
    return t;
  }
}
