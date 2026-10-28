import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FamilyAction, FamilyRoleName, can } from './family-permissions';
import { errors } from './family-errors';

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

  /** The person's current family, or null. `db` lets a caller read inside its own transaction. */
  async membershipOf(clientId: string, db: any = this.prisma): Promise<Membership | null> {
    // activeKey is the client id while the membership is active, so this is a single unique lookup.
    const member = await db.familyMember.findUnique({ where: { activeKey: clientId } });
    if (!member || member.status !== 'ACTIVE') return null;
    const family = await db.family.findUnique({ where: { id: member.familyId } });
    if (!family || family.status !== 'ACTIVE') return null;
    return {
      memberId: member.id, clientId, familyId: family.id, role: member.role as FamilyRoleName,
      family: { id: family.id, name: family.name, currency: family.currency, timezone: family.timezone },
    };
  }

  /**
   * The caller must be an active member of exactly this family. Anyone else gets "not found", so the answer never
   * reveals whether a family with that id exists.
   */
  async requireMember(clientId: string, familyId: string, db: any = this.prisma): Promise<Membership> {
    const m = await this.membershipOf(clientId, db);
    if (!m || m.familyId !== familyId) throw errors.notFound();
    return m;
  }

  assertCan(m: Membership, action: FamilyAction): void {
    if (!can(m.role, action)) throw errors.forbidden();
  }
}
