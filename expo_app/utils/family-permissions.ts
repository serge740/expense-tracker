/**
 * What each role may do inside a family. This is a copy of backend/src/modules/family/family-permissions.ts and is only
 * used to show or hide buttons: the server decides, and refuses anything the role may not do. A test compares the two
 * tables, so they cannot drift apart unnoticed.
 */
export type FamilyRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export const FAMILY_ACTIONS = [
  'family.view', 'member.list', 'activity.view',
  'invite.create', 'invite.create.admin', 'invite.list', 'invite.revoke',
  'member.remove.lowerRoles', 'member.remove.any', 'member.role.change',
  'family.rename', 'family.delete', 'ownership.transfer', 'member.leave',
  'tx.add', 'tx.edit.own', 'tx.edit.other', 'wallet.manage', 'wallet.delete', 'budget.set',
] as const;
export type FamilyAction = (typeof FAMILY_ACTIONS)[number];

const VIEW: FamilyAction[] = ['family.view', 'member.list', 'activity.view'];

const TABLE: Record<FamilyRole, ReadonlySet<FamilyAction>> = {
  OWNER: new Set<FamilyAction>([
    ...VIEW,
    'invite.create', 'invite.create.admin', 'invite.list', 'invite.revoke',
    'member.remove.lowerRoles', 'member.remove.any', 'member.role.change',
    'family.rename', 'family.delete', 'ownership.transfer',
    'tx.add', 'tx.edit.own', 'tx.edit.other', 'wallet.manage', 'wallet.delete', 'budget.set',
  ]),
  ADMIN: new Set<FamilyAction>([
    ...VIEW,
    'invite.create', 'invite.list', 'invite.revoke',
    'member.remove.lowerRoles', 'member.leave',
    'tx.add', 'tx.edit.own', 'tx.edit.other', 'wallet.manage', 'budget.set',
  ]),
  MEMBER: new Set<FamilyAction>([...VIEW, 'member.leave', 'tx.add', 'tx.edit.own']),
  VIEWER: new Set<FamilyAction>([...VIEW, 'member.leave']),
};

export const can = (role: FamilyRole | null | undefined, action: FamilyAction): boolean => !!role && TABLE[role].has(action);

const RANK: Record<FamilyRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1, VIEWER: 0 };
export const rankOf = (role: FamilyRole) => RANK[role];

/** Roles an invite may offer. Ownership only moves by transfer. */
export const INVITABLE_ROLES: FamilyRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];
/** Roles the Owner can give to an existing member. */
export const GIVABLE_ROLES: FamilyRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];

/** Whether `actor` may remove `target`. The Owner is never removed, and removing yourself is "leave". */
export function canRemove(actor: FamilyRole, target: FamilyRole): boolean {
  if (target === 'OWNER') return false;
  if (can(actor, 'member.remove.any')) return true;
  return can(actor, 'member.remove.lowerRoles') && rankOf(target) < rankOf(actor) && target !== 'ADMIN';
}

export function canInviteAs(actor: FamilyRole, role: FamilyRole): boolean {
  if (!INVITABLE_ROLES.includes(role)) return false;
  if (role === 'ADMIN') return can(actor, 'invite.create.admin');
  return can(actor, 'invite.create');
}

/** Editing or deleting a family transaction: your own needs "edit own", another person's needs "edit other". */
export const canEditTransaction = (role: FamilyRole | null | undefined, isOwn: boolean): boolean =>
  can(role, isOwn ? 'tx.edit.own' : 'tx.edit.other');
