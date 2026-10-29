// Ported from expo_app/utils/pending-invite.ts
// Web only: the invite is kept for this tab (sessionStorage), not on the device (localStorage like the phone app's AsyncStorage).
import AsyncStorage from '@/lib/shims/session-storage';
import type { InviteInput } from '@/services/family.service';
import { parseInvite } from '@/utils/family-invite';

const KEY = 'family:pending-invite';
/** An invite lives 7 days on the server; a kept one is forgotten after the same time. */
export const PENDING_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

interface Stored { input: InviteInput; savedAt: number }

/**
 * Keeps an invite the person opened (a link or a code) while they were signed out, so the Join screen can open with it
 * as soon as they have signed in or registered. Never throws: storage can be blocked or empty.
 */
export async function savePendingInvite(input: InviteInput, now = Date.now()): Promise<void> {
  try {
    if (!input.token && !input.code) return;
    await AsyncStorage.setItem(KEY, JSON.stringify({ input, savedAt: now } satisfies Stored));
  } catch { /* the code is still on the person's screen */ }
}

export async function loadPendingInvite(now = Date.now()): Promise<InviteInput | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Stored>;
    if (!s || typeof s.savedAt !== 'number' || now - s.savedAt > PENDING_MAX_AGE_MS) { await clearPendingInvite(); return null; }
    // Re-validate the shape: only a real token or code is ever sent to the server.
    const again = parseInvite(s.input?.token ?? s.input?.code ?? '');
    return again;
  } catch { return null; }
}

export async function clearPendingInvite(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
