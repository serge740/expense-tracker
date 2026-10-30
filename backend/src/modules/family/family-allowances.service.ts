import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FamilyAccessService } from './family-access.service';
import { errors } from './family-errors';
import { NO_DEBT_FLOWS } from '../../common/utils/loan-filter';
import { recordActivity } from '../activity/activity';

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthRange = (now: Date) => ({ gte: new Date(now.getFullYear(), now.getMonth(), 1), lt: new Date(now.getFullYear(), now.getMonth() + 1, 1) });

export interface AllowanceStatus { limit: number; spent: number; left: number; percent: number; over: boolean }

/** What a member may spend from the family in a month. It warns; it never blocks (blocking is what Approvals are for). */
@Injectable()
export class FamilyAllowancesService {
  constructor(private readonly prisma: PrismaService, private readonly access: FamilyAccessService) {}

  /** What this member has spent from the family this month (loan flows are not spending). */
  async spentThisMonth(familyId: string, clientId: string, now = new Date()): Promise<number> {
    const agg = await this.prisma.transaction.aggregate({
      where: { familyId, clientId, type: 'EXPENSE', date: monthRange(now), ...NO_DEBT_FLOWS },
      _sum: { amount: true },
    });
    return round2(Number(agg._sum.amount ?? 0));
  }

  status(limit: number, spent: number): AllowanceStatus {
    return { limit, spent, left: round2(limit - spent), percent: limit > 0 ? Math.floor((spent / limit) * 100) : 0, over: spent > limit };
  }

  /** The caller's own allowance, or null when none is set. */
  async mine(clientId: string, familyId: string, now = new Date()): Promise<AllowanceStatus | null> {
    await this.access.requireMember(clientId, familyId);
    const a = await this.prisma.familyAllowance.findFirst({ where: { familyId, clientId } });
    return a ? this.status(Number(a.monthlyLimit), await this.spentThisMonth(familyId, clientId, now)) : null;
  }

  /** Owners and admins see every member with the limit (if any) and this month's spending; everyone else sees only themselves. */
  async list(clientId: string, familyId: string, now = new Date()) {
    const m = await this.access.requireMember(clientId, familyId);
    const manage = m.role === 'OWNER' || m.role === 'ADMIN';
    const members = await this.prisma.familyMember.findMany({ where: { familyId, status: 'ACTIVE' }, select: { clientId: true, role: true } });
    const rows = manage ? members : members.filter(x => x.clientId === clientId);
    const limits = await this.prisma.familyAllowance.findMany({ where: { familyId } });
    const people = rows.length ? await this.prisma.client.findMany({ where: { id: { in: rows.map(r => r.clientId) } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const name = new Map(people.map(p => [p.id, `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Member']));
    const items: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const lim = limits.find(l => l.clientId === r.clientId);
      const spent = await this.spentThisMonth(familyId, r.clientId, now);
      items.push({ clientId: r.clientId, name: name.get(r.clientId) ?? 'Member', role: r.role, isYou: r.clientId === clientId, ...(lim ? this.status(Number(lim.monthlyLimit), spent) : { limit: null, spent, left: null, percent: 0, over: false }) });
    }
    return { canManage: manage, items };
  }

  async set(clientId: string, familyId: string, memberId: string, dto: { limit?: unknown }) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'allowance.manage');
    const target = await this.prisma.familyMember.findFirst({ where: { familyId, clientId: memberId, status: 'ACTIVE' }, select: { clientId: true } });
    if (!target) throw errors.memberNotFound();
    const limit = round2(Number(dto.limit));
    if (!Number.isFinite(limit) || limit <= 0 || limit > 999_999_999) throw errors.invalid('Enter a monthly limit greater than zero');
    const existing = await this.prisma.familyAllowance.findFirst({ where: { familyId, clientId: memberId } });
    if (existing) await this.prisma.familyAllowance.update({ where: { id: existing.id }, data: { monthlyLimit: limit } });
    else await this.prisma.familyAllowance.create({ data: { familyId, clientId: memberId, monthlyLimit: limit } });
    await recordActivity(this.prisma as never, { kind: 'family', clientId, familyId } as never, { kind: 'family.allowance_set', entity: 'family', entityId: memberId, title: 'allowance', amount: limit,
      changes: existing ? [{ field: 'limit', from: Number(existing.monthlyLimit), to: limit }] : undefined });
    return this.list(clientId, familyId);
  }

  async remove(clientId: string, familyId: string, memberId: string) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'allowance.manage');
    const existing = await this.prisma.familyAllowance.findFirst({ where: { familyId, clientId: memberId } });
    if (existing) await this.prisma.familyAllowance.delete({ where: { id: existing.id } });
    return this.list(clientId, familyId);
  }
}
