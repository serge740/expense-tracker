import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FamilyAccessService } from './family-access.service';
import { errors } from './family-errors';
import { displayName } from './family.service';
import { recordActivity } from '../activity/activity';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);

export interface GoalInput { name?: unknown; target?: unknown; targetDate?: unknown; walletId?: unknown; archived?: unknown }

/** Savings targets the whole family works toward. Owners and admins set them up; members add to them. */
@Injectable()
export class FamilyGoalsService {
  constructor(private readonly prisma: PrismaService, private readonly access: FamilyAccessService) {}

  private nameOf(v: unknown) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s || s.length > 60) throw errors.invalid('Give the goal a name of up to 60 characters');
    return s;
  }
  private targetOf(v: unknown) {
    const n = round2(Number(v));
    if (!Number.isFinite(n) || n <= 0 || n > 999_999_999) throw errors.invalid('Enter a target greater than zero');
    return n;
  }
  private dateOf(v: unknown) {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) throw errors.invalid('Choose a valid date');
    return d;
  }
  /** The wallet must be one of this family's own: an id from the request is never trusted. */
  private async walletOf(familyId: string, v: unknown) {
    if (v === null || v === undefined || v === '') return null;
    const w = await this.prisma.wallet.findFirst({ where: { id: String(v), familyId }, select: { id: true } });
    if (!w) throw errors.walletNotFound();
    return w.id;
  }

  /** What a goal looks like to the app: how much is saved (contributions plus a linked wallet) and how far along it is. */
  private async shape(familyId: string, g: any, names?: Map<string, string>) {
    const contributed = round2((g.contributions ?? []).reduce((n: number, c: any) => n + num(c.amount), 0));
    const wallet = g.walletId ? await this.prisma.wallet.findFirst({ where: { id: g.walletId, familyId }, select: { id: true, name: true, balance: true, currency: true } }) : null;
    const fromWallet = wallet ? Math.max(0, round2(num(wallet.balance))) : 0;
    const saved = round2(contributed + fromWallet);
    const target = num(g.target);
    return {
      id: g.id, name: g.name, target, targetDate: g.targetDate, status: g.status, createdAt: g.createdAt,
      saved, fromContributions: contributed, fromWallet, percent: target > 0 ? Math.min(100, Math.floor((saved / target) * 100)) : 0, reached: saved >= target,
      wallet: wallet ? { id: wallet.id, name: wallet.name } : null,
      ...(names ? { contributions: (g.contributions ?? []).map((c: any) => ({ id: c.id, amount: num(c.amount), note: c.note, createdAt: c.createdAt, by: names.get(c.clientId) ?? 'Former member', clientId: c.clientId })) } : {}),
    };
  }

  /** Goals with what has been put toward each (read separately so one query never grows with the number of goals). */
  private async withContributions(goals: any[]) {
    const ids = goals.map(g => g.id);
    const rows = ids.length ? await this.prisma.familyGoalContribution.findMany({ where: { goalId: { in: ids } }, orderBy: { createdAt: 'desc' } }) : [];
    return goals.map(g => ({ ...g, contributions: rows.filter((c: any) => c.goalId === g.id) }));
  }

  async list(clientId: string, familyId: string) {
    await this.access.requireMember(clientId, familyId);
    const goals = (await this.prisma.familyGoal.findMany({ where: { familyId }, orderBy: { createdAt: 'desc' } })).filter(g => g.status !== 'ARCHIVED');
    return { items: await Promise.all((await this.withContributions(goals)).map(g => this.shape(familyId, g))) };
  }

  async get(clientId: string, familyId: string, goalId: string) {
    await this.access.requireMember(clientId, familyId);
    const found = await this.prisma.familyGoal.findFirst({ where: { id: goalId, familyId } });
    if (!found) throw new NotFoundException('Goal not found');
    const [g] = await this.withContributions([found]);
    const ids = [...new Set<string>(g.contributions.map((c: any) => c.clientId as string))];
    const people = ids.length ? await this.prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    return this.shape(familyId, g, new Map(people.map(p => [p.id, displayName(p)])));
  }

  async create(clientId: string, familyId: string, dto: GoalInput) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'goal.manage');
    const data = { familyId, name: this.nameOf(dto.name), target: this.targetOf(dto.target), targetDate: this.dateOf(dto.targetDate), walletId: await this.walletOf(familyId, dto.walletId), createdById: clientId };
    const created = await this.prisma.familyGoal.create({ data });
    const g = { ...created, contributions: [] as any[] };
    await recordActivity(this.prisma as never, { kind: 'family', clientId, familyId } as never, { kind: 'family.goal_created', entity: 'family', entityId: g.id, title: g.name, amount: num(g.target) });
    return this.shape(familyId, g);
  }

  async update(clientId: string, familyId: string, goalId: string, dto: GoalInput) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'goal.manage');
    const g = await this.prisma.familyGoal.findFirst({ where: { id: goalId, familyId } });
    if (!g) throw new NotFoundException('Goal not found');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = this.nameOf(dto.name);
    if (dto.target !== undefined) data.target = this.targetOf(dto.target);
    if (dto.targetDate !== undefined) data.targetDate = this.dateOf(dto.targetDate);
    if (dto.walletId !== undefined) data.walletId = await this.walletOf(familyId, dto.walletId);
    if (dto.archived !== undefined) data.status = dto.archived ? 'ARCHIVED' : 'ACTIVE';
    const next = await this.prisma.familyGoal.update({ where: { id: goalId }, data });
    const [withC] = await this.withContributions([next]);
    return this.shape(familyId, withC);
  }

  async remove(clientId: string, familyId: string, goalId: string) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'goal.manage');
    const g = await this.prisma.familyGoal.findFirst({ where: { id: goalId, familyId } });
    if (!g) throw new NotFoundException('Goal not found');
    await this.prisma.familyGoal.delete({ where: { id: goalId } });
    return { success: true };
  }

  /** Adds an amount toward the goal. It is a record of what the family set aside; no wallet balance moves. */
  async contribute(clientId: string, familyId: string, goalId: string, dto: { amount?: unknown; note?: unknown }) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'goal.contribute');
    const g = await this.prisma.familyGoal.findFirst({ where: { id: goalId, familyId } });
    if (!g || g.status !== 'ACTIVE') throw new NotFoundException('Goal not found');
    const amount = round2(Number(dto.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999_999) throw errors.invalid('Enter an amount greater than zero');
    const note = typeof dto.note === 'string' && dto.note.trim() ? dto.note.trim().slice(0, 120) : null;
    await this.prisma.familyGoalContribution.create({ data: { goalId, clientId, amount, note } });
    await recordActivity(this.prisma as never, { kind: 'family', clientId, familyId } as never, { kind: 'family.goal_contribution', entity: 'family', entityId: goalId, title: g.name, amount });
    return this.get(clientId, familyId, goalId);
  }

  /** A contribution can be taken back by whoever made it, or by an owner or admin. */
  async removeContribution(clientId: string, familyId: string, goalId: string, contributionId: string) {
    const m = await this.access.requireMember(clientId, familyId);
    const g = await this.prisma.familyGoal.findFirst({ where: { id: goalId, familyId }, select: { id: true } });
    const c = g ? await this.prisma.familyGoalContribution.findFirst({ where: { id: contributionId, goalId } }) : null;
    if (!g || !c) throw new NotFoundException('Contribution not found');
    if (c.clientId !== clientId) this.access.assertCan(m, 'goal.manage');
    await this.prisma.familyGoalContribution.delete({ where: { id: contributionId } });
    return this.get(clientId, familyId, goalId);
  }
}
