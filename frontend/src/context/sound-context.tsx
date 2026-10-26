import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePreferences, type Preferences } from '@/context/preferences-context';
import { useNotifications } from '@/context/notification-context';
import { createSoundEngine } from '@/lib/sound-engine';
import { startTabLeader } from '@/lib/tab-leader';

/** Whether a sound is allowed right now: not in the person's quiet hours (the window may cross midnight). */
export function soundAllowed(prefs: Pick<Preferences, 'notificationSound' | 'quietHours' | 'quietStart' | 'quietEnd'>, now: Date, urgent = false): boolean {
  if (prefs.notificationSound === 'silent') return false;
  if (!prefs.quietHours || urgent) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const { quietStart: s, quietEnd: e } = prefs;
  if (s === e) return true;
  const quiet = s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
  return !quiet;
}

interface SoundValue {
  /** The browser has blocked sound until the page is touched. */
  blocked: boolean;
  enableSound: () => Promise<boolean>;
  startRinging: (urgent?: boolean) => void;
  stopSound: () => void;
}

const SoundContext = createContext<SoundValue | null>(null);

const VIBRATE_PATTERN = [500, 300];

/**
 * Plays the chosen sound for each new notification (only in one open tab, so several tabs do not all ring) and
 * rings reminders on a loop until they are answered.
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePreferences();
  const { lastArrival } = useNotifications();
  const [blocked, setBlocked] = useState(false);
  const engine = useMemo(() => createSoundEngine({ onBlocked: () => setBlocked(true) }), []);
  const leader = useRef<ReturnType<typeof startTabLeader> | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    leader.current = startTabLeader();
    return () => { leader.current?.destroy(); leader.current = null; engine.stop(); };
  }, [engine]);

  // A new notification arrived while the app is open: ding, unless it is a reminder (those ring from their pop-up).
  useEffect(() => {
    if (!lastArrival || lastArrival.type === 'reminder') return;
    const p = prefsRef.current;
    if (!soundAllowed(p, new Date(), lastArrival.type === 'security') || !leader.current?.isLeader()) return;
    void engine.play(p.notificationSound);
    if (p.notificationVibrate) navigator.vibrate?.([200, 100, 200]);
  }, [lastArrival?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRinging = useCallback((urgent = false) => {
    const p = prefsRef.current;
    if (!soundAllowed(p, new Date(), urgent) || !leader.current?.isLeader()) return;
    void engine.playLoop(p.notificationSound);
  }, [engine]);

  const stopSound = useCallback(() => engine.stop(), [engine]);

  const enableSound = useCallback(async () => {
    const ok = await engine.play(prefsRef.current.notificationSound === 'silent' ? 'chime' : prefsRef.current.notificationSound, 0);
    if (ok) setBlocked(false);
    return ok;
  }, [engine]);

  const value = useMemo(() => ({ blocked, enableSound, startRinging, stopSound }), [blocked, enableSound, startRinging, stopSound]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound must be used inside a SoundProvider');
  return ctx;
}

/**
 * While `active`, a reminder rings on a loop and the device buzzes in a repeating pattern; both stop the moment it
 * is answered, closed or replaced. Vibration does not repeat by itself, so it is re-issued on a timer.
 */
export function useRinging(active: boolean, urgent = false) {
  const { startRinging, stopSound } = useSound();
  const vibrates = usePreferences().prefs.notificationVibrate;
  useEffect(() => {
    if (!active) return;
    startRinging(urgent);
    let timer: ReturnType<typeof setInterval> | null = null;
    if (vibrates && navigator.vibrate) {
      navigator.vibrate(VIBRATE_PATTERN);
      timer = setInterval(() => navigator.vibrate(VIBRATE_PATTERN), VIBRATE_PATTERN[0] + VIBRATE_PATTERN[1]);
    }
    return () => { stopSound(); if (timer) clearInterval(timer); navigator.vibrate?.(0); };
  }, [active, urgent, vibrates, startRinging, stopSound]);
}
