// Wallet card colours. A wallet stores the theme's `id` (a hex) in `color`.
// Dark green is the default; wallets saved before themes existed map to it.

export type CardTheme = {
  id: string;
  name: string;
  gradient: readonly [string, string];
  /** Readable accent for icons, chart lines and dots on light backgrounds. */
  accent: string;
  glow: string;
};

export const CARD_THEMES: CardTheme[] = [
  { id: '#0F2F3A', name: 'Dark green', gradient: ['#0F2F3A', '#071820'], accent: '#00627F', glow: 'rgba(0,160,200,0.18)' },
  { id: '#0B3B66', name: 'Ocean',      gradient: ['#0B3B66', '#061A33'], accent: '#2563EB', glow: 'rgba(59,130,246,0.22)' },
  { id: '#14532D', name: 'Forest',     gradient: ['#14532D', '#062614'], accent: '#16A34A', glow: 'rgba(34,197,94,0.2)' },
  { id: '#0E5E5E', name: 'Teal sea',   gradient: ['#0E5E5E', '#052A2A'], accent: '#0D9488', glow: 'rgba(45,212,191,0.2)' },
  { id: '#1E293B', name: 'Midnight',   gradient: ['#1E293B', '#0B1220'], accent: '#0EA5E9', glow: 'rgba(56,189,248,0.2)' },
  { id: '#5B1A2A', name: 'Burgundy',   gradient: ['#5B1A2A', '#2A0A12'], accent: '#BE123C', glow: 'rgba(244,63,94,0.2)' },
  { id: '#5C3317', name: 'Copper',     gradient: ['#5C3317', '#2A1608'], accent: '#C2410C', glow: 'rgba(251,146,60,0.2)' },
  { id: '#2B2F36', name: 'Charcoal',   gradient: ['#2B2F36', '#111317'], accent: '#475569', glow: 'rgba(148,163,184,0.18)' },
];

export const DEFAULT_CARD_THEME = CARD_THEMES[0];

/** Theme for a stored wallet colour; unknown / legacy colours fall back to dark green. */
export const cardTheme = (color?: string | null): CardTheme =>
  CARD_THEMES.find(t => t.id.toLowerCase() === color?.toLowerCase()) ?? DEFAULT_CARD_THEME;
