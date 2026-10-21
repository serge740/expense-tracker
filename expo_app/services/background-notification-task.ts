import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

/*
 * Defined at module scope so it exists as soon as this file is imported, including when the OS
 * starts the app headless to hand over a push while it is in the background or closed. It is
 * imported at the top of app/_layout.tsx. Nothing is shown from here: the system tray already
 * shows the notification, and reminders are fetched from the server when the app opens.
 */
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ error }) => {
  if (error) console.warn('[push] background task error:', error);
});

/** Safe to call every launch; does nothing if it is already registered or the platform can't. */
export async function registerBackgroundNotificationTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK)) return;
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch { /* background delivery is not available in Expo Go or on web */ }
}
