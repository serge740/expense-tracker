import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { CategorySlug, Prisma, TransactionType } from '../../../generated/prisma';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

@Injectable()
export class TransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(clientId: string, query: QueryTransactionDto) {
    const { type, category, walletId, month, year, startDate, endDate, page = 1, limit = 20 } = query;

    const where: Prisma.TransactionWhereInput = { clientId };
    if (type === 'income')  where.type = 'INCOME';
    if (type === 'expense') where.type = 'EXPENSE';
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

  async findRecent(clientId: string, limit = 3) {
    const txns = await this.prisma.transaction.findMany({
      where: { clientId },
      orderBy: { date: 'desc' },
      take: limit,
    });
    return txns.map(t => this.mapTx(t));
  }

  async history(clientId: string, query: QueryTransactionDto) {
    const { category, month, year, startDate, endDate } = query;
    const where: Prisma.TransactionWhereInput = { clientId };

    if (category) where.category = category as CategorySlug;
    if (startDate || endDate) {
      where.date = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate   ? { lte: new Date(endDate)   } : {}),
      };
    } else if (month && year) {
      where.date = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
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

    return this.mapTx(tx);
  }

  async update(clientId: string, id: string, dto: Partial<CreateTransactionDto>) {
    const existing = await this.assertOwner(clientId, id);
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
