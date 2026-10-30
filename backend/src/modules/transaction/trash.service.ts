import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { Scope, assertCanEditTransaction, scopeKeyOf, scopeWhere } from '../family/scope/scope';
import { TransactionService } from './transaction.service';
import { recordActivity } from '../activity/activity';

export const TRASH_DAYS = 30;
export const MAX_BULK = 200;

type Snap = {
  id: string; clientId: string; familyId: string | null; walletId: string | null; type: string; category: string; title: string;
  subCategory: string | null; description: string | null; amount: string | number; date: string; receiptUrl: string | null; receiptReportUrl: string | null;
  toWalletId: string | null; toAmount: string | number | null; exchangeRate: string | number | null; fundedByDebtId: string | null; scheduledOccurrenceId: string | null;
};

export interface BulkBody { ids?: unknown; action?: unknown; category?: unknown; subCategory?: unknown; walletId?: unknown }
export type BulkResult = { done: string[]; failed: Array<{ id: string; reason: string }>; trashIds: string[] };

/** Recently deleted: what was removed in the last 30 days, put back with Restore (same id, balances corrected), plus bulk changes for History's select mode. */
@Injectable()
export class TrashService {
  constructor(private readonly prisma: PrismaService, private readonly transactions: TransactionService) {}

  async list(scope: Scope) {
    const key = scopeKeyOf(scope);
    const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000);
    await this.prisma.trashedTransaction.deleteMany({ where: { scopeKey: key, deletedAt: { lt: cutoff } } });
    const rows = await this.prisma.trashedTransaction.findMany({ where: { scopeKey: key }, orderBy: { deletedAt: 'desc' }, take: 200 });
    return {
      days: TRASH_DAYS,
      items: rows.map(r => {
        const s = r.snapshot as unknown as Snap;
        return {
          id: r.id, title: r.title, type: r.type, category: s.category, subCategory: s.subCategory ?? null, amount: Number(r.amount), currency: r.currency,
          date: s.date, deletedAt: r.deletedAt, expiresAt: new Date(r.deletedAt.getTime() + TRASH_DAYS * 86_400_000), mine: r.deletedById === scope.clientId,
        };
      }),
    };
  }

  private async find(scope: Scope, id: string) {
    const row = await this.prisma.trashedTransaction.findFirst({ where: { id, scopeKey: scopeKeyOf(scope) } });
    if (!row) throw new NotFoundException('That item is no longer in Recently deleted');
    assertCanEditTransaction(scope, row.clientId);
    return row;
  }

  /** Puts it back with the same id and puts the balances back the way they were before it was deleted. */
  async restore(scope: Scope, id: string) {
    const row = await this.find(scope, id);
    const s = row.snapshot as unknown as Snap;
    const amount = new Prisma.Decimal(String(s.amount));
    await this.prisma.$transaction(async (prx) => {
      const wallets = [s.walletId, s.toWalletId].filter((w): w is string => !!w);
      for (const w of wallets) {
        if (!(await prx.wallet.findFirst({ where: { id: w, ...scopeWhere(scope) }, select: { id: true } }))) throw new ConflictException('The wallet this belonged to was deleted, so it cannot be restored.');
      }
      if (s.fundedByDebtId && !(await prx.debt.findUnique({ where: { id: s.fundedByDebtId }, select: { id: true } }))) throw new ConflictException('The loan this was paid from was deleted, so it cannot be restored.');
      try {
        await prx.transaction.create({
          data: {
            id: s.id, clientId: s.clientId, familyId: s.familyId, walletId: s.walletId, type: s.type as never, category: s.category as never, title: s.title,
            subCategory: s.subCategory, description: s.description, amount, date: new Date(s.date), receiptUrl: s.receiptUrl, receiptReportUrl: s.receiptReportUrl,
            toWalletId: s.toWalletId, toAmount: s.toAmount === null ? null : new Prisma.Decimal(String(s.toAmount)), exchangeRate: s.exchangeRate === null ? null : new Prisma.Decimal(String(s.exchangeRate)),
            fundedByDebtId: s.fundedByDebtId, scheduledOccurrenceId: s.scheduledOccurrenceId,
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') throw new ConflictException('This was already restored.');
        throw e;
      }
      if (s.type === 'TRANSFER') {
        if (s.walletId) await prx.wallet.update({ where: { id: s.walletId }, data: { balance: { decrement: amount } } });
        if (s.toWalletId) await prx.wallet.update({ where: { id: s.toWalletId }, data: { balance: { increment: new Prisma.Decimal(String(s.toAmount ?? s.amount)) } } });
      } else {
        if (s.fundedByDebtId) await prx.debt.updateMany({ where: { id: s.fundedByDebtId }, data: { spent: { increment: amount } } });
        if (s.walletId) await prx.wallet.update({ where: { id: s.walletId }, data: { balance: s.type === 'INCOME' ? { increment: amount } : { decrement: amount } } });
      }
      await prx.trashedTransaction.delete({ where: { id } });
      await recordActivity(prx, scope, { kind: 'transaction.restored', entity: 'transaction', entityId: s.id, title: s.title, amount: Number(amount) });
    });
    return { success: true, transactionId: s.id };
  }

  /** Removes it for good. */
  async purge(scope: Scope, id: string) {
    await this.find(scope, id);
    await this.prisma.trashedTransaction.delete({ where: { id } });
    return { success: true };
  }

  /** Delete, change the category, or move to another wallet, for several rows at once. Each row stands alone: the ones that cannot change are named with a reason, the rest still go through. */
  async bulk(scope: Scope, body: BulkBody): Promise<BulkResult> {
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];
    if (!ids.length) throw new BadRequestException('Choose at least one transaction');
    if (ids.length > MAX_BULK) throw new BadRequestException(`Choose up to ${MAX_BULK} at a time`);
    const action = body.action;
    if (action !== 'delete' && action !== 'category' && action !== 'wallet') throw new BadRequestException('Unknown action');
    if (action === 'category' && typeof body.category !== 'string') throw new BadRequestException('Choose a category');
    if (action === 'wallet' && typeof body.walletId !== 'string') throw new BadRequestException('Choose a wallet');

    const out: BulkResult = { done: [], failed: [], trashIds: [] };
    for (const id of ids) {
      try {
        if (action === 'delete') {
          const r = await this.transactions.remove(scope, id);
          if (r.trashId) out.trashIds.push(r.trashId);
        } else if (action === 'category') {
          await this.transactions.update(scope, id, { category: body.category as never, ...(typeof body.subCategory === 'string' ? { subCategory: body.subCategory } : { subCategory: null as never }) });
        } else {
          await this.transactions.update(scope, id, { walletId: body.walletId as string });
        }
        out.done.push(id);
      } catch (e) {
        const msg = (e as { response?: { message?: unknown } })?.response?.message ?? (e as Error).message;
        out.failed.push({ id, reason: Array.isArray(msg) ? String(msg[0]) : String(msg) });
      }
    }
    return out;
  }
}
