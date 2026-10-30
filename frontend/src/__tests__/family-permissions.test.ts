import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FAMILY_ACTIONS, INVITABLE_ROLES, can, canEditTransaction, canInviteAs, canRemove, type FamilyAction, type FamilyRole } from '@/utils/family-permissions';

const ROLES: FamilyRole[] = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];

// The same hand-written matrix as backend/src/modules/family/family-permissions.spec.ts.
const EXPECTED: Record<FamilyAction, FamilyRole[]> = {
  'family.view': ROLES, 'member.list': ROLES, 'activity.view': ROLES,
  'invite.create': ['OWNER', 'ADMIN'], 'invite.create.admin': ['OWNER'], 'invite.list': ['OWNER', 'ADMIN'], 'invite.revoke': ['OWNER', 'ADMIN'],
  'member.remove.lowerRoles': ['OWNER', 'ADMIN'], 'member.remove.any': ['OWNER'], 'member.role.change': ['OWNER'],
  'family.rename': ['OWNER'], 'family.delete': ['OWNER'], 'ownership.transfer': ['OWNER'],
  'member.leave': ['ADMIN', 'MEMBER', 'VIEWER'],
  'tx.add': ['OWNER', 'ADMIN', 'MEMBER'], 'tx.edit.own': ['OWNER', 'ADMIN', 'MEMBER'], 'tx.edit.other': ['OWNER', 'ADMIN'],
  'wallet.manage': ['OWNER', 'ADMIN'], 'wallet.delete': ['OWNER'], 'budget.set': ['OWNER', 'ADMIN'],
  'comment.add': ROLES, 'comment.delete.other': ['OWNER', 'ADMIN'], 'goal.manage': ['OWNER', 'ADMIN'], 'goal.contribute': ['OWNER', 'ADMIN', 'MEMBER'], 'allowance.manage': ['OWNER', 'ADMIN'], 'approval.manage': ['OWNER'], 'approval.decide': ['OWNER', 'ADMIN'], 'transfer.contribute': ['OWNER', 'ADMIN', 'MEMBER'], 'transfer.reimburse': ['OWNER', 'ADMIN'], 'schedule.manage': ['OWNER', 'ADMIN'], 'debt.manage': ['OWNER', 'ADMIN'],
};

describe('the app\'s permission table matches the server\'s', () => {
  test('the matrix lists every action', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...FAMILY_ACTIONS].sort());
  });

  test.each(FAMILY_ACTIONS.map(a => [a] as [FamilyAction]))('%s', action => {
    for (const role of ROLES) expect(can(role, action)).toBe(EXPECTED[action].includes(role));
  });

  test('the list of actions is the same as the one in the backend source', () => {
    const backend = readFileSync(join(__dirname, '..', '..', '..', 'backend', 'src', 'modules', 'family', 'family-permissions.ts'), 'utf8');
    const block = backend.slice(backend.indexOf('FAMILY_ACTIONS = ['), backend.indexOf('] as const'));
    const fromBackend = [...block.matchAll(/'([a-zA-Z.]+)'/g)].map(m => m[1]);
    expect([...fromBackend].sort()).toEqual([...FAMILY_ACTIONS].sort());
  });

  test('the server\'s matrix test still holds the same rows (a change there means a change here)', () => {
    const spec = readFileSync(join(__dirname, '..', '..', '..', 'backend', 'src', 'modules', 'family', 'family-permissions.spec.ts'), 'utf8');
    for (const [action, roles] of Object.entries(EXPECTED)) {
      const line = spec.split('\n').find(l => l.includes(`'${action}':`));
      expect(line).toBeTruthy();
      const named = [...(line as string).slice((line as string).indexOf(`'${action}':`)).split('],')[0].matchAll(/'(OWNER|ADMIN|MEMBER|VIEWER)'/g)].map(m => m[1]);
      if (roles.length === 4) expect(line).toContain('ROLES');
      else expect(named).toEqual(roles);
    }
  });
});

describe('removing, inviting and editing', () => {
  test('the Owner removes any non-owner; an Admin removes Members and Viewers; others remove nobody', () => {
    expect(canRemove('OWNER', 'ADMIN')).toBe(true);
    expect(canRemove('OWNER', 'OWNER')).toBe(false);
    expect(canRemove('ADMIN', 'MEMBER')).toBe(true);
    expect(canRemove('ADMIN', 'VIEWER')).toBe(true);
    expect(canRemove('ADMIN', 'ADMIN')).toBe(false);
    expect(canRemove('ADMIN', 'OWNER')).toBe(false);
    for (const t of ROLES) { expect(canRemove('MEMBER', t)).toBe(false); expect(canRemove('VIEWER', t)).toBe(false); }
  });
  test('nobody invites an Owner; only the Owner invites an Admin', () => {
    expect(INVITABLE_ROLES).not.toContain('OWNER');
    for (const r of ROLES) expect(canInviteAs(r, 'OWNER')).toBe(false);
    expect(canInviteAs('OWNER', 'ADMIN')).toBe(true);
    expect(canInviteAs('ADMIN', 'ADMIN')).toBe(false);
    expect(canInviteAs('ADMIN', 'MEMBER')).toBe(true);
    expect(canInviteAs('MEMBER', 'VIEWER')).toBe(false);
  });
  test('a Member edits their own entries only; an Admin edits anyone\'s; a Viewer edits nothing', () => {
    expect(canEditTransaction('MEMBER', true)).toBe(true);
    expect(canEditTransaction('MEMBER', false)).toBe(false);
    expect(canEditTransaction('ADMIN', false)).toBe(true);
    expect(canEditTransaction('VIEWER', true)).toBe(false);
    expect(canEditTransaction(null, true)).toBe(false);
  });
  test('no role at all can do nothing', () => {
    for (const a of FAMILY_ACTIONS) { expect(can(null, a)).toBe(false); expect(can(undefined, a)).toBe(false); }
  });
});
