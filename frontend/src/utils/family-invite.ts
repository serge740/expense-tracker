// Ported from expo_app/utils/family-invite.ts
import type { InviteInput } from '@/services/family.service';

/**
 * Whether the share message includes the web link. On because the join page and the backend rule that serves it ship
 * in the same deploy (F3b). The code always works, with or without the link. The link base is PUBLIC_APP_URL on the server.
 */
export const INVITE_LINK_ENABLED = true;

/** No 0, O, 1 or I, so a code read aloud or typed from a screenshot cannot be mixed up (same alphabet as the server). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** A typed code: spaces, dashes and case do not matter. Returns null when it cannot be a code at all. */
export function normaliseCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * Whatever a person pasted into the join box: a code, or an invite link (the web link `.../join/<token>`, or the app
 * link `expensetracker://family-join?token=...`). Returns what to send to the server, or null when it is neither.
 */
export function parseInvite(input: unknown): InviteInput | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;
  const code = normaliseCode(text);
  if (code) return { code };

  const fromPath = text.match(/\/join\/([A-Za-z0-9_-]{20,64})(?:[/?#]|$)/);
  if (fromPath) return { token: fromPath[1] };
  const fromQuery = text.match(/[?&]token=([A-Za-z0-9_-]{20,64})(?:[&#]|$)/);
  if (fromQuery) return { token: fromQuery[1] };
  const fromCodeQuery = text.match(/[?&]code=([A-Za-z0-9 -]{6,9})(?:[&#]|$)/);
  if (fromCodeQuery) { const c = normaliseCode(fromCodeQuery[1]); if (c) return { code: c }; }
  if (TOKEN_SHAPE.test(text)) return { token: text };
  return null;
}

/** The app address that opens the Join screen with an invite already filled in. */
export const appJoinUrl = (input: InviteInput): string =>
  input.token ? `expensetracker://family-join?token=${encodeURIComponent(input.token)}` : `expensetracker://family-join?code=${encodeURIComponent(input.code ?? '')}`;

type T = (key: any, vars?: Record<string, string | number>) => string;

/** The message people share. It always carries the code; the link only when the web page exists (INVITE_LINK_ENABLED). */
export function inviteShareText(args: { familyName: string; code: string; link?: string; days: number; t: T }): string {
  const { familyName, code, link, days, t } = args;
  const lines = [t('family.share.line', { family: familyName }), t('family.share.code', { code }), t('family.share.how')];
  if (INVITE_LINK_ENABLED && link) lines.push(t('family.share.link', { link }));
  lines.push(t('family.share.expires', { days }));
  return lines.join('\n');
}
