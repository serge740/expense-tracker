import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FamilyAccessService } from './family-access.service';
import { FamilyService, displayName } from './family.service';
import { FamilyRoleName, INVITABLE_ROLES, canInviteAs } from './family-permissions';
import { hashToken, newInviteCode, newInviteToken, normaliseCode, normaliseToken } from './family-codes';
import { LIMITS, errors, isUniqueViolation } from './family-errors';

/**
 * Remembers who has been typing wrong codes. Ten wrong ones within a day lock that person out for 15 minutes.
 * It lives in memory (the app runs as one instance); the route-level throttle still applies on top of it.
 */
export class InviteAttemptLimiter {
  private fails = new Map<string, number[]>();
  private lockedUntil = new Map<string, number>();
  constructor(private readonly now: () => number = () => Date.now(), private readonly maxFails = 10, private readonly lockMs = 15 * 60_000, private readonly windowMs = 24 * 3_600_000) {}

  isLocked(id: string): boolean {
    const until = this.lockedUntil.get(id);
    if (until === undefined) return false;
    if (until > this.now()) return true;
    this.lockedUntil.delete(id);
    this.fails.delete(id);
    return false;
  }

  recordFailure(id: string): void {
    const t = this.now();
    const recent = (this.fails.get(id) ?? []).filter(x => t - x < this.windowMs);
    recent.push(t);
    this.fails.set(id, recent);
    if (recent.length >= this.maxFails) this.lockedUntil.set(id, t + this.lockMs);
  }

  clear(id: string): void { this.fails.delete(id); this.lockedUntil.delete(id); }
}

export interface InviteLookup { token?: unknown; code?: unknown }
export interface CreateInviteInput { role: unknown; phone?: unknown; email?: unknown }

const normPhone = (p: string) => p.replace(/[^\d+]/g, '');
const normEmail = (e: string) => e.trim().toLowerCase();

