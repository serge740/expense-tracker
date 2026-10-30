import { HttpException } from '@nestjs/common';

/** Stable codes the apps turn into translated text. The English message is only for logs and API users. */
export type FamilyErrorCode =
  | 'NOT_VERIFIED' | 'ALREADY_IN_FAMILY' | 'ALREADY_MEMBER' | 'FAMILY_NOT_FOUND' | 'FAMILY_GONE' | 'FAMILY_FULL'
  | 'FORBIDDEN_ACTION' | 'MEMBER_NOT_FOUND' | 'OWNER_MUST_TRANSFER' | 'OWNER_CANNOT_BE_CHANGED' | 'CANNOT_CHANGE_OWN_ROLE'
  | 'INVALID_ROLE' | 'INVALID_INPUT' | 'CONFIRM_NAME_MISMATCH'
  | 'INVITE_NOT_FOUND' | 'INVITE_EXPIRED' | 'INVITE_INVALID' | 'INVITE_FOR_SOMEONE_ELSE' | 'TOO_MANY_PENDING_INVITES' | 'TOO_MANY_ATTEMPTS'
  | 'NOT_A_MEMBER' | 'BAD_FAMILY_HEADER' | 'WRONG_SCOPE' | 'WALLET_NOT_FOUND' | 'WALLET_HAS_HISTORY' | 'PERSONAL_ONLY' | 'TOO_MANY_FAMILIES';

export function familyError(status: number, code: FamilyErrorCode, message: string): HttpException {
  return new HttpException({ statusCode: status, message, code }, status);
}

export const errors = {
  notVerified: () => familyError(403, 'NOT_VERIFIED', 'Verify your email or phone first'),
  alreadyInFamily: () => familyError(409, 'ALREADY_IN_FAMILY', 'Leave your current family first'),
  alreadyMember: () => familyError(409, 'ALREADY_MEMBER', 'You are already in this family'),
  notFound: () => familyError(404, 'FAMILY_NOT_FOUND', 'Family not found'),
  gone: () => familyError(404, 'FAMILY_GONE', 'This family no longer exists'),
  full: () => familyError(409, 'FAMILY_FULL', 'This family has reached its member limit'),
  forbidden: () => familyError(403, 'FORBIDDEN_ACTION', 'Your role does not allow this'),
  memberNotFound: () => familyError(404, 'MEMBER_NOT_FOUND', 'Member not found'),
  ownerMustTransfer: () => familyError(409, 'OWNER_MUST_TRANSFER', 'Transfer ownership or delete the family first'),
  ownerLocked: () => familyError(409, 'OWNER_CANNOT_BE_CHANGED', 'The owner cannot be changed this way'),
  ownRole: () => familyError(409, 'CANNOT_CHANGE_OWN_ROLE', 'Nobody changes their own role'),
  invalidRole: () => familyError(400, 'INVALID_ROLE', 'That role cannot be given here'),
  invalid: (what: string) => familyError(400, 'INVALID_INPUT', what),
  confirmName: () => familyError(400, 'CONFIRM_NAME_MISMATCH', 'Type the family name to confirm'),
  inviteNotFound: () => familyError(404, 'INVITE_NOT_FOUND', 'No invite matches that code'),
  inviteExpired: () => familyError(410, 'INVITE_EXPIRED', 'This invite expired'),
  inviteInvalid: () => familyError(410, 'INVITE_INVALID', 'This invite is no longer valid'),
  inviteForOther: () => familyError(403, 'INVITE_FOR_SOMEONE_ELSE', 'This invite was sent to someone else'),
  tooManyInvites: () => familyError(409, 'TOO_MANY_PENDING_INVITES', 'Too many pending invites'),
  notAMember: () => familyError(403, 'NOT_A_MEMBER', 'You are not a member of that family'),
  badHeader: () => familyError(400, 'BAD_FAMILY_HEADER', 'The family id is not valid'),
  wrongScope: () => familyError(400, 'WRONG_SCOPE', 'Personal and family money cannot be mixed'),
  walletNotFound: () => familyError(404, 'WALLET_NOT_FOUND', 'Wallet not found'),
  walletHasHistory: () => familyError(409, 'WALLET_HAS_HISTORY', 'This wallet has transactions: archive it instead'),
  personalOnly: () => familyError(400, 'PERSONAL_ONLY', 'This is only available in your personal space'),
  tooManyFamilies: () => familyError(409, 'TOO_MANY_FAMILIES', 'You are already in the most families allowed'),
  tooManyAttempts: () => familyError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes, try again later'),
};

export const LIMITS = { maxMembers: 12, maxPendingInvites: 20, inviteDays: 7, maxFamilies: 3 } as const;

/** The unique key of one active membership: the person and the family, so a person can hold one in each family. */
export const activeKeyOf = (clientId: string, familyId: string) => `${clientId}:${familyId}`;

export const isUniqueViolation = (e: any) => e?.code === 'P2002';
