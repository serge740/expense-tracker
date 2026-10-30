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
  /** A step darker than `surface`: tiles, segmented controls, skeletons (History). */
  surface2: string;
  /** Money in / out and warnings as a text colour and its soft background; always paired with a sign, icon or word. */
  positive: string; positiveTint: string;
  negative: string; negativeTint: string;
  warn: string; warnTint: string;
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
  surface2: '#E9F0F2',
  positive: '#0B7A4B', positiveTint: '#E0F3E8',
  negative: '#B3261E', negativeTint: '#FBE6E4',
  warn: '#8A5300', warnTint: '#FCEFD3',
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
  surface2: '#193640',
  positive: '#5BE08F', positiveTint: '#123A2A',
  negative: '#FF9D9A', negativeTint: '#41202A',
  warn: '#F5B84B', warnTint: '#3A2E12',
  isDark: true,
};
