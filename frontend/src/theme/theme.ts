// Same tokens as the Expo app (hooks/use-app-theme.ts).
// Rabbit Teal #00627F is the brand primary; Mist Blue #DDF0F7 is the soft background tint.

export interface AppTheme {
  background: string;
  backgroundTop: string;
  surface: string;
  primary: string;
  primaryBg: string;
  buttonBg: string;
  headerBg: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  income: string;
  expense: string;
  inputBg: string;
  tabBar: string;
  tabBorder: string;
  isDark: boolean;
}

export const lightTheme: AppTheme = {
  background: '#EEF7FA',
  backgroundTop: '#DDF0F7',
  surface: '#FFFFFF',
  primary: '#00627F',
  primaryBg: 'rgba(0,98,127,0.08)',
  buttonBg: '#00627F',
  headerBg: '#00627F',
  text: '#0E2A33',
  textSecondary: '#5A7682',
  textMuted: '#9AB0B9',
  border: 'rgba(0,98,127,0.12)',
  income: '#22C55E',
  expense: '#EF4444',
  inputBg: '#F3F8FA',
  tabBar: '#FFFFFF',
  tabBorder: 'rgba(0,98,127,0.10)',
  isDark: false,
};

export const darkTheme: AppTheme = {
  background: '#0A1A20',
  backgroundTop: '#0F2731',
  surface: '#11262E',
  primary: '#5BB8D6',
  primaryBg: 'rgba(91,184,214,0.15)',
  buttonBg: '#00627F',
  headerBg: '#061217',
  text: '#EAF5F8',
  textSecondary: 'rgba(234,245,248,0.60)',
  textMuted: 'rgba(234,245,248,0.35)',
  border: 'rgba(234,245,248,0.08)',
  income: '#4ADE80',
  expense: '#F87171',
  inputBg: '#0E2129',
  tabBar: '#0A1A20',
  tabBorder: 'rgba(234,245,248,0.08)',
  isDark: true,
};
