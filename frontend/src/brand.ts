/**
 * Which logo the web app shows. 'aby' is the AbyEx logo (white background); 'rabbit' is the original rabbit,
 * whose files are all still in public/images/logo. To go back: set BRAND to 'rabbit', run
 * `node scripts/make-icons.mjs --brand rabbit`, and point the favicon in index.html and the manifest's background_color back.
 */
export type Brand = 'aby' | 'rabbit';
export const BRAND: Brand = 'aby';

/** The whole logo (mark + name), for the splash and the sign-in screens. */
export const LOGO_FULL = '/images/logo/aby-logo.png';
/** Just the mark, square, for small places. */
export const LOGO_ICON = BRAND === 'aby' ? '/images/logo/aby-icon.png' : '/images/logo/rabbit-icon.png';
