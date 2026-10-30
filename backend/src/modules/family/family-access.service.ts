import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FamilyAction, FamilyRoleName, can } from './family-permissions';
import { activeKeyOf, errors } from './family-errors';

export interface Membership {
  memberId: string;
  clientId: string;
  familyId: string;
  role: FamilyRoleName;
  family: { id: string; name: string; currency: string; timezone: string };
}

/**
 * Who is in which family, always read from the database. A login token proves who someone is, never what they may
 * do inside a family, so a removed member is refused on their very next request even though their token still works.
 */
@Injectable()
export class FamilyAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private async build(member: any, clientId: string, db: any): Promise<Membership | null> {
    if (!member || member.status !== 'ACTIVE') return null;
    const family = await db.family.findUnique({ where: { id: member.familyId } });
    if (!family || family.status !== 'ACTIVE') return null;
    return {
      memberId: member.id, clientId, familyId: family.id, role: member.role as FamilyRoleName,
      family: { id: family.id, name: family.name, currency: family.currency, timezone: family.timezone },
    };
  }

  /** The person's membership in exactly this family, or null. `db` lets a caller read inside its own transaction. */
  async membershipIn(clientId: string, familyId: string, db: any = this.prisma): Promise<Membership | null> {
    // activeKey is "person:family" while the membership is active, so this is a single unique lookup.
    const member = await db.familyMember.findUnique({ where: { activeKey: activeKeyOf(clientId, familyId) } });
    return this.build(member, clientId, db);
  }

  /** Every family the person is in right now, the one they joined first at the top. */
  async membershipsOf(clientId: string, db: any = this.prisma): Promise<Membership[]> {
    const rows = await db.familyMember.findMany({ where: { clientId, status: 'ACTIVE' }, orderBy: { joinedAt: 'asc' } });
    const out: Membership[] = [];
    for (const r of rows) { const m = await this.build(r, clientId, db); if (m) out.push(m); }
    return out;
  }

  /** The person's first family, or null (what an older app that knows only one family still asks for). */
  async membershipOf(clientId: string, db: any = this.prisma): Promise<Membership | null> {
    return (await this.membershipsOf(clientId, db))[0] ?? null;
  }

  /**
   * The caller must be an active member of exactly this family. Anyone else gets "not found", so the answer never
   * reveals whether a family with that id exists.
   */
  async requireMember(clientId: string, familyId: string, db: any = this.prisma): Promise<Membership> {
    const m = await this.membershipIn(clientId, familyId, db);
    if (!m) throw errors.notFound();
    return m;
  }

  assertCan(m: Membership, action: FamilyAction): void {
    if (!can(m.role, action)) throw errors.forbidden();
  }
}
