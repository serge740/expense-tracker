import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { darkTheme, lightTheme, type AppTheme } from './theme';
import { storage } from '@/lib/storage';
import { useScope } from '@/context/scope-context';
import { FAMILY_DARK, FAMILY_LIGHT } from '@/constants/family-theme';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  resolvedScheme: 'light' | 'dark';
}

const STORAGE_KEY = '@aby_theme_preference'; // same key the phone app uses

const ThemeContext = createContext<ThemeContextValue>({ preference: 'system', setPreference: () => {}, resolvedScheme: 'light' });

const systemScheme = () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [system, setSystem] = useState<'light' | 'dark'>(systemScheme);
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const saved = storage.get(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolvedScheme = preference === 'system' ? system : preference;
  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedScheme,
    setPreference: p => { setPreferenceState(p); storage.set(STORAGE_KEY, p); },
  }), [preference, resolvedScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useThemePreference = () => useContext(ThemeContext);

const familyLight: AppTheme = { ...lightTheme, ...FAMILY_LIGHT };
const familyDark: AppTheme = { ...darkTheme, ...FAMILY_DARK };

/** The app's colours. Inside a family the brand teal becomes the family purple, so the two spaces are never confused. */
export function useAppTheme(): AppTheme {
  const dark = useThemePreference().resolvedScheme === 'dark';
  const { isFamily } = useScope();
  if (dark) return isFamily ? familyDark : darkTheme;
  return isFamily ? familyLight : lightTheme;
}
