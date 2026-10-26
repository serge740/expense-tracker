export type NotificationSound = 'default' | 'chime' | 'bell' | 'pop' | 'ding' | 'silent';

export const NOTIFICATION_SOUNDS: { id: NotificationSound; label: string }[] = [
  { id: 'default', label: 'System' },
  { id: 'chime', label: 'Chime' },
  { id: 'bell', label: 'Bell' },
  { id: 'ding', label: 'Ding' },
  { id: 'pop', label: 'Pop' },
  { id: 'silent', label: 'Silent' },
];

/** The sound files copied from the phone app (public/sounds). "default" and "silent" have no file. */
export const SOUND_FILE: Partial<Record<NotificationSound, string>> = {
  chime: '/sounds/chime.wav',
  bell: '/sounds/bell.wav',
  pop: '/sounds/pop.wav',
  ding: '/sounds/ding.wav',
};
