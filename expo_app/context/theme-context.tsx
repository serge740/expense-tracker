import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  resolvedScheme: 'light' | 'dark';
}

const STORAGE_KEY = '@aby_theme_preference';

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  setPreference: () => {},
  resolvedScheme: 'light',
});

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme() ?? 'light';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setPreferenceState(val);
      }
      setLoaded(true);
    });
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p);
  };

  const resolvedScheme = preference === 'system' ? system : preference;

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ preference, setPreference, resolvedScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemeContext);
}
