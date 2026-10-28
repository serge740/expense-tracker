import { createHash, randomBytes, randomInt } from 'crypto';

/** No 0, O, 1 or I, so a code read aloud or typed from a screenshot cannot be mixed up. 32 symbols. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function newInviteCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** The secret in the invite link. Only its hash is ever stored. */
export function newInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A typed code: spaces, dashes and case do not matter. Returns null when it cannot be a code at all. */
export function normaliseCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** A pasted token: only its shape is checked here, the database decides whether it is real. */
export function normaliseToken(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const token = input.trim();
  return /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null;
}