@Injectable()
export class FamilyInvitesService {
  readonly limiter = new InviteAttemptLimiter();
  /** Replaceable in tests so expiry can be checked without waiting. */
  now: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FamilyAccessService,
    private readonly families: FamilyService,
  ) {}

  private baseUrl() { return (process.env.PUBLIC_APP_URL || process.env.APP_URL || 'https://aby-expense.onrender.com').replace(/\/$/, ''); }

  async create(actorId: string, familyId: string, input: CreateInviteInput) {
    const m = await this.access.requireMember(actorId, familyId);
    const role = input?.role as FamilyRoleName;
    if (!INVITABLE_ROLES.includes(role)) throw errors.invalidRole();       // OWNER, or not a role at all
    if (!canInviteAs(m.role, role)) throw errors.forbidden();               // this role may not invite, or an Admin tried to make an Admin
    const phone = input?.phone ? this.cleanPhone(input.phone) : null;
    const email = input?.email ? this.cleanEmail(input.email) : null;
    const now = this.now();
    const expiresAt = new Date(now.getTime() + LIMITS.inviteDays * 86_400_000);

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newInviteCode(), token = newInviteToken();
      try {
        const invite = await this.prisma.$transaction(async (tx: any) => {
          const pending = await tx.familyInvite.count({ where: { familyId, status: 'PENDING', expiresAt: { gt: now } } });
          if (pending >= LIMITS.maxPendingInvites) throw errors.tooManyInvites();
          const active = await tx.familyMember.count({ where: { familyId, status: 'ACTIVE' } });
          if (active + pending >= LIMITS.maxMembers) throw errors.full();
          const row = await tx.familyInvite.create({ data: { familyId, invitedBy: actorId, role, tokenHash: hashToken(token), code, phone, email, expiresAt } });
          await this.families.log(tx, familyId, actorId, 'invite.created', row.id, { role });
          return row;
        });
        // The token is shown only now; afterwards only its hash exists.
        return { id: invite.id, code, token, link: `${this.baseUrl()}/join/${token}`, role, expiresAt, phone, email };
      } catch (e) {
        if (isUniqueViolation(e)) continue;      // a one-in-a-billion code clash: draw again
        throw e;
      }
    }
    throw errors.invalid('Could not make an invite, try again');
  }

  async list(actorId: string, familyId: string) {
    const m = await this.access.requireMember(actorId, familyId);
    this.access.assertCan(m, 'invite.list');
    const rows = await this.prisma.familyInvite.findMany({ where: { familyId, status: 'PENDING', expiresAt: { gt: this.now() } }, orderBy: { createdAt: 'desc' } });
    return rows.map((r: any) => ({ id: r.id, code: r.code, role: r.role, phone: r.phone, email: r.email, invitedBy: r.invitedBy, createdAt: r.createdAt, expiresAt: r.expiresAt }));
  }

  async revoke(actorId: string, familyId: string, inviteId: string) {
    const m = await this.access.requireMember(actorId, familyId);
    this.access.assertCan(m, 'invite.revoke');
    return this.prisma.$transaction(async (tx: any) => {
      const res = await tx.familyInvite.updateMany({ where: { id: inviteId, familyId, status: 'PENDING' }, data: { status: 'REVOKED' } });
      if (res.count !== 1) throw errors.inviteNotFound();
      await this.families.log(tx, familyId, actorId, 'invite.revoked', inviteId);
      return { success: true };
    });
  }

  async revokeAll(actorId: string, familyId: string) {
    const m = await this.access.requireMember(actorId, familyId);
    this.access.assertCan(m, 'invite.revoke');
    return this.prisma.$transaction(async (tx: any) => {
      const res = await tx.familyInvite.updateMany({ where: { familyId, status: 'PENDING' }, data: { status: 'REVOKED' } });
      await this.families.log(tx, familyId, actorId, 'invite.revoked_all', undefined, { count: res.count });
      return { revoked: res.count };
    });
  }

  /** Shows what joining would mean, without joining. Same checks as accepting. */
  async preview(clientId: string, lookup: InviteLookup) {
    const { invite, family, inviter } = await this.check(clientId, lookup, this.prisma);
    return { family: { id: family.id, name: family.name }, invitedBy: displayName(inviter), role: invite.role, expiresAt: invite.expiresAt };
  }

  async accept(clientId: string, lookup: InviteLookup) {
    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const { invite, family } = await this.check(clientId, lookup, tx);
        const now = this.now();
        // The single-use guarantee: only one request can flip PENDING to ACCEPTED.
        const won = await tx.familyInvite.updateMany({
          where: { id: invite.id, status: 'PENDING', expiresAt: { gt: now } },
          data: { status: 'ACCEPTED', acceptedBy: clientId, acceptedAt: now },
        });
        if (won.count !== 1) throw errors.inviteInvalid();

        // A person who left or was removed earlier keeps their row, so it is reactivated instead of duplicated.
        const existing = await tx.familyMember.findUnique({ where: { familyId_clientId: { familyId: family.id, clientId } } });
        if (existing) {
          await tx.familyMember.update({ where: { id: existing.id }, data: { role: invite.role, status: 'ACTIVE', activeKey: clientId, leftAt: null, joinedAt: now } });
        } else {
          await tx.familyMember.create({ data: { familyId: family.id, clientId, role: invite.role, status: 'ACTIVE', activeKey: clientId } });
        }
        await this.families.log(tx, family.id, clientId, 'member.joined', clientId, { role: invite.role, invitedBy: invite.invitedBy });
        this.limiter.clear(clientId);
        return { family: { id: family.id, name: family.name, currency: family.currency }, role: invite.role as FamilyRoleName };
      });
    } catch (e) {
      // Another family claimed this person at the same moment: the unique activeKey says so.
      if (isUniqueViolation(e)) throw errors.alreadyInFamily();
      throw e;
    }
  }

  /** Every rule about whether this person may use this invite right now. Throws the matching error. */
  private async check(clientId: string, lookup: InviteLookup, db: any) {
    if (this.limiter.isLocked(clientId)) throw errors.tooManyAttempts();
    // Joining needs no email or phone verification (only an active account). An invite made for one specific email or
    // phone still checks that identity below.
    const client = await this.families.assertVerified(clientId, db, { requireVerified: false });

    const token = normaliseToken(lookup?.token);
    const code = normaliseCode(lookup?.code);
    const invite = token
      ? await db.familyInvite.findUnique({ where: { tokenHash: hashToken(token) } })
      : code ? await db.familyInvite.findUnique({ where: { code } }) : null;
    if (!invite) { this.limiter.recordFailure(clientId); throw errors.inviteNotFound(); }

    const now = this.now();
    if (invite.status === 'PENDING' && invite.expiresAt <= now) {
      await db.familyInvite.updateMany({ where: { id: invite.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      throw errors.inviteExpired();
    }
    if (invite.status === 'EXPIRED') throw errors.inviteExpired();
    if (invite.status !== 'PENDING') throw errors.inviteInvalid();       // revoked or already used look the same on purpose

    const family = await db.family.findUnique({ where: { id: invite.familyId } });
    if (!family || family.status !== 'ACTIVE') throw errors.gone();

    if (invite.phone || invite.email) {
      const phoneOk = !!invite.phone && !!client.phoneVerifiedAt && normPhone(client.phone ?? '') === normPhone(invite.phone);
      const emailOk = !!invite.email && !!client.emailVerifiedAt && normEmail(client.email ?? '') === normEmail(invite.email);
      if (!phoneOk && !emailOk) throw errors.inviteForOther();
    }

    const current = await this.access.membershipOf(clientId, db);
    if (current) throw current.familyId === family.id ? errors.alreadyMember() : errors.alreadyInFamily();

    const active = await db.familyMember.count({ where: { familyId: family.id, status: 'ACTIVE' } });
    if (active >= LIMITS.maxMembers) throw errors.full();

    const inviterRow = await db.client.findUnique({ where: { id: invite.invitedBy } });
    return { invite, family, inviter: inviterRow };
  }

  private cleanPhone(raw: unknown): string {
    const p = typeof raw === 'string' ? normPhone(raw) : '';
    if (p.replace(/\D/g, '').length < 7 || p.length > 20) throw errors.invalid('That phone number is not valid');
    return p;
  }
  private cleanEmail(raw: unknown): string {
    const e = typeof raw === 'string' ? normEmail(raw) : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 190) throw errors.invalid('That email is not valid');
    return e;
  }
}
