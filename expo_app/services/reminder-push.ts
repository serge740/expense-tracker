import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { snoozeReminder } from '@/services/reminder.service';
import { requestReminderRefresh } from '@/utils/reminders';

export const REMINDER_CATEGORY = 'reminder';
export const ACTION_SNOOZE_10 = 'SNOOZE_10';
export const ACTION_SNOOZE_60 = 'SNOOZE_60';
export const ACTION_OPEN = 'OPEN';

/** Adds the Snooze / Open buttons to reminder pushes. JavaScript only, so no rebuild is needed. */
export async function setupReminderCategory(labels: { snooze10: string; snooze60: string; open: string }) {
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    { identifier: ACTION_SNOOZE_10, buttonTitle: labels.snooze10, options: { opensAppToForeground: true } },
    { identifier: ACTION_SNOOZE_60, buttonTitle: labels.snooze60, options: { opensAppToForeground: true } },
    { identifier: ACTION_OPEN, buttonTitle: labels.open, options: { opensAppToForeground: true } },
  ]);
}

export type ReminderPushAction =
  | { kind: 'snooze'; reminderId: string; minutes: number }
  | { kind: 'open-debt'; debtId: string; reminderId?: string }
  | { kind: 'open-schedule'; scheduleId: string; reminderId?: string }
  | { kind: 'popup' }
  | { kind: 'none' };

/** What a tap on a reminder push (or one of its buttons) should do. Pure, so it can be tested. */
export function decideReminderAction(actionIdentifier: string, data: Record<string, any> | null | undefined): ReminderPushAction {
  if (!data || data.type !== 'reminder') return { kind: 'none' };
  const reminderId = typeof data.reminderId === 'string' ? data.reminderId : undefined;
  const debtId = typeof data.debtId === 'string' ? data.debtId : undefined;
  const scheduleId = typeof data.scheduleId === 'string' ? data.scheduleId : undefined;

  if (actionIdentifier === ACTION_SNOOZE_10 && reminderId) return { kind: 'snooze', reminderId, minutes: 10 };
  if (actionIdentifier === ACTION_SNOOZE_60 && reminderId) return { kind: 'snooze', reminderId, minutes: 60 };
  if (actionIdentifier === ACTION_OPEN && debtId) return { kind: 'open-debt', debtId, reminderId };
  if (actionIdentifier === ACTION_OPEN && scheduleId) return { kind: 'open-schedule', scheduleId, reminderId };
  // A plain tap (or a digest, which has no single debt) shows the popup with everything waiting.
  return { kind: 'popup' };
}

/**
 * Carries out a reminder push response. Returns false when the push was not a reminder,
 * so the caller can apply its normal behaviour (open the inbox).
 */
export async function handleReminderResponse(response: Notifications.NotificationResponse): Promise<boolean> {
  const data = response.notification.request.content.data as Record<string, any> | undefined;
  const action = decideReminderAction(response.actionIdentifier, data);
  if (action.kind === 'none') return false;

  if (action.kind === 'snooze') {
    try { await snoozeReminder(action.reminderId, { minutes: action.minutes }); } catch { /* the popup will still show it */ }
    requestReminderRefresh({ reset: false });
  } else if (action.kind === 'open-debt') {
    router.push({ pathname: '/(dashboard)/debts' as any, params: { openId: action.debtId } });
    requestReminderRefresh({ reset: false });
  } else if (action.kind === 'open-schedule') {
    router.push({ pathname: '/(dashboard)/scheduled' as any, params: { id: action.scheduleId } });
    requestReminderRefresh({ reset: false });
  } else {
    requestReminderRefresh({ reset: true });
  }
  return true;
}
