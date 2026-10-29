import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/services/family.service', () => ({ getMyFamily: jest.fn() }));
jest.mock('expo-router', () => ({ useSegments: () => ['(dashboard)'], router: { push: jest.fn() } }));
jest.mock('expo-notifications', () => ({ useLastNotificationResponse: () => null, DEFAULT_ACTION_IDENTIFIER: 'default' }));
jest.mock('@/services/device.service', () => ({ registerDevice: jest.fn(async () => {}) }));
jest.mock('@/services/local-notifications', () => ({ prepareNotificationChannel: jest.fn(async () => {}), pushSoundConfig: () => ({}) }));
jest.mock('@/services/reminder-push', () => ({ handleReminderResponse: jest.fn(async () => false), setupReminderCategory: jest.fn(async () => {}) }));
jest.mock('@/hooks/use-reminder-prefs-sync', () => ({ useReminderPrefsSync: jest.fn() }));
jest.mock('@/context/notification-context', () => ({ NotificationProvider: ({ children }: any) => children }));
jest.mock('@/context/preferences-context', () => ({ usePreferences: () => ({ prefs: { notificationSound: 'default', notificationVibrate: true } }) }));
jest.mock('@/components/reminders/reminder-host', () => ({ ReminderModalHost: () => null }));

// The screens are not the point here: a probe stands in for them so we can switch scope from inside the provider.
let latest: any;
jest.mock('@/components/family/scoped-tabs', () => {
  const { useScope } = require('@/context/scope-context');
  return { ScopedTabs: () => { latest = useScope(); return null; } };
});

import DashboardLayout from '@/app/(dashboard)/_layout';
import { clearScopeOnSessionLoss } from '@/utils/family-scope-link';

const device = require('@/services/device.service') as { registerDevice: jest.Mock };
const channel = require('@/services/local-notifications') as { prepareNotificationChannel: jest.Mock };
const reminderPush = require('@/services/reminder-push') as { setupReminderCategory: jest.Mock };
const family = require('@/services/family.service') as { getMyFamily: jest.Mock<() => Promise<any>> };
const mine = { family: { id: 'fam-12345678', name: 'Mwiza Family', currency: 'RWF', timezone: 'UTC' }, role: 'OWNER', memberCount: 2, limits: {} };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

beforeEach(() => { jest.clearAllMocks(); family.getMyFamily.mockResolvedValue(mine); latest = undefined; });
afterEach(async () => { await cleanup(); clearScopeOnSessionLoss(); });

describe('switching scope does not restart what the dashboard keeps running', () => {
  test('push registration and the reminder buttons are set up once, however often the person switches', async () => {
    await render(<SafeAreaProvider initialMetrics={metrics}><LanguageProvider><DashboardLayout /></LanguageProvider></SafeAreaProvider>);
    await waitFor(() => expect(latest?.ready).toBe(true));
    await waitFor(() => expect(device.registerDevice).toHaveBeenCalledTimes(1));
    const before = { register: device.registerDevice.mock.calls.length, channel: channel.prepareNotificationChannel.mock.calls.length, category: reminderPush.setupReminderCategory.mock.calls.length };

    await act(async () => { await latest.switchTo('family'); });
    await act(async () => { await latest.switchTo('personal'); });
    await act(async () => { await latest.switchTo('family'); });

    expect(device.registerDevice).toHaveBeenCalledTimes(before.register);
    expect(channel.prepareNotificationChannel).toHaveBeenCalledTimes(before.channel);
    expect(reminderPush.setupReminderCategory).toHaveBeenCalledTimes(before.category);
    expect(latest.scope).toBe('family');
  });
});
