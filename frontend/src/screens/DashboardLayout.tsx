import { useEffect } from 'react';
import { View } from '@/rn';
import { useAppTheme } from '@/theme/theme-context';
import { usePreferences } from '@/context/preferences-context';
import { NotificationProvider } from '@/context/notification-context';
import { PushProvider } from '@/context/push-context';
import { SoundProvider } from '@/context/sound-context';
import { InstallPrompt, NotificationToaster } from '@/components/push/prompts';
import { CustomTabBar } from '@/components/custom-tab-bar';
import { ScopeProvider } from '@/context/scope-context';
import { ScopedOutlet } from '@/components/family/scoped-outlet';
import { UpdateBanner } from '@/components/update-banner';
import { ReminderModalHost } from '@/components/reminders/reminder-host';
import { useReminderPrefsSync } from '@/hooks/use-reminder-prefs-sync';
import { registerDevice } from '@/services/device.service';
import { pushSoundConfig } from '@/services/local-notifications';
import { preloadMainScreens } from '@/routes';

/** Everything after sign-in: the screen on top, the tab bar underneath, and the things that run while signed in. */
export default function DashboardLayout() {
  const theme = useAppTheme();
  const { prefs } = usePreferences();
  const { notificationSound, notificationVibrate } = prefs;

  // Time zone + language (and the one-time quiet-hours copy) go to the server so reminders use them.
  useReminderPrefsSync();

  // The screens people open most load quietly in the background.
  useEffect(() => { preloadMainScreens(); }, []);

  // Tell the server this browser is signed in, and which sound it uses.
  useEffect(() => { void registerDevice(pushSoundConfig(notificationSound, notificationVibrate)); }, [notificationSound, notificationVibrate]);

  return (
    <PushProvider>
      <NotificationProvider>
        <SoundProvider>
          <ScopeProvider>
            <View style={{ flex: 1, backgroundColor: theme.background }}>
              <View style={{ flex: 1 }}>
                <ScopedOutlet />
              </View>
              <CustomTabBar />
            </View>
            <ReminderModalHost />
          </ScopeProvider>
          <NotificationToaster />
          <InstallPrompt />
          <UpdateBanner />
        </SoundProvider>
      </NotificationProvider>
    </PushProvider>
  );
}
