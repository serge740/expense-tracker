import { useColorScheme } from '@/hooks/use-color-scheme';

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

const light: AppTheme = {
  background:    '#F0F2FF',
  surface:       '#FFFFFF',
  primary:       '#2D336B',
  primaryBg:     'rgba(45,51,107,0.08)',
  buttonBg:      '#2D336B',
  headerBg:      '#1E2460',
  text:          '#1A1F4A',
  textSecondary: '#6B7399',
  textMuted:     '#9BA3C8',
  border:        '#E4E6F4',
  income:        '#22C55E',
  expense:       '#EF4444',
  inputBg:       '#F5F6FC',
  tabBar:        '#FFFFFF',
  tabBorder:     '#E4E6F4',
  isDark:        false,
};

const dark: AppTheme = {
  background:    '#0F0F1A',
  surface:       '#1A1A2A',
  primary:       '#7B5CF0',
  primaryBg:     'rgba(123,92,240,0.15)',
  buttonBg:      '#7B5CF0',
  headerBg:      '#1A1A2A',
  text:          '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.55)',
  textMuted:     'rgba(255,255,255,0.32)',
  border:        '#2A2A40',
  income:        '#4ADE80',
  expense:       '#F87171',
  inputBg:       '#1C1C28',
  tabBar:        '#0F0F1A',
  tabBorder:     '#2A2A40',
  isDark:        true,
};

export function useAppTheme(): AppTheme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}
