import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export type NotificationSound = 'default' | 'chime' | 'bell' | 'pop' | 'ding' | 'silent';

export const NOTIFICATION_SOUNDS: { id: NotificationSound; label: string }[] = [
  { id: 'default', label: 'System' },
  { id: 'chime',   label: 'Chime' },
  { id: 'bell',    label: 'Bell' },
  { id: 'ding',    label: 'Ding' },
  { id: 'pop',     label: 'Pop' },
  { id: 'silent',  label: 'Silent' },
];

// Files bundled via the expo-notifications plugin in app.json (assets/sounds).
const SOUND_FILE: Partial<Record<NotificationSound, string>> = {
  chime: 'chime.wav', bell: 'bell.wav', pop: 'pop.wav', ding: 'ding.wav',
};

// Show notifications as banners with sound even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Android fixes a channel's sound/vibration when the channel is created,
 * so each sound + vibration combination gets its own channel.
 */
export const channelIdFor = (sound: NotificationSound, vibrate: boolean) =>
  `alerts-${sound}${vibrate ? '' : '-novibrate'}`;

/** What the server should send with each push so it rings with the chosen sound. */
export function pushSoundConfig(sound: NotificationSound, vibrate: boolean) {
  return {
    channelId: channelIdFor(sound, vibrate),                       // Android
    sound: sound === 'silent' ? 'none' : SOUND_FILE[sound] ?? 'default', // iOS
  };
}

/** Create the channel for the current choice up front, so server pushes can use it. */
export async function prepareNotificationChannel(sound: NotificationSound, vibrate: boolean) {
  await ensureChannel(sound, vibrate);
}

async function ensureChannel(sound: NotificationSound, vibrate: boolean): Promise<string | undefined> {
  if (Platform.OS !== 'android') return undefined;
  const id = channelIdFor(sound, vibrate);
  await Notifications.setNotificationChannelAsync(id, {
    name: `Alerts (${NOTIFICATION_SOUNDS.find(s => s.id === sound)?.label ?? sound}${vibrate ? '' : ', no vibration'})`,
    importance: Notifications.AndroidImportance.MAX,
    sound: sound === 'silent' ? null : SOUND_FILE[sound] ?? 'default',
    enableVibrate: vibrate,
    vibrationPattern: vibrate ? [0, 250, 150, 250] : [0],
    lightColor: '#00627F',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  return id;
}

/** Asks for permission if needed. Returns true when notifications are allowed. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/**
 * Schedules a local notification. The OS delivers it even if the app is in
 * the background or fully closed.
 */
export async function scheduleLocalNotification(opts: {
  title: string;
  body: string;
  seconds: number;
  sound: NotificationSound;
  vibrate: boolean;
}): Promise<string> {
  const channelId = await ensureChannel(opts.sound, opts.vibrate);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: opts.title,
      body: opts.body,
      sound: opts.sound === 'silent' ? false : SOUND_FILE[opts.sound] ?? 'default',
      color: '#00627F',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, opts.seconds),
      channelId,
    },
  });
}
