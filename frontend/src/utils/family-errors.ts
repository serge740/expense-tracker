// Ported from expo_app/utils/family-errors.ts
import type { StringKey } from '@/i18n/strings';

/**
 * Every error code the family routes can answer (see backend/src/modules/family/family-errors.ts; a test compares the
 * two lists). Each one has a full sentence in all four languages under `fam.err.<CODE>`, so the app never shows the
 * server's English.
 */
export const FAMILY_ERROR_CODES = [
  'NOT_VERIFIED', 'ALREADY_IN_FAMILY', 'ALREADY_MEMBER', 'FAMILY_NOT_FOUND', 'FAMILY_GONE', 'FAMILY_FULL',
  'FORBIDDEN_ACTION', 'MEMBER_NOT_FOUND', 'OWNER_MUST_TRANSFER', 'OWNER_CANNOT_BE_CHANGED', 'CANNOT_CHANGE_OWN_ROLE',
  'INVALID_ROLE', 'INVALID_INPUT', 'CONFIRM_NAME_MISMATCH',
  'INVITE_NOT_FOUND', 'INVITE_EXPIRED', 'INVITE_INVALID', 'INVITE_FOR_SOMEONE_ELSE', 'TOO_MANY_PENDING_INVITES', 'TOO_MANY_ATTEMPTS',
  'NOT_A_MEMBER', 'BAD_FAMILY_HEADER', 'WRONG_SCOPE', 'WALLET_NOT_FOUND', 'WALLET_HAS_HISTORY', 'PERSONAL_ONLY',
] as const;
export type FamilyErrorCode = (typeof FAMILY_ERROR_CODES)[number];

/** The code a failed request carries, or null when it is not one of ours (a network error, an older server). */
export function familyErrorCode(e: unknown): FamilyErrorCode | null {
  const code = (e as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' && (FAMILY_ERROR_CODES as readonly string[]).includes(code) ? (code as FamilyErrorCode) : null;
}

/** The translation key to show for a failed request. */
export function familyErrorKey(e: unknown): StringKey {
  const code = familyErrorCode(e);
  if (code) return `fam.err.${code}` as StringKey;
  const status = (e as { response?: { status?: number } })?.response?.status;
  return status === undefined ? 'fam.err.NETWORK' : 'fam.err.GENERIC';
}

/** An error that means "you are not in this family (any more)". */
export const isNotAMember = (e: unknown): boolean => familyErrorCode(e) === 'NOT_A_MEMBER';

/** Errors that mean the screen or the app has a bug, not that the person did something wrong. */
export const isProgrammingError = (e: unknown): boolean => {
  const c = familyErrorCode(e);
  return c === 'BAD_FAMILY_HEADER' || c === 'WRONG_SCOPE' || c === 'PERSONAL_ONLY';
};

/**
 * The sentence for a failed request on a screen that existed before families: one of ours (a family error code) gets its
 * translation; anything else keeps what the screen showed before (the server's own message, or the screen's fallback).
 */
export function errorMessage(e: unknown, fallback: string, t: (key: any) => string): string {
  if (familyErrorCode(e)) return t(familyErrorKey(e));
  const message = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}
