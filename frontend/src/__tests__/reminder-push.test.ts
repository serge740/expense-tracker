import { describe, expect, test, vi } from 'vitest';

vi.mock('@/router/router', () => ({ router: { push: vi.fn() } }));
vi.mock('@/services/reminder.service', () => ({ snoozeReminder: vi.fn() }));

import { ACTION_OPEN, ACTION_SNOOZE_10, ACTION_SNOOZE_60, decideReminderAction, handleReminderResponse } from '@/services/reminder-push';
import { onReminderRefresh } from '@/utils/reminders';

import { router } from '@/router/router';
import { snoozeReminder } from '@/services/reminder.service';
const push = router.push as unknown as ReturnType<typeof vi.fn>;
const snooze = snoozeReminder as unknown as ReturnType<typeof vi.fn>;

const single = { type: 'reminder', reminderId: 'r1', debtId: 'd1', notificationId: 'n1' };
const digest = { type: 'reminder', digest: true, reminderIds: ['r1', 'r2'] };
const scheduledPush = { type: 'reminder', reminderId: 'r9', occurrenceId: 'o1', scheduleId: 's1', notificationId: 'n9' };
const response = (actionIdentifier: string, data: Record<string, unknown>) =>
  ({ actionIdentifier, notification: { request: { content: { data } } } }) as any;

describe('decideReminderAction', () => {
  test('the buttons map to snooze 10 min, snooze 1 h and open the debt', () => {
    expect(decideReminderAction(ACTION_SNOOZE_10, single)).toEqual({ kind: 'snooze', reminderId: 'r1', minutes: 10 });
    expect(decideReminderAction(ACTION_SNOOZE_60, single)).toEqual({ kind: 'snooze', reminderId: 'r1', minutes: 60 });
    expect(decideReminderAction(ACTION_OPEN, single)).toEqual({ kind: 'open-debt', debtId: 'd1', reminderId: 'r1' });
  });

  test('a scheduled reminder: Open goes to the schedule, snooze works the same', () => {
    expect(decideReminderAction(ACTION_OPEN, scheduledPush)).toEqual({ kind: 'open-schedule', scheduleId: 's1', reminderId: 'r9' });
    expect(decideReminderAction(ACTION_SNOOZE_10, scheduledPush)).toEqual({ kind: 'snooze', reminderId: 'r9', minutes: 10 });
  });

  test('a debt reminder never opens a schedule, and a schedule never opens a debt', () => {
    expect(decideReminderAction(ACTION_OPEN, single).kind).toBe('open-debt');
    expect(decideReminderAction(ACTION_OPEN, scheduledPush).kind).toBe('open-schedule');
  });

  test('a plain tap shows the popup', () => {
    expect(decideReminderAction('expo.modules.notifications.actions.DEFAULT', single)).toEqual({ kind: 'popup' });
  });

  test('a digest has no single reminder, so every button falls back to the popup', () => {
    expect(decideReminderAction(ACTION_SNOOZE_10, digest)).toEqual({ kind: 'popup' });
    expect(decideReminderAction(ACTION_OPEN, digest)).toEqual({ kind: 'popup' });
  });

  test('anything that is not a reminder is left alone', () => {
    expect(decideReminderAction(ACTION_OPEN, { type: 'transaction' })).toEqual({ kind: 'none' });
    expect(decideReminderAction(ACTION_OPEN, null)).toEqual({ kind: 'none' });
    expect(decideReminderAction(ACTION_OPEN, undefined)).toEqual({ kind: 'none' });
  });

  test('ignores ids of the wrong type', () => {
    expect(decideReminderAction(ACTION_SNOOZE_10, { type: 'reminder', reminderId: 5, debtId: 7 })).toEqual({ kind: 'popup' });
  });
});

describe('handleReminderResponse', () => {
  test('Snooze button: snoozes on the server, then asks the popup to reload', async () => {
    snooze.mockResolvedValue({});
    const heard: unknown[] = [];
    const off = onReminderRefresh(o => heard.push(o));
    expect(await handleReminderResponse(response(ACTION_SNOOZE_60, single))).toBe(true);
    expect(snooze).toHaveBeenCalledWith('r1', { minutes: 60 });
    expect(heard).toEqual([{ reset: false }]);
    off();
  });

  test('a failed snooze still reloads the popup so the reminder is not lost', async () => {
    snooze.mockRejectedValue(new Error('offline'));
    const heard: unknown[] = [];
    const off = onReminderRefresh(o => heard.push(o));
    expect(await handleReminderResponse(response(ACTION_SNOOZE_10, single))).toBe(true);
    expect(heard).toEqual([{ reset: false }]);
    off();
  });

  test('Open button goes to the debt', async () => {
    push.mockClear();
    expect(await handleReminderResponse(response(ACTION_OPEN, single))).toBe(true);
    expect(push).toHaveBeenCalledWith({ pathname: '/(dashboard)/debts', params: { openId: 'd1' } });
  });

  test('Open button on a scheduled reminder goes to the schedule', async () => {
    push.mockClear();
    expect(await handleReminderResponse(response(ACTION_OPEN, scheduledPush))).toBe(true);
    expect(push).toHaveBeenCalledWith({ pathname: '/(dashboard)/scheduled', params: { id: 's1' } });
  });

  test('a plain tap asks the popup to reload and forget what was closed', async () => {
    const heard: unknown[] = [];
    const off = onReminderRefresh(o => heard.push(o));
    expect(await handleReminderResponse(response('expo.modules.notifications.actions.DEFAULT', single))).toBe(true);
    expect(heard).toEqual([{ reset: true }]);
    off();
  });

  test('a push that is not a reminder is reported as not handled', async () => {
    expect(await handleReminderResponse(response('expo.modules.notifications.actions.DEFAULT', { type: 'transaction' }))).toBe(false);
  });
});
