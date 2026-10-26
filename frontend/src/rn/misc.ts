import { useEffect, useState } from 'react';

/** 'dark' when the browser or system asks for dark, else 'light'. */
export function useColorScheme(): 'light' | 'dark' {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
  const [dark, setDark] = useState(!!mq?.matches);
  useEffect(() => {
    if (!mq) return;
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mq]);
  return dark ? 'dark' : 'light';
}

/** Layout animations are not needed in the browser; screens still call configureNext before changing layout. */
export const LayoutAnimation = {
  configureNext: (_config?: unknown, _onEnd?: () => void) => {},
  create: (_d?: number, _t?: string, _p?: string) => ({}),
  Presets: { easeInEaseOut: {}, linear: {}, spring: {} },
  Types: { easeInEaseOut: 'easeInEaseOut', linear: 'linear', spring: 'spring' },
  Properties: { opacity: 'opacity', scaleXY: 'scaleXY' },
};

/** The browser dismisses its keyboard when a field loses focus. */
export const Keyboard = { dismiss: () => { (document.activeElement as HTMLElement | null)?.blur?.(); } };
