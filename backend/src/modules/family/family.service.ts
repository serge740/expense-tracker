import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { recordActivity } from '../activity/activity';
import { PrismaService } from '../../prisma/prisma.service';
import { FamilyAccessService, Membership } from './family-access.service';
import { FamilyRoleName, canRemove } from './family-permissions';
import { LIMITS, activeKeyOf, errors, isUniqueViolation } from './family-errors';

export interface CreateFamilyInput { name: string; currency?: string; timezone?: string }
export interface UpdateFamilyInput { name?: string; currency?: string; timezone?: string }

const GIVABLE_ROLES: FamilyRoleName[] = ['ADMIN', 'MEMBER', 'VIEWER'];

export function validTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

const cleanName = (raw: unknown): string => {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 60) throw errors.invalid('The family name must be 1 to 60 characters');
  return name;
};
const cleanCurrency = (raw: unknown): string => {
  const c = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(c)) throw errors.invalid('The currency must be a 3-letter code');
  return c;
};
const cleanZone = (raw: unknown): string => {
  if (typeof raw !== 'string' || !validTimezone(raw)) throw errors.invalid('That time zone is not valid');
  return raw;
};

export const displayName = (c: { firstName?: string | null; lastName?: string | null } | undefined | null): string =>
  [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() || 'Former member';

export const ARCHIVE_DAYS = 30;

@Injectable()
export class FamilyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('FamilyService');
  private purgeTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService, private readonly access: FamilyAccessService) {}

  /** Writes one line of the family's history. Always called inside the same transaction as the change it records. */
  async log(db: any, familyId: string, actorId: string, action: string, targetId?: string, meta?: Record<string, unknown>) {
    await db.familyActivity.create({ data: { familyId, actorId, action, targetId: targetId ?? null, meta: meta ?? null } });
    // The same line also goes into the Activity timeline everyone in the family can read.
    const m = (meta ?? {}) as Record<string, unknown>;
    await recordActivity(db, { kind: 'family', clientId: actorId, familyId } as never, { kind: `family.${action}`, entity: 'family', entityId: targetId ?? familyId, title: String(m.name ?? action.replace(/[._]/g, ' ')),
      changes: m.from !== undefined || m.to !== undefined ? [{ field: 'role', from: String(m.from ?? ''), to: String(m.to ?? '') }] : undefined });
  }

  /** A person may make or join a family only with a verified email or phone (stops throwaway accounts). */
  async assertVerified(clientId: string, db: any = this.prisma, opts: { requireVerified?: boolean } = {}) {
    const c = await db.client.findUnique({ where: { id: clientId } });
    if (!c || c.isActive === false || (opts.requireVerified !== false && !c.emailVerifiedAt && !c.phoneVerifiedAt)) throw errors.notVerified();
    return c;
  }

  async create(clientId: string, input: CreateFamilyInput) {
    const name = cleanName(input?.name);
    const currency = input?.currency === undefined ? 'RWF' : cleanCurrency(input.currency);
    const timezone = input?.timezone === undefined ? 'UTC' : cleanZone(input.timezone);
    // Creating a family needs no verification (it was only friction); joining still does.
    await this.assertVerified(clientId, this.prisma, { requireVerified: false });
    if ((await this.access.membershipsOf(clientId)).length >= LIMITS.maxFamilies) throw errors.tooManyFamilies();
    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const family = await tx.family.create({ data: { name, currency, timezone, createdBy: clientId } });
        await tx.familyMember.create({ data: { familyId: family.id, clientId, role: 'OWNER', status: 'ACTIVE', activeKey: activeKeyOf(clientId, family.id) } });
        await this.log(tx, family.id, clientId, 'family.created', family.id, { name });
        return { family: this.publicFamily(family), role: 'OWNER' as const };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw errors.alreadyMember();
      throw e;
    }
  }

  private publicFamily(f: any) { return { id: f.id, name: f.name, currency: f.currency, timezone: f.timezone, createdAt: f.createdAt }; }

  /** The person's family and role, or null. Also what the apps show on the switcher. */
  async mine(clientId: string) {
    const all = await this.access.membershipsOf(clientId);
    if (!all.length) return null;
    const rows: Array<{ family: typeof all[number]['family']; role: typeof all[number]['role']; memberCount: number; limits: typeof LIMITS }> = [];
    for (const m of all) {
      const memberCount = await this.prisma.familyMember.count({ where: { familyId: m.familyId, status: 'ACTIVE' } });
      rows.push({ family: m.family, role: m.role, memberCount, limits: { ...LIMITS } });
    }
    // The first one keeps the old shape (an app that knows one family reads it); `families` lists them all.
    return { ...rows[0], families: rows };
  }

  async update(clientId: string, familyId: string, input: UpdateFamilyInput) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'family.rename');
    const data: Record<string, unknown> = {};
    if (input?.name !== undefined) data.name = cleanName(input.name);
    if (input?.currency !== undefined) data.currency = cleanCurrency(input.currency);
    if (input?.timezone !== undefined) data.timezone = cleanZone(input.timezone);
    if (!Object.keys(data).length) throw errors.invalid('Nothing to change');
    const currencyChanged = data.currency !== undefined && data.currency !== m.family.currency;
    const family = await this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.family.update({ where: { id: familyId }, data });
      await this.log(tx, familyId, clientId, 'family.updated', familyId, { fields: Object.keys(data) });
      return updated;
    });
    // Changing the reporting currency never rewrites a stored amount; the app warns about it.
    return { family: this.publicFamily(family), currencyChanged, amountsUnchanged: currencyChanged };
  }

  onModuleInit() {
    // Once an hour (and once at start-up) the families archived more than 30 days ago are removed for good.
    const run = () => this.purgeArchived().catch(e => this.logger.warn(`purge failed: ${e?.message ?? e}`));
    void run();
    this.purgeTimer = setInterval(run, 3_600_000);
    this.purgeTimer.unref?.();
  }
  onModuleDestroy() { if (this.purgeTimer) clearInterval(this.purgeTimer); }

  /**
   * Removes families archived more than ${ARCHIVE_DAYS} days ago with everything that belongs to them (wallets, transactions, budgets,
   * trash, activity, members and invites go with them). Returns how many families were removed.
   */
  async purgeArchived(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ARCHIVE_DAYS * 86_400_000);
    const old = await this.prisma.family.findMany({ where: { status: 'ARCHIVED', archivedAt: { lt: cutoff } }, select: { id: true } });
    for (const f of old) await this.prisma.family.delete({ where: { id: f.id } });
    return old.length;
  }

  /** Archives the family: everyone drops back to Personal, pending invites stop working, the data is kept for 30 days. */
  async archive(clientId: string, familyId: string, confirmName: unknown) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'family.delete');
    if (typeof confirmName !== 'string' || confirmName.trim().toLowerCase() !== m.family.name.trim().toLowerCase()) throw errors.confirmName();
    const now = new Date();
    await this.prisma.$transaction(async (tx: any) => {
      await tx.family.update({ where: { id: familyId }, data: { status: 'ARCHIVED', archivedAt: now } });
      await tx.familyMember.updateMany({ where: { familyId, status: 'ACTIVE' }, data: { status: 'REMOVED', activeKey: null, leftAt: now } });
      await tx.familyInvite.updateMany({ where: { familyId, status: 'PENDING' }, data: { status: 'REVOKED' } });
      await this.log(tx, familyId, clientId, 'family.archived', familyId);
    });
    return { success: true };
  }

  /** Name, nickname and role only. Email and phone are never shown to other members. */
  async members(clientId: string, familyId: string) {
    await this.access.requireMember(clientId, familyId);
    const rows = await this.prisma.familyMember.findMany({ where: { familyId, status: 'ACTIVE' }, orderBy: { joinedAt: 'asc' } });
    const clients = await this.prisma.client.findMany({ where: { id: { in: rows.map((r: any) => r.clientId) } } });
    const byId = new Map<string, any>(clients.map((c: any) => [c.id, c]));
    return rows.map((r: any) => ({
      clientId: r.clientId, role: r.role, nickname: r.nickname,
      name: r.nickname || displayName(byId.get(r.clientId)),
      profileImage: byId.get(r.clientId)?.profileImage ?? null,
      joinedAt: r.joinedAt, isYou: r.clientId === clientId,
    }));
  }

  async setRole(actorId: string, familyId: string, targetClientId: string, role: unknown) {
    const m = await this.access.requireMember(actorId, familyId);
    this.access.assertCan(m, 'member.role.change');
    if (targetClientId === actorId) throw errors.ownRole();
    if (typeof role !== 'string' || !GIVABLE_ROLES.includes(role as FamilyRoleName)) throw errors.invalidRole();
    return this.prisma.$transaction(async (tx: any) => {
      const target = await tx.familyMember.findUnique({ where: { familyId_clientId: { familyId, clientId: targetClientId } } });
      if (!target || target.status !== 'ACTIVE') throw errors.memberNotFound();
      if (target.role === 'OWNER') throw errors.ownerLocked();
      await tx.familyMember.update({ where: { id: target.id }, data: { role } });
      await this.log(tx, familyId, actorId, 'member.role_changed', targetClientId, { from: target.role, to: role });
      return { clientId: targetClientId, role };
    });
  }

  /** Remove someone else, or leave (when the target is yourself). */
  async removeMember(actorId: string, familyId: string, targetClientId: string) {
    const m = await this.access.requireMember(actorId, familyId);
    if (targetClientId === actorId) return this.leave(m);
    return this.prisma.$transaction(async (tx: any) => {
      const target = await tx.familyMember.findUnique({ where: { familyId_clientId: { familyId, clientId: targetClientId } } });
      if (!target || target.status !== 'ACTIVE') throw errors.memberNotFound();
      if (target.role === 'OWNER') throw errors.ownerLocked();
      if (!canRemove(m.role, target.role as FamilyRoleName)) throw errors.forbidden();
      // Conditional on still being active, so two admins removing the same person cannot both "win".
      const res = await tx.familyMember.updateMany({
        where: { id: target.id, status: 'ACTIVE' }, data: { status: 'REMOVED', activeKey: null, leftAt: new Date() },
      });
      if (res.count !== 1) throw errors.memberNotFound();
      await this.log(tx, familyId, actorId, 'member.removed', targetClientId);
      return { success: true };
    });
  }

  private async leave(m: Membership) {
    if (m.role === 'OWNER') throw errors.ownerMustTransfer();
    this.access.assertCan(m, 'member.leave');
    return this.prisma.$transaction(async (tx: any) => {
      const res = await tx.familyMember.updateMany({
        where: { id: m.memberId, status: 'ACTIVE' }, data: { status: 'LEFT', activeKey: null, leftAt: new Date() },
      });
      if (res.count !== 1) throw errors.notFound();
      await this.log(tx, m.familyId, m.clientId, 'member.left', m.clientId);
      return { success: true };
    });
  }

  /** The owner hands the family to another active member and becomes an Admin. There is always exactly one Owner. */
  async transferOwnership(actorId: string, familyId: string, toClientId: unknown) {
    const m = await this.access.requireMember(actorId, familyId);
    this.access.assertCan(m, 'ownership.transfer');
    if (typeof toClientId !== 'string' || toClientId === actorId) throw errors.invalid('Choose another member');
    return this.prisma.$transaction(async (tx: any) => {
      const target = await tx.familyMember.findUnique({ where: { familyId_clientId: { familyId, clientId: toClientId } } });
      if (!target || target.status !== 'ACTIVE') throw errors.memberNotFound();
      const demoted = await tx.familyMember.updateMany({ where: { id: m.memberId, role: 'OWNER', status: 'ACTIVE' }, data: { role: 'ADMIN' } });
      if (demoted.count !== 1) throw errors.forbidden();
      await tx.familyMember.update({ where: { id: target.id }, data: { role: 'OWNER' } });
      await this.log(tx, familyId, actorId, 'ownership.transferred', toClientId);
      return { success: true, newOwner: toClientId };
    });
  }

  /** The family's history, newest first. `before` is the createdAt of the last row already shown. */
  async activity(clientId: string, familyId: string, opts: { limit?: number; before?: string } = {}) {
    const m = await this.access.requireMember(clientId, familyId);
    this.access.assertCan(m, 'activity.view');
    const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 50);
    const where: Record<string, unknown> = { familyId };
    if (opts.before) {
      const d = new Date(opts.before);
      if (Number.isNaN(d.getTime())) throw errors.invalid('Bad paging value');
      where.createdAt = { lt: d };
    }
    const rows = await this.prisma.familyActivity.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
    const ids = [...new Set(rows.flatMap((r: any) => [r.actorId, r.targetId].filter(Boolean)))] as string[];
    const people = await this.prisma.client.findMany({ where: { id: { in: ids } } });
    const nameOf = new Map<string, string>(people.map((c: any) => [c.id, displayName(c)]));
    return rows.map((r: any) => ({
      id: r.id, action: r.action, createdAt: r.createdAt, meta: r.meta,
      actor: { clientId: r.actorId, name: nameOf.get(r.actorId) ?? 'Former member' },
      target: r.targetId ? { clientId: r.targetId, name: nameOf.get(r.targetId) ?? null } : null,
    }));
  }
}
