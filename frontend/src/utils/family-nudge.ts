import { useEffect } from 'react';

const EVENT = 'family-changed';

/** The live channel says someone in the family changed something: open screens listen and refresh. */
export const announceFamilyChange = () => { try { window.dispatchEvent(new Event(EVENT)); } catch { /* not in a browser */ } };

/** Runs `refresh` (at most once every 1.5 s) whenever someone else in the family changes something. */
export function useFamilyNudge(refresh: () => void) {
  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      const wait = Math.max(0, 1500 - (Date.now() - last));
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; last = Date.now(); refresh(); }, wait);
    };
    window.addEventListener(EVENT, on);
    return () => { window.removeEventListener(EVENT, on); if (timer) clearTimeout(timer); };
  }, [refresh]);
}
