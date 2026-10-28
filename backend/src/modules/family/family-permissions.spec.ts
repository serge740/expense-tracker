import { FAMILY_ACTIONS, FamilyAction, FamilyRoleName, INVITABLE_ROLES, can, canInviteAs, canRemove } from './family-permissions';

const ROLES: FamilyRoleName[] = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];

// The matrix from section 7 of design/family-portal.md, written out by hand so a typo in the table cannot hide itself.
const EXPECTED: Record<FamilyAction, FamilyRoleName[]> = {
  'family.view': ROLES, 'member.list': ROLES, 'activity.view': ROLES,
  'invite.create': ['OWNER', 'ADMIN'], 'invite.create.admin': ['OWNER'], 'invite.list': ['OWNER', 'ADMIN'], 'invite.revoke': ['OWNER', 'ADMIN'],
  'member.remove.lowerRoles': ['OWNER', 'ADMIN'], 'member.remove.any': ['OWNER'], 'member.role.change': ['OWNER'],
  'family.rename': ['OWNER'], 'family.delete': ['OWNER'], 'ownership.transfer': ['OWNER'],
  'member.leave': ['ADMIN', 'MEMBER', 'VIEWER'],
  'tx.add': ['OWNER', 'ADMIN', 'MEMBER'], 'tx.edit.own': ['OWNER', 'ADMIN', 'MEMBER'], 'tx.edit.other': ['OWNER', 'ADMIN'],
  'wallet.manage': ['OWNER', 'ADMIN'], 'wallet.delete': ['OWNER'], 'budget.set': ['OWNER', 'ADMIN'],
};

const actionCases: [FamilyAction][] = FAMILY_ACTIONS.map(a => [a]);
const roleCases: [FamilyRoleName][] = ROLES.map(r => [r]);

describe('family permissions', () => {
  test('the expected matrix lists every action', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...FAMILY_ACTIONS].sort());
  });

  describe.each(actionCases)('%s', action => {
    test.each(roleCases)('%s', role => {
      expect(can(role, action)).toBe(EXPECTED[action].includes(role));
    });
  });

  test('a person with no role can do nothing', () => {
    for (const a of FAMILY_ACTIONS) { expect(can(null, a)).toBe(false); expect(can(undefined, a)).toBe(false); }
  });

  describe('removing someone', () => {
    test('the Owner can remove any non-owner and never another owner', () => {
      expect(canRemove('OWNER', 'ADMIN')).toBe(true);
      expect(canRemove('OWNER', 'MEMBER')).toBe(true);
      expect(canRemove('OWNER', 'VIEWER')).toBe(true);
      expect(canRemove('OWNER', 'OWNER')).toBe(false);
    });
    test('an Admin removes Members and Viewers only', () => {
      expect(canRemove('ADMIN', 'MEMBER')).toBe(true);
      expect(canRemove('ADMIN', 'VIEWER')).toBe(true);
      expect(canRemove('ADMIN', 'ADMIN')).toBe(false);
      expect(canRemove('ADMIN', 'OWNER')).toBe(false);
    });
    test('Members and Viewers remove nobody', () => {
      for (const t of ROLES) { expect(canRemove('MEMBER', t)).toBe(false); expect(canRemove('VIEWER', t)).toBe(false); }
    });
  });

  describe('inviting', () => {
    test('nobody can invite an Owner', () => {
      expect(INVITABLE_ROLES).not.toContain('OWNER');
      for (const r of ROLES) expect(canInviteAs(r, 'OWNER')).toBe(false);
    });
    test('only the Owner can invite an Admin', () => {
      expect(canInviteAs('OWNER', 'ADMIN')).toBe(true);
      expect(canInviteAs('ADMIN', 'ADMIN')).toBe(false);
    });
    test('Owner and Admin can invite Members and Viewers; others cannot invite at all', () => {
      for (const r of ['MEMBER', 'VIEWER'] as FamilyRoleName[]) {
        expect(canInviteAs('OWNER', r)).toBe(true);
        expect(canInviteAs('ADMIN', r)).toBe(true);
        expect(canInviteAs('MEMBER', r)).toBe(false);
        expect(canInviteAs('VIEWER', r)).toBe(false);
      }
    });
  });
});
