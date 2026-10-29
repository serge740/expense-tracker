// Ported from expo_app/constants/family-theme.ts
/** The colours that tell you "this is the family" at a glance. Personal keeps the brand teal. */
export const FAMILY_PURPLE = '#5B3FD0';
export const FAMILY_PURPLE_SOFT = '#A99BF0';         // lifted for text and icons on a dark background
export const FAMILY_PURPLE_DEEP = '#1B1238';         // the dark-mode header

export const FAMILY_LIGHT = {
  primary: FAMILY_PURPLE, primaryBg: 'rgba(91,63,208,0.10)', buttonBg: FAMILY_PURPLE, headerBg: FAMILY_PURPLE, tabBorder: 'rgba(91,63,208,0.12)',
} as const;

export const FAMILY_DARK = {
  primary: FAMILY_PURPLE_SOFT, primaryBg: 'rgba(169,155,240,0.16)', buttonBg: FAMILY_PURPLE, headerBg: FAMILY_PURPLE_DEEP, tabBorder: 'rgba(234,245,248,0.08)',
} as const;
