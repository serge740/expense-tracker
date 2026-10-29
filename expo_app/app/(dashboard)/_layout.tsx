import { useSegments, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { registerDevice } from '@/services/device.service';
import { NotificationProvider } from '@/context/notification-context';
import { prepareNotificationChannel, pushSoundConfig } from '@/services/local-notifications';
import { usePreferences } from '@/context/preferences-context';
import React, { useEffect, useRef } from 'react';
import { BackHandler, Alert } from 'react-native';
import { ScopedTabs } from '@/components/family/scoped-tabs';
import { ReminderModalHost } from '@/components/reminders/reminder-host';
import { handleReminderResponse, setupReminderCategory } from '@/services/reminder-push';
import { useReminderPrefsSync } from '@/hooks/use-reminder-prefs-sync';
import { useI18n } from '@/context/language-context';
import { ScopeProvider } from '@/context/scope-context';

// Segment names that correspond to the four visible tabs
const MAIN_TAB_SEGMENTS = new Set(['index', 'wallets', 'debts', 'profile']);

export default function DashboardLayout() {
  const segments = useSegments() as string[];
  const { prefs } = usePreferences();
  const { notificationSound, notificationVibrate } = prefs;
  const { t } = useI18n();

  // Time zone + language (and the one-time quiet-hours copy) go to the server so reminders use them.
  useReminderPrefsSync();

  // Snooze / Open buttons on reminder pushes (re-created when the language changes).
  useEffect(() => {
    setupReminderCategory({ snooze10: t('rem.actSnooze10'), snooze60: t('rem.actSnooze60'), open: t('rem.actOpen') }).catch(() => {});
  }, [t]);

  // Register for push (asks permission once) and tell the server which
  // sound/channel to ring with. Re-runs when the sound choice changes.
  useEffect(() => {
    prepareNotificationChannel(notificationSound, notificationVibrate)
      .catch(() => {})
      .finally(() => registerDevice(pushSoundConfig(notificationSound, notificationVibrate)));
  }, [notificationSound, notificationVibrate]);

  // Tapping a notification (even from a closed app): a reminder shows the popup or runs its button;
  // anything else opens the inbox. Each response is handled once.
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!lastResponse) return;
    const key = `${lastResponse.notification.request.identifier}:${lastResponse.actionIdentifier}`;
    if (handled.current === key) return;
    handled.current = key;
    handleReminderResponse(lastResponse).then(wasReminder => {
      if (!wasReminder && lastResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        router.push('/(dashboard)/(settings)/notifications');
      }
    });
  }, [lastResponse]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      // If we're anywhere inside the (settings) group let that layout handle it
      if (segments.includes('(settings)')) return false;

      // Determine if the user is on one of the four main tabs (or the root tab)
      const last = segments[segments.length - 1];
      const isOnMainTab =
        last === '(dashboard)' || MAIN_TAB_SEGMENTS.has(last);

      if (isOnMainTab) {
        Alert.alert(
          'Exit App',
          'Are you sure you want to exit?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
          ],
          { cancelable: true },
        );
        return true; // consume — dialog handles the rest
      }

      return false; // allow default (pops add/scan/history screens naturally)
    });

    return () => handler.remove();
  }, [segments]);

  return (
    <NotificationProvider>
    <ScopeProvider>
      <ScopedTabs />
      <ReminderModalHost />
    </ScopeProvider>
    </NotificationProvider>
  );
}
