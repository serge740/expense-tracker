import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FamilyAccessService } from './family-access.service';
import { errors } from './family-errors';
import { can } from './family-permissions';
import { displayName } from './family.service';
import { retryOnConflict } from '../transaction/transaction.service';
import { recordActivity } from '../activity/activity';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ContributeInput { personalWalletId?: unknown; familyWalletId?: unknown; amount?: unknown; note?: unknown }
export interface ReimburseInput { memberId?: unknown; familyWalletId?: unknown; amount?: unknown; note?: unknown }

/**
 * Money that crosses between a person's own wallets and the family's: a contribution goes in, a reimbursement comes back.
 * Each move is two rows made in one database transaction and tied together by transferGroupId, one inside each space,
 * so neither space ever shows the other's wallets or balances.
 */
@Injectable()
export class FamilyTransfersService {
  constructor(private readonly prisma: PrismaService, private readonly access: FamilyAccessService, private readonly notifications: NotificationsService) {}

  private amountOf(v: unknown) {
    const n = round2(Number(v));
    if (!Number.isFinite(n) || n <= 0 || n > 999_999_999) throw errors.invalid('Enter an amount greater than zero');
    return n;
  }
  private noteOf(v: unknown) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null; }

  /** Moves `amount` out of `from` into `to` and writes the two linked rows. Wallets change in id order so two moves can never wait on each other in a circle. */
  private async move(a: { from: any; to: any; amount: number; group: string; note: string | null; out: Record<string, unknown>; into: Record<string, unknown>; activity: Parameters<typeof recordActivity>[2]; scope: any }) {
    await retryOnConflict(() => this.prisma.$transaction(async prx => {
      const changes = [{ id: a.from.id, change: { decrement: new Prisma.Decimal(a.amount) } }, { id: a.to.id, change: { increment: new Prisma.Decimal(a.amount) } }].sort((x, y) => x.id.localeCompare(y.id));
      for (const w of changes) await prx.wallet.update({ where: { id: w.id }, data: { balance: w.change } });
      const date = new Date();
      await prx.transaction.create({ data: { type: 'EXPENSE', category: 'other', amount: a.amount, date, walletId: a.from.id, transferGroupId: a.group, description: a.note, ...a.out } as never });
      await prx.transaction.create({ data: { type: 'INCOME', category: 'other', amount: a.amount, date, walletId: a.to.id, transferGroupId: a.group, description: a.note, ...a.into } as never });
      await recordActivity(prx as never, a.scope, a.activity);
    }));
  }

  /** One wallet by id inside exactly one space: a family's (familyId) or one person's personal ones (clientId, familyId null). */
  private async lockedWallet(id: string, owner: { familyId: string } | { clientId: string }, what: string) {
    const w = await this.prisma.wallet.findFirst({ where: 'familyId' in owner ? { id, familyId: owner.familyId } : { id, clientId: owner.clientId, familyId: null } });
    if (!w) throw errors.walletNotFound();
    if (w.archived) throw errors.invalid(`${what} is archived and cannot send or receive money`);
    return w;
  }
  private assertCovered(w: any, amount: number) {
    if (w.walletType !== 'CREDIT' && Number(w.balance) < amount) throw errors.invalid(`Not enough money in ${w.name}`);
  }

  /** What the screen needs to offer: the caller's own wallets, the family's wallets, and (for owners and admins) who can be paid back. */
  async options(clientId: string, familyId: string) {
    const m = await this.access.requireMember(clientId, familyId);
    const canContribute = can(m.role, 'transfer.contribute');
    const canReimburse = can(m.role, 'transfer.reimburse');
    const pick = (w: any) => ({ id: w.id, name: w.name, currency: w.currency, balance: Number(w.balance) });
    const [mine, theirs, people] = await Promise.all([
      canContribute ? this.prisma.wallet.findMany({ where: { clientId, familyId: null, archived: false }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }) : [],
      this.prisma.wallet.findMany({ where: { familyId, archived: false }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
      canReimburse ? this.prisma.familyMember.findMany({ where: { familyId, status: 'ACTIVE' }, select: { clientId: true } }) : [],
    ]);
    const ids = people.map((p: any) => p.clientId as string);
    const clients = ids.length ? await this.prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    return {
      canContribute, canReimburse, currency: m.family.currency,
      personalWallets: mine.map(pick), familyWallets: theirs.map(pick),
      members: clients.map(c => ({ clientId: c.id, name: displayName(c), isYou: c.id === clientId })),
    };
  }

  /** A member puts money from one of their own personal wallets into a family wallet. */
  async contribute(clientId: string, familyId: string, dto: ContributeInput) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'transfer.contribute');
    const amount = this.amountOf(dto.amount);
    const from = await this.lockedWallet(String(dto.personalWalletId ?? ''), { clientId }, 'Your wallet');
    const to = await this.lockedWallet(String(dto.familyWalletId ?? ''), { familyId }, 'The family wallet');
    if (from.currency !== to.currency) throw errors.invalid(`Both wallets must use the same currency (${from.currency} and ${to.currency})`);
    this.assertCovered(from, amount);
    const me = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true, firstName: true, lastName: true } });
    const group = randomUUID();
    const note = this.noteOf(dto.note);
    await this.move({
      from, to, amount, group, note, scope: { kind: 'family', clientId, familyId },
      out: { clientId, familyId: null, title: `Contribution to ${m.family.name}` },
      into: { clientId, familyId, title: `Contribution from ${displayName(me ?? { firstName: '', lastName: '' })}` },
      activity: { kind: 'family.contribution', entity: 'wallet', entityId: to.id, title: to.name, amount, currency: to.currency },
    });
    return { groupId: group, amount, currency: to.currency };
  }

  /** An owner or admin pays a member back from a family wallet into that member's personal wallet. */
  async reimburse(clientId: string, familyId: string, dto: ReimburseInput) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'transfer.reimburse');
    const amount = this.amountOf(dto.amount);
    const memberId = String(dto.memberId ?? '');
    const target = memberId ? await this.access.membershipIn(memberId, familyId) : null;
    if (!target) throw errors.notFound();
    const from = await this.lockedWallet(String(dto.familyWalletId ?? ''), { familyId }, 'The family wallet');
    this.assertCovered(from, amount);
    // The member's own default wallet in this currency receives it: an owner never picks inside someone else's personal space.
    const theirs = await this.prisma.wallet.findMany({ where: { clientId: memberId, familyId: null, archived: false, currency: from.currency }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    const to = theirs[0];
    if (!to) throw errors.invalid(`That member has no personal ${from.currency} wallet to receive the money`);
    const person = await this.prisma.client.findUnique({ where: { id: memberId }, select: { id: true, firstName: true, lastName: true } });
    const name = displayName(person ?? { firstName: '', lastName: '' });
    const group = randomUUID();
    const note = this.noteOf(dto.note);
    await this.move({
      from, to, amount, group, note, scope: { kind: 'family', clientId, familyId },
      out: { clientId, familyId, title: `Reimbursement to ${name}` },
      into: { clientId: memberId, familyId: null, title: `Reimbursement from ${m.family.name}` },
      activity: { kind: 'family.reimbursement', entity: 'wallet', entityId: from.id, title: `${from.name} → ${name}`, amount, currency: from.currency },
    });
    this.notifications.notify(memberId, 'You were paid back', `${amount.toLocaleString('en-US')} ${from.currency} from ${m.family.name}`, 'transaction');
    return { groupId: group, amount, currency: from.currency, walletId: to.id };
  }
}
