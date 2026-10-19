import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma';
import { CreateDebtDto, DebtPaymentDto, UpdateDebtDto } from './dto/debt.dto';
import { NotificationsService } from '../notifications/notifications.service';

type Tx = Prisma.TransactionClient;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Money you borrowed (BORROWED) or lent (LENT), with repayments.
 * When a wallet is involved the money is recorded as a normal transaction
 * in the "loan" category, linked by debtId:
 *   money into the wallet (borrowing, being repaid) → INCOME
 *   money out of the wallet (lending, repaying)     → EXPENSE
 */
@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private serialize(d: any) {
    const amount = Number(d.amount);
    const paid = Number(d.paid);
    return {
      ...d,
      amount,
      paid,
      remaining: round2(Math.max(0, amount - paid)),
      overdue: d.status === 'OPEN' && !!d.dueDate && new Date(d.dueDate) < new Date(),
      payments: (d.payments ?? []).map((p: any) => ({ ...p, amount: Number(p.amount) })),
    };
  }

  private async owned(clientId: string, id: string) {
    const d = await this.prisma.debt.findFirst({ where: { id, clientId }, include: { payments: { orderBy: { date: 'desc' } } } });
    if (!d) throw new NotFoundException('Debt not found');
    return d;
  }

  private async wallet(clientId: string, walletId: string, currency: string) {
    const w = await this.prisma.wallet.findFirst({ where: { id: walletId, clientId } });
    if (!w) throw new NotFoundException('Wallet not found');
    if (w.currency !== currency) throw new BadRequestException(`Choose a ${currency} wallet for this debt`);
    return w;
  }

  /** Move money for a debt event and return the transaction id. */
  private async move(prx: Tx, clientId: string, opts: {
    debtId: string; walletId: string; amount: number; direction: 'in' | 'out'; title: string; date: Date; note?: string | null;
  }) {
    const tx = await prx.transaction.create({
      data: {
        clientId,
        type: opts.direction === 'in' ? 'INCOME' : 'EXPENSE',
        category: 'loan',
        title: opts.title,
        description: opts.note ?? null,
        amount: opts.amount,
        date: opts.date,
        debtId: opts.debtId,
        walletId: opts.walletId,
      },
    });
    await prx.wallet.update({
      where: { id: opts.walletId },
      data: { balance: opts.direction === 'in' ? { increment: opts.amount } : { decrement: opts.amount } },
    });
    return tx.id;
  }

  /** Undo a debt transaction's effect on its wallet and delete it. */
  private async unmove(prx: Tx, transactionId: string) {
    const tx = await prx.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) return;
    const into = tx.type === 'INCOME' || (tx.type === 'DEBT' && !!tx.toWalletId);
    const walletId = tx.walletId ?? tx.toWalletId;
    if (walletId) {
      await prx.wallet.updateMany({ where: { id: walletId }, data: { balance: into ? { decrement: tx.amount } : { increment: tx.amount } } });
    }
    await prx.transaction.delete({ where: { id: transactionId } });
  }

  async list(clientId: string, kind?: string, status?: string) {
    const debts = await this.prisma.debt.findMany({
      where: {
        clientId,
        ...(kind === 'BORROWED' || kind === 'LENT' ? { kind } : {}),
        ...(status === 'OPEN' || status === 'SETTLED' ? { status } : {}),
      },
      include: { payments: { orderBy: { date: 'desc' } } },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    return debts.map(d => this.serialize(d));
  }

  async findOne(clientId: string, id: string) {
    return this.serialize(await this.owned(clientId, id));
  }

  /** Open balances per currency, split into what I owe and what I'm owed. */
  async summary(clientId: string) {
    const open = await this.prisma.debt.findMany({ where: { clientId, status: 'OPEN' } });
    const owe: Record<string, number> = {};
    const owed: Record<string, number> = {};
    let overdue = 0;
    for (const d of open) {
      const rem = Number(d.amount) - Number(d.paid);
      const bucket = d.kind === 'BORROWED' ? owe : owed;
      bucket[d.currency] = round2((bucket[d.currency] ?? 0) + rem);
      if (d.dueDate && d.dueDate < new Date()) overdue++;
    }
    return { owe, owed, openCount: open.length, overdue };
  }

  async create(clientId: string, dto: CreateDebtDto) {
    const amount = Number(dto.amount);
    if (dto.kind !== 'BORROWED' && dto.kind !== 'LENT') throw new BadRequestException('Choose borrowed or lent');
    if (!dto.person?.trim()) throw new BadRequestException('Enter who the money is with');
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount greater than zero');

    let currency = (dto.currency ?? '').toUpperCase();
    if (dto.walletId) {
      const w = await this.prisma.wallet.findFirst({ where: { id: dto.walletId, clientId } });
      if (!w) throw new NotFoundException('Wallet not found');
      currency = w.currency;
    }
    if (!currency) throw new BadRequestException('Choose a currency');
    const date = dto.date ? new Date(dto.date) : new Date();
    const person = dto.person.trim();

    const debt = await this.prisma.$transaction(async prx => {
      const d = await prx.debt.create({
        data: {
          clientId, kind: dto.kind, person, phone: dto.phone?.trim() || null, amount, currency, date,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null, note: dto.note?.trim() || null, walletId: dto.walletId ?? null,
        },
      });
      if (dto.walletId) {
        await this.move(prx, clientId, {
          debtId: d.id, walletId: dto.walletId, amount, date, note: d.note,
          direction: dto.kind === 'BORROWED' ? 'in' : 'out',
          title: dto.kind === 'BORROWED' ? `Borrowed from ${person}` : `Lent to ${person}`,
        });
      }
      return d;
    });
    return this.findOne(clientId, debt.id);
  }

  async update(clientId: string, id: string, dto: UpdateDebtDto) {
    const d = await this.owned(clientId, id);
    const amount = dto.amount !== undefined ? Number(dto.amount) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount < Number(d.paid) || amount <= 0)) {
      throw new BadRequestException('Amount cannot be less than what was already paid');
    }
    await this.prisma.debt.update({
      where: { id },
      data: {
        ...(dto.person !== undefined ? { person: dto.person.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(amount !== undefined ? { amount, status: Number(d.paid) >= amount ? 'SETTLED' : 'OPEN' } : {}),
      },
    });
    return this.findOne(clientId, id);
  }

  async addPayment(clientId: string, id: string, dto: DebtPaymentDto) {
    const d = await this.owned(clientId, id);
    const remaining = round2(Number(d.amount) - Number(d.paid));
    const amount = round2(Number(dto.amount));
    if (d.status === 'SETTLED' || remaining <= 0) throw new BadRequestException('This debt is already settled');
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount greater than zero');
    if (amount > remaining) throw new BadRequestException(`Only ${remaining} ${d.currency} is left to pay`);
    if (dto.walletId) await this.wallet(clientId, dto.walletId, d.currency);
    const date = dto.date ? new Date(dto.date) : new Date();

    await this.prisma.$transaction(async prx => {
      const transactionId = dto.walletId
        ? await this.move(prx, clientId, {
            debtId: d.id, walletId: dto.walletId, amount, date, note: dto.note,
            // Repaying what I borrowed → money out; being repaid → money in.
            direction: d.kind === 'BORROWED' ? 'out' : 'in',
            title: d.kind === 'BORROWED' ? `Repaid ${d.person}` : `Repayment from ${d.person}`,
          })
        : null;
      await prx.debtPayment.create({
        data: { debtId: d.id, amount, date, walletId: dto.walletId ?? null, transactionId, note: dto.note?.trim() || null },
      });
      const paid = round2(Number(d.paid) + amount);
      await prx.debt.update({ where: { id: d.id }, data: { paid, status: paid >= Number(d.amount) ? 'SETTLED' : 'OPEN' } });
    });

    const settled = round2(Number(d.paid) + amount) >= Number(d.amount);
    if (settled) {
      this.notifications.notify(clientId, 'Debt settled',
        d.kind === 'BORROWED' ? `You've fully repaid ${d.person}.` : `${d.person} has fully repaid you.`, 'transaction');
    }
    return this.findOne(clientId, id);
  }

  async removePayment(clientId: string, id: string, paymentId: string) {
    const d = await this.owned(clientId, id);
    const p = d.payments.find(x => x.id === paymentId);
    if (!p) throw new NotFoundException('Payment not found');
    await this.prisma.$transaction(async prx => {
      if (p.transactionId) await this.unmove(prx, p.transactionId);
      await prx.debtPayment.delete({ where: { id: p.id } });
      const paid = round2(Math.max(0, Number(d.paid) - Number(p.amount)));
      await prx.debt.update({ where: { id: d.id }, data: { paid, status: paid >= Number(d.amount) ? 'SETTLED' : 'OPEN' } });
    });
    return this.findOne(clientId, id);
  }

  /** Delete a debt and undo every wallet movement it caused. */
  async remove(clientId: string, id: string) {
    await this.owned(clientId, id);
    await this.prisma.$transaction(async prx => {
      const txns = await prx.transaction.findMany({ where: { clientId, debtId: id }, select: { id: true } });
      for (const t of txns) await this.unmove(prx, t.id);
      await prx.debt.delete({ where: { id } });
    });
    return { success: true };
  }
}
