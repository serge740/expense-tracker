import type { InviteInput } from '@/services/family.service';
import { parseInvite } from '@/utils/family-invite';

/**
 * The invite link opens /join/<token>. The token is a secret, so the page reads it once and removes it from the address
 * bar at once (it would otherwise sit in the browser history, and could travel in a Referer or a shared screenshot).
 */
export const JOIN_PATH = '/join';

/** The invite in an address, or null. Accepts /join/<token>, ?token=<token> and ?code=<code>. */
export function parseJoinAddress(pathname: string, search: string): InviteInput | null {
  return parseInvite(`${pathname}${search}`);
}

interface Win {
  location: { pathname: string; search: string };
  history: { state: unknown; replaceState: (state: unknown, title: string, url: string) => void };
}

/**
 * Takes the invite out of the address: it is passed to `save` (which keeps it until sign-in), and the address becomes plain
 * /join whatever happens. Returns what was found.
 */
export async function captureJoinInvite(win: Win, save: (input: InviteInput) => Promise<void>): Promise<InviteInput | null> {
  const found = parseJoinAddress(win.location.pathname, win.location.search);
  if (!found) return null;
  try {
    await save(found);
  } finally {
    win.history.replaceState(win.history.state, '', JOIN_PATH);
  }
  return found;
}

/** A phone browser that may have the app installed (so "Open in the app" is worth showing). */
export const isPhoneBrowser = (userAgent: string): boolean => /Android|iPhone|iPad|iPod/i.test(userAgent);
