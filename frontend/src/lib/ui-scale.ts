/** Text shrinks a little on narrow screens so it keeps its shape; a normal phone width (390px) and wider are untouched. */
export const REFERENCE_WIDTH = 390;
export const MIN_FONT_SCALE = 0.82;

export function fontScaleFor(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  return Math.round(Math.min(1, Math.max(MIN_FONT_SCALE, width / REFERENCE_WIDTH)) * 1000) / 1000;
}

/** Keeps `--fs` (read by every font size, see rn/style.ts) in step with the window width. */
export function startFontScale(): () => void {
  const apply = () => document.documentElement.style.setProperty('--fs', String(fontScaleFor(window.innerWidth)));
  apply();
  window.addEventListener('resize', apply);
  return () => window.removeEventListener('resize', apply);
}
