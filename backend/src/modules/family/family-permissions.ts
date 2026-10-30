export type FamilyRoleName = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

/** Every thing a person can do inside a family. The transaction, wallet and budget ones are used from F2 on. */
export const FAMILY_ACTIONS = [
  'family.view', 'member.list', 'activity.view',
  'invite.create', 'invite.create.admin', 'invite.list', 'invite.revoke',
  'member.remove.lowerRoles', 'member.remove.any', 'member.role.change',
  'family.rename', 'family.delete', 'ownership.transfer', 'member.leave',
  'tx.add', 'tx.edit.own', 'tx.edit.other', 'wallet.manage', 'wallet.delete', 'budget.set',
  'comment.add', 'comment.delete.other', 'goal.manage', 'goal.contribute', 'allowance.manage', 'approval.manage', 'approval.decide',
  'transfer.contribute', 'transfer.reimburse', 'schedule.manage', 'debt.manage',
] as const;
export type FamilyAction = (typeof FAMILY_ACTIONS)[number];

const VIEW: FamilyAction[] = ['family.view', 'member.list', 'activity.view', 'comment.add'];

/** The one place that says who may do what. Nothing else in the code compares roles. */
const TABLE: Record<FamilyRoleName, ReadonlySet<FamilyAction>> = {
  OWNER: new Set<FamilyAction>([
    ...VIEW,
    'invite.create', 'invite.create.admin', 'invite.list', 'invite.revoke',
    'member.remove.lowerRoles', 'member.remove.any', 'member.role.change',
    'family.rename', 'family.delete', 'ownership.transfer',
    'tx.add', 'tx.edit.own', 'tx.edit.other', 'wallet.manage', 'wallet.delete', 'budget.set',
    'comment.delete.other', 'goal.manage', 'goal.contribute', 'allowance.manage', 'approval.manage', 'approval.decide',
    'transfer.contribute', 'transfer.reimburse', 'schedule.manage', 'debt.manage',
  ]),
  ADMIN: new Set<FamilyAction>([
    ...VIEW,
    'invite.create', 'invite.list', 'invite.revoke',
    'member.remove.lowerRoles', 'member.leave',
    'tx.add', 'tx.edit.own', 'tx.edit.other', 'wallet.manage', 'budget.set',
    'comment.delete.other', 'goal.manage', 'goal.contribute', 'allowance.manage', 'approval.decide',
    'transfer.contribute', 'transfer.reimburse', 'schedule.manage', 'debt.manage',
  ]),
  MEMBER: new Set<FamilyAction>([...VIEW, 'member.leave', 'tx.add', 'tx.edit.own', 'goal.contribute', 'transfer.contribute']),
  VIEWER: new Set<FamilyAction>([...VIEW, 'member.leave']),
};

export function can(role: FamilyRoleName | null | undefined, action: FamilyAction): boolean {
  return !!role && TABLE[role].has(action);
}

/** Roles ranked so rules like "an Admin cannot touch another Admin" read the same everywhere. */
const RANK: Record<FamilyRoleName, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1, VIEWER: 0 };
export const rankOf = (role: FamilyRoleName) => RANK[role];

/** Roles an invite may offer. OWNER is never one of them: ownership only moves by transfer. */
export const INVITABLE_ROLES: FamilyRoleName[] = ['ADMIN', 'MEMBER', 'VIEWER'];

/** Whether `actor` may remove `target`. The Owner can never be removed, and removing yourself is "leave", not this. */
export function canRemove(actor: FamilyRoleName, target: FamilyRoleName): boolean {
  if (target === 'OWNER') return false;
  if (can(actor, 'member.remove.any')) return true;
  return can(actor, 'member.remove.lowerRoles') && rankOf(target) < rankOf(actor) && target !== 'ADMIN';
}

/** Whether `actor` may create an invite for `role`. */
export function canInviteAs(actor: FamilyRoleName, role: FamilyRoleName): boolean {
  if (!INVITABLE_ROLES.includes(role)) return false;
  if (role === 'ADMIN') return can(actor, 'invite.create.admin');
  return can(actor, 'invite.create');
}
