import { useThemePreference } from '@/context/theme-context';

export interface AppTheme {
  background:    string;
  backgroundTop: string;
  surface:       string;
  primary:       string;
  primaryBg:     string;
  buttonBg:      string;
  headerBg:      string;
  text:          string;
  textSecondary: string;
  textMuted:     string;
  border:        string;
  income:        string;
  expense:       string;
  inputBg:       string;
  tabBar:        string;
  tabBorder:     string;
  isDark:        boolean;
}

// Rabbit Teal  #00627F — brand primary
// Mist Blue    #DDF0F7 — soft background tint

const light: AppTheme = {
  background:    '#EEF7FA',           // Mist (fades from backgroundTop)
  backgroundTop: '#DDF0F7',           // Mist Blue
  surface:       '#FFFFFF',
  primary:       '#00627F',           // Rabbit Teal
  primaryBg:     'rgba(0,98,127,0.08)',
  buttonBg:      '#00627F',
  headerBg:      '#00627F',
  text:          '#0E2A33',
  textSecondary: '#5A7682',
  textMuted:     '#9AB0B9',
  border:        'rgba(0,98,127,0.12)',
  income:        '#22C55E',
  expense:       '#EF4444',
  inputBg:       '#F3F8FA',
  tabBar:        '#FFFFFF',
  tabBorder:     'rgba(0,98,127,0.10)',
  isDark:        false,
};

const dark: AppTheme = {
  background:    '#0A1A20',           // deep teal-black
  backgroundTop: '#0F2731',
  surface:       '#11262E',           // dark teal card
  primary:       '#5BB8D6',           // lifted Rabbit Teal for dark bg contrast
  primaryBg:     'rgba(91,184,214,0.15)',
  buttonBg:      '#00627F',           // Rabbit Teal button
  headerBg:      '#061217',
  text:          '#EAF5F8',
  textSecondary: 'rgba(234,245,248,0.60)',
  textMuted:     'rgba(234,245,248,0.35)',
  border:        'rgba(234,245,248,0.08)',
  income:        '#4ADE80',
  expense:       '#F87171',
  inputBg:       '#0E2129',
  tabBar:        '#0A1A20',
  tabBorder:     'rgba(234,245,248,0.08)',
  isDark:        true,
};

export function useAppTheme(): AppTheme {
  const { resolvedScheme } = useThemePreference();
  return resolvedScheme === 'dark' ? dark : light;
}
