import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useI18n } from '@/context/language-context';
import { DEFAULT_PREFERENCES, STORAGE_KEY } from '@/context/preferences-context';
import { getNotificationPreferences, updateNotificationPreferences } from '@/services/notification.service';
import { deviceTimeZone, quietMigrationPatch, zoneLanguagePatch } from '@/utils/reminders';

const MIGRATED_KEY = 'quiet_hours_to_server_v1';

/**
 * Keeps the server's reminder settings in step with this phone: the time zone (so daily times and quiet
 * hours are right wherever you are) and the app language (so reminder text is in it). Also copies the
 * old phone-only quiet hours to the server once.
 */
export function useReminderPrefsSync() {
  const { language } = useI18n();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const server = await getNotificationPreferences();
        const migrated = (await AsyncStorage.getItem(MIGRATED_KEY)) === '1';

        // Read the saved phone settings directly: the provider may not have loaded them yet.
        const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
        const local = { ...DEFAULT_PREFERENCES, ...(raw ? JSON.parse(raw) : {}) };

        const patch = {
          ...zoneLanguagePatch({ timezone: deviceTimeZone(), language }, server),
          ...quietMigrationPatch(local, server, migrated),
        };
        if (Object.keys(patch).length) await updateNotificationPreferences(patch);
        if (alive && !migrated) await AsyncStorage.setItem(MIGRATED_KEY, '1');
      } catch { /* offline: try again next launch */ }
    })();
    return () => { alive = false; };
  }, [language]);
}
