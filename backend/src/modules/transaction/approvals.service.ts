import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FamilyAccessService } from '../family/family-access.service';
import { errors } from '../family/family-errors';
import { displayName } from '../family/family.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FamilyScope } from '../family/scope/scope';
import { recordActivity } from '../activity/activity';
import { TransactionService, retryOnConflict } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Approvals: when the owner sets a threshold, a member's expense above it is kept here instead of being added. It touches no balance,
 * budget or report until an owner or admin approves it; then it is added exactly as it was asked for, in the member's name.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FamilyAccessService,
    private readonly transactions: TransactionService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {
    this.transactions.holdHook = (scope, dto) => (scope.kind === 'family' ? this.holdIfNeeded(scope, dto) : Promise.resolve(null));
  }

  /** What a request looks like to the app. */
  private shape(r: any, names: Map<string, string>) {
    const snap = r.snapshot as Partial<CreateTransactionDto>;
    return {
      id: r.id, title: r.title, amount: Number(r.amount), status: r.status, createdAt: r.createdAt, decidedAt: r.decidedAt, reason: r.reason ?? null,
      category: snap.category ?? 'other', date: snap.date ?? r.createdAt, walletId: snap.walletId ?? null, transactionId: r.transactionId ?? null,
      requestedBy: { clientId: r.requestedById, name: names.get(r.requestedById) ?? 'Former member' },
      decidedBy: r.decidedById ? { clientId: r.decidedById, name: names.get(r.decidedById) ?? 'Former member' } : null,
    };
  }
  private async namesOf(ids: string[]) {
    const u = [...new Set(ids)];
    const people = u.length ? await this.prisma.client.findMany({ where: { id: { in: u } }, select: { id: true, firstName: true, lastName: true } }) : [];
    return new Map(people.map(p => [p.id, displayName(p)]));
  }

  /** Called by the transaction service: should this expense wait? If so it is stored and described; otherwise null and nothing changes. */
  async holdIfNeeded(scope: FamilyScope, dto: CreateTransactionDto): Promise<{ pending: true; approvalId: string; title: string; amount: number } | null> {
    if (dto.type !== 'EXPENSE' || scope.role !== 'MEMBER') return null;
    const family = await this.prisma.family.findUnique({ where: { id: scope.familyId } });
    const threshold = family?.approvalThreshold == null ? 0 : Number(family.approvalThreshold);
    const amount = round2(Math.abs(Number(dto.amount)));
    if (threshold <= 0 || amount <= threshold) return null;
    if (dto.walletId) {
      const w = await this.prisma.wallet.findFirst({ where: { id: dto.walletId, familyId: scope.familyId }, select: { id: true } });
      if (!w) throw errors.walletNotFound();
    }
    const row = await this.prisma.familyApproval.create({
      data: { familyId: scope.familyId, requestedById: scope.clientId, snapshot: JSON.parse(JSON.stringify({ ...dto, amount })), title: String(dto.title ?? '').slice(0, 190), amount },
    });
    await recordActivity(this.prisma as never, scope as never, { kind: 'family.approval_requested', entity: 'family', entityId: row.id, title: row.title, amount });
    try {
      const managers = await this.prisma.familyMember.findMany({ where: { familyId: scope.familyId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } }, select: { clientId: true } });
      const me = await this.prisma.client.findUnique({ where: { id: scope.clientId }, select: { firstName: true, lastName: true } });
      for (const m of managers) {
        this.notifications?.notify(m.clientId, 'Approval needed', `${me ? displayName(me) : 'A member'} wants to add −${amount.toLocaleString('en-US')} · ${row.title}`, 'transaction', { familyId: scope.familyId, approvalId: row.id });
        this.notifications?.nudge(m.clientId, 'family-changed', { familyId: scope.familyId });
      }
    } catch { /* telling the managers must never lose the request */ }
    return { pending: true, approvalId: row.id, title: row.title, amount };
  }

  async getSettings(clientId: string, familyId: string) {
    const m = await this.access.requireMember(clientId, familyId);
    const f = await this.prisma.family.findUnique({ where: { id: familyId } });
    return { threshold: f?.approvalThreshold == null ? null : Number(f.approvalThreshold), canManage: m.role === 'OWNER', canDecide: m.role === 'OWNER' || m.role === 'ADMIN' };
  }

  async setSettings(clientId: string, familyId: string, dto: { threshold?: unknown }) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'approval.manage');
    let threshold: number | null = null;
    if (dto.threshold !== null && dto.threshold !== undefined && dto.threshold !== '') {
      threshold = round2(Number(dto.threshold));
      if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 999_999_999) throw errors.invalid('Enter an amount greater than zero, or switch approvals off');
    }
    await this.prisma.family.update({ where: { id: familyId }, data: { approvalThreshold: threshold } });
    await recordActivity(this.prisma as never, { kind: 'family', clientId, familyId } as never, { kind: 'family.approval_threshold', entity: 'family', entityId: familyId, title: 'approvals', amount: threshold });
    return this.getSettings(clientId, familyId);
  }

  /** Owners and admins see every request; a member sees only their own. */
  async list(clientId: string, familyId: string, status?: string) {
    const m = await this.access.requireMember(clientId, familyId);
    const decide = m.role === 'OWNER' || m.role === 'ADMIN';
    const rows = (await this.prisma.familyApproval.findMany({ where: { familyId }, orderBy: { createdAt: 'desc' }, take: 200 }))
      .filter(r => (decide || r.requestedById === clientId) && (!status || r.status === status));
    const names = await this.namesOf(rows.flatMap(r => [r.requestedById, r.decidedById].filter((x): x is string => !!x)));
    return { canDecide: decide, items: rows.map(r => this.shape(r, names)) };
  }

  private async pending(familyId: string, id: string) {
    const r = await this.prisma.familyApproval.findFirst({ where: { id, familyId } });
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'PENDING') throw new ConflictException('This request was already decided.');
    return r;
  }

  /** Adds the expense as it was asked for, in the member's name, and tells them. Two people approving at once: only one wins. */
  async approve(clientId: string, familyId: string, id: string) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'approval.decide');
    const r = await this.pending(familyId, id);
    const member = await this.prisma.familyMember.findFirst({ where: { familyId, clientId: r.requestedById, status: 'ACTIVE' }, select: { role: true } });
    if (!member) throw new ConflictException('That member has left the family, so this cannot be added.');
    const scope: FamilyScope = { kind: 'family', clientId: r.requestedById, familyId, role: member.role as FamilyScope['role'], currency: m.family.currency, timezone: m.family.timezone };
    const created = await retryOnConflict(() => this.prisma.$transaction(async prx => {
      const claimed = await prx.familyApproval.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', decidedById: clientId, decidedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictException('This request was already decided.');
      const tx = await this.transactions.createInTx(prx, scope, r.snapshot as unknown as CreateTransactionDto);
      await prx.familyApproval.update({ where: { id }, data: { transactionId: tx.id } });
      return tx;
    }));
    this.notifications?.notify(r.requestedById, 'Approved', `Your expense "${r.title}" was approved and added.`, 'transaction', { familyId, transactionId: created.id });
    this.notifications?.nudge(r.requestedById, 'family-changed', { familyId });
    this.transactions.notifyFamilyCreated(scope, created).catch(() => {});
    return { success: true, transactionId: created.id };
  }

  async reject(clientId: string, familyId: string, id: string, dto: { reason?: unknown }) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'approval.decide');
    const r = await this.pending(familyId, id);
    const reason = typeof dto.reason === 'string' && dto.reason.trim() ? dto.reason.trim().slice(0, 200) : null;
    const done = await this.prisma.familyApproval.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', decidedById: clientId, decidedAt: new Date(), reason } });
    if (done.count !== 1) throw new ConflictException('This request was already decided.');
    await recordActivity(this.prisma as never, { kind: 'family', clientId, familyId } as never, { kind: 'family.approval_rejected', entity: 'family', entityId: id, title: r.title, amount: Number(r.amount) });
    this.notifications?.notify(r.requestedById, 'Not approved', reason ? `"${r.title}": ${reason}` : `Your expense "${r.title}" was not approved.`, 'transaction', { familyId });
    this.notifications?.nudge(r.requestedById, 'family-changed', { familyId });
    return { success: true };
  }

  /** The member takes their own request back. */
  async cancel(clientId: string, familyId: string, id: string) {
    await this.access.requireMember(clientId, familyId);
    const r = await this.pending(familyId, id);
    if (r.requestedById !== clientId) throw errors.forbidden();
    await this.prisma.familyApproval.delete({ where: { id } });
    return { success: true };
  }
}
