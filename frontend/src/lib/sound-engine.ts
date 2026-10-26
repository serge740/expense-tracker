import { SOUND_FILE, type NotificationSound } from '@/lib/sounds';

const MIN_GAP_MS = 2000;

const urlFor = (sound: NotificationSound) => SOUND_FILE[sound] ?? SOUND_FILE.chime!;

/**
 * Plays one-shot dings (at most one every 2 seconds) and a continuously repeating ring, on separate audio
 * elements: a ding that arrives while a reminder rings must never cut the ring off. The ring restarts itself
 * when it ends instead of relying on the `loop` attribute, which some browsers do not honour for compressed
 * audio. Browsers may block sound until the person has touched the page; then `onBlocked` is called.
 */
export function createSoundEngine({ onBlocked }: { onBlocked?: () => void } = {}) {
  let last = 0;
  let current: HTMLAudioElement | null = null;
  const dings = new Map<string, HTMLAudioElement>();
  const rings = new Map<string, HTMLAudioElement>();
  let ringing: HTMLAudioElement | null = null;
  let ringActive = false;

  const get = (store: Map<string, HTMLAudioElement>, sound: NotificationSound, volume: number) => {
    const url = urlFor(sound);
    if (!store.has(url)) store.set(url, new Audio(url));
    const audio = store.get(url)!;
    audio.volume = Math.max(0, Math.min(1, volume));
    return audio;
  };
  const blocked = (err: unknown) => { if ((err as DOMException)?.name === 'NotAllowedError') onBlocked?.(); return false; };

  return {
    async play(sound: NotificationSound, volume = 1): Promise<boolean> {
      if (sound === 'silent') return false;
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return false;
      last = now;
      const audio = get(dings, sound, volume);
      if (current && current !== audio) current.pause();
      current = audio;
      audio.currentTime = 0;
      try { await audio.play(); return true; } catch (e) { return blocked(e); }
    },
    async playLoop(sound: NotificationSound, volume = 1): Promise<boolean> {
      if (sound === 'silent') return false;
      ringActive = true;
      const audio = get(rings, sound, volume);
      if (ringing && ringing !== audio) { ringing.onended = null; ringing.pause(); }
      ringing = audio;
      audio.onended = () => {
        if (!ringActive || ringing !== audio) return;
        audio.currentTime = 0;
        audio.play().catch(() => {});
      };
      audio.currentTime = 0;
      try { await audio.play(); return true; } catch (e) { return blocked(e); }
    },
    stop() {
      current?.pause();
      ringActive = false;
      ringing?.pause();
    },
  };
}
