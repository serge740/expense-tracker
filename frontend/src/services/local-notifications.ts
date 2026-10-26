import { NOTIFICATION_SOUNDS, SOUND_FILE, type NotificationSound } from '@/lib/sounds';

export { NOTIFICATION_SOUNDS };
export type { NotificationSound };

/** The browser has no notification channels; kept so ported code can name one. */
export const channelIdFor = (sound: NotificationSound, vibrate: boolean) => `alerts-${sound}${vibrate ? '' : '-novibrate'}`;

/** What the server should send with each push so it rings with the chosen sound. */
export function pushSoundConfig(sound: NotificationSound, vibrate: boolean) {
  return { channelId: channelIdFor(sound, vibrate), sound: sound === 'silent' ? 'none' : sound };
}

/** Nothing to prepare in a browser. */
export async function prepareNotificationChannel(_sound: NotificationSound, _vibrate: boolean) {}

/** Plays one of the notification sounds. Browsers only allow it after the person has interacted with the page. */
export async function playNotificationSound(sound: NotificationSound, volume = 1): Promise<boolean> {
  const src = SOUND_FILE[sound];
  if (sound === 'silent') return false;
  try {
    const audio = new Audio(src ?? SOUND_FILE.chime);
    audio.volume = Math.max(0, Math.min(1, volume));
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

/** Asks for permission if needed. Returns true when notifications are allowed. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/**
 * Shows a notification after a delay. In a browser this works while the page is open (a closed page needs
 * web push, which comes with the PWA step).
 */
export async function scheduleLocalNotification(opts: {
  title: string;
  body: string;
  seconds: number;
  sound: NotificationSound;
  vibrate: boolean;
}): Promise<string> {
  const id = `local-${Date.now()}`;
  setTimeout(() => {
    try {
      new Notification(opts.title, { body: opts.body, icon: '/images/logo/rabbit-icon.png', silent: true, tag: id });
      if (opts.vibrate) navigator.vibrate?.([0, 250, 150, 250]);
    } catch { /* blocked */ }
    void playNotificationSound(opts.sound);
  }, Math.max(1, opts.seconds) * 1000);
  return id;
}
