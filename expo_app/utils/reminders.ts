import type { StringKey } from '@/i18n/strings';
import type { PendingReminder } from '@/services/reminder.service';

/** The quick snooze choices, in the order they are shown. "Pick date & time" is added by the sheet. */
export const SNOOZE_PRESETS: { minutes: number; label: StringKey }[] = [
  { minutes: 10, label: 'rem.s10' },
  { minutes: 30, label: 'rem.s30' },
  { minutes: 60, label: 'rem.s60' },
  { minutes: 1440, label: 'rem.s1d' },
  { minutes: 10080, label: 'rem.s1w' },
];

export const snoozeTime = (now: Date, minutes: number) => new Date(now.getTime() + minutes * 60_000);

// ── Clock strings (server stores quiet hours as "HH:MM", the old local setting as minutes) ──

export function minutesToClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function clockToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  return (Number(m[1]) * 60 + Number(m[2])) % 1440;
}

/** The phone's IANA zone (e.g. "Africa/Kigali"), or "UTC" when the runtime cannot tell. */
export function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

// ── Describing a reminder, whatever it is about ─────────────────────────────

/** Who or what the reminder is about: the person for a debt, the title for a scheduled item. */
export const reminderLabel = (r: PendingReminder): string => (r.source === 'SCHEDULED' ? r.title : r.person);

/** The currency to show: the wallet's, or the person's main one when a scheduled item has no wallet. */
export const reminderCurrency = (r: PendingReminder, fallback: string): string => r.currency || fallback;

// ── Which reminders the popup shows ─────────────────────────────────────────

/** reminder id → the `lastFiredAt` it had when the person closed the popup with ×. */
export type ClosedMap = Record<string, string | null>;

/**
 * Closing with × is not an answer: a reminder stays hidden only until it fires again
 * (its `lastFiredAt` changes) or the app is reopened (the caller clears the map).
 */
export function visibleQueue<T extends { id: string; lastFiredAt: string | null }>(items: T[], closed: ClosedMap): T[] {
  return items.filter(i => !(i.id in closed) || closed[i.id] !== i.lastFiredAt);
}

export const closeAll = (items: { id: string; lastFiredAt: string | null }[], closed: ClosedMap): ClosedMap =>
  items.reduce<ClosedMap>((acc, i) => ({ ...acc, [i.id]: i.lastFiredAt }), { ...closed });

// ── Keeping server preferences in step with the phone ───────────────────────

export interface ServerReminderPrefs { timezone: string; language: string; quietEnabled: boolean }

/** What to send so the server writes reminders in the right zone and language. null = already in step. */
export function zoneLanguagePatch(device: { timezone: string; language: string }, server: Pick<ServerReminderPrefs, 'timezone' | 'language'>) {
  const patch: { timezone?: string; language?: string } = {};
  if (device.timezone && device.timezone !== server.timezone) patch.timezone = device.timezone;
  if (device.language && device.language !== server.language) patch.language = device.language;
  return Object.keys(patch).length ? patch : null;
}

/**
 * Quiet hours used to live only on the phone (and were enforced nowhere). Copy them to the server
 * once, never over a setting the person already made there.
 */
export function quietMigrationPatch(
  local: { quietHours: boolean; quietStart: number; quietEnd: number },
  server: Pick<ServerReminderPrefs, 'quietEnabled'>,
  alreadyMigrated: boolean,
) {
  if (alreadyMigrated || !local.quietHours || server.quietEnabled) return null;
  return { quietEnabled: true, quietStart: minutesToClock(local.quietStart), quietEnd: minutesToClock(local.quietEnd) };
}

// ── A tiny "please reload" signal between the push handler and the popup ────

type Listener = (opts: { reset: boolean }) => void;
const listeners = new Set<Listener>();

/** Ask the popup to reload. `reset` also forgets what was closed (a push tap, or coming back to the app). */
export const requestReminderRefresh = (opts: { reset: boolean } = { reset: false }) => listeners.forEach(l => l(opts));

export function onReminderRefresh(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
