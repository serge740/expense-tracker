import { useThemePreference } from '@/context/theme-context';

export interface AppTheme {
  background:    string;
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

// Deep Koamaru  #2D336B  — brand navy
// Lavender Blush #FFF2F2 — brand blush

const light: AppTheme = {
  background:    '#FFF2F2',           // Lavender Blush
  surface:       '#FFFFFF',
  primary:       '#2D336B',           // Deep Koamaru
  primaryBg:     'rgba(45,51,107,0.08)',
  buttonBg:      '#2D336B',
  headerBg:      '#2D336B',
  text:          '#2D336B',
  textSecondary: '#5A6190',
  textMuted:     '#9BA0BF',
  border:        'rgba(45,51,107,0.12)',
  income:        '#22C55E',
  expense:       '#EF4444',
  inputBg:       '#F7EFF0',
  tabBar:        '#FFFFFF',
  tabBorder:     'rgba(45,51,107,0.10)',
  isDark:        false,
};

const dark: AppTheme = {
  background:    '#131628',           // very dark navy (Deep Koamaru darkened)
  surface:       '#1C2042',           // dark navy card
  primary:       '#8B90D4',           // softened Deep Koamaru for dark bg contrast
  primaryBg:     'rgba(139,144,212,0.15)',
  buttonBg:      '#2D336B',           // Deep Koamaru button
  headerBg:      '#0D1022',           // deepest navy header
  text:          '#FFF2F2',           // Lavender Blush text on dark
  textSecondary: 'rgba(255,242,242,0.60)',
  textMuted:     'rgba(255,242,242,0.35)',
  border:        'rgba(255,242,242,0.08)',
  income:        '#4ADE80',
  expense:       '#F87171',
  inputBg:       '#171B36',
  tabBar:        '#131628',
  tabBorder:     'rgba(255,242,242,0.08)',
  isDark:        true,
};

export function useAppTheme(): AppTheme {
  const { resolvedScheme } = useThemePreference();
  return resolvedScheme === 'dark' ? dark : light;
}
