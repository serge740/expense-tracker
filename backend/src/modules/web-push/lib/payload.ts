export interface WebPushPayload {
  title: string;
  body: string;
  /** Same tag = the same notification: a repeat replaces the one on screen instead of piling up. */
  tag: string;
  /** Where the web app opens when it is clicked. */
  url: string;
  /** Sent with high urgency and kept on screen until clicked. */
  urgent: boolean;
  /** Kept on screen until clicked, whatever its level (reminders). */
  stay: boolean;
  timestamp: number;
  /** The inbox row this push belongs to, so opening it can mark it read. */
  recipientRowId?: string;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * Turns what the server already sends to phones (title, body, data) into the shape the web notification needs.
 * Reminders open the thing they are about and stay until dealt with; everything else opens the inbox.
 */
export function buildWebPayload(input: { title: string; body: string; data?: Record<string, unknown>; now?: number; uniqueId?: string }): WebPushPayload {
  const data = input.data ?? {};
  const now = input.now ?? Date.now();
  const rowId = str(data.notificationId);
  const base = { title: input.title, body: input.body, timestamp: now, ...(rowId ? { recipientRowId: rowId } : {}) };

  if (data.type === 'reminder') {
    const reminderId = str(data.reminderId);
    const debtId = str(data.debtId);
    const scheduleId = str(data.scheduleId);
    if (data.digest) return { ...base, tag: 'reminder-digest', url: '/app?reminder=1', urgent: false, stay: true };
    const url = debtId ? `/app/debts?openId=${encodeURIComponent(debtId)}`
      : scheduleId ? `/app/scheduled?id=${encodeURIComponent(scheduleId)}`
      : '/app?reminder=1';
    return { ...base, tag: `reminder-${reminderId ?? debtId ?? scheduleId ?? input.uniqueId ?? now}`, url, urgent: false, stay: true };
  }

  return {
    ...base,
    tag: `n-${rowId ?? input.uniqueId ?? now}`,
    url: '/app/notifications',
    urgent: data.type === 'security',
    stay: false,
  };
}
