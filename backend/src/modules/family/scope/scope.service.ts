import { Injectable } from '@nestjs/common';
import { FamilyAccessService } from '../family-access.service';
import { errors } from '../family-errors';
import { Scope, parseFamilyHeader, personalScope } from './scope';

@Injectable()
export class ScopeService {
  constructor(private readonly access: FamilyAccessService) {}

  /**
   * No header means Personal. With a header, the person must be an ACTIVE member of that family right now (read from
   * the database, never from the login token). A family that does not exist, is archived, or has not got this person
   * all answer the same "not a member", so the answer never confirms that a family id exists.
   */
  async resolve(clientId: string, headerValue: unknown): Promise<Scope> {
    const familyId = parseFamilyHeader(headerValue);
    if (!familyId) return personalScope(clientId);
    const m = await this.access.membershipOf(clientId);
    if (!m || m.familyId !== familyId) throw errors.notAMember();
    return { kind: 'family', clientId, familyId, role: m.role, currency: m.family.currency, timezone: m.family.timezone };
  }
}
