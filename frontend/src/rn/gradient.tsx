import type { CSSProperties, ReactNode } from 'react';
import { toCss, type RNStyle } from './style';

type Point = { x: number; y: number };

/** CSS angle for a start→end vector given in 0..1 box coordinates (y grows downward). 0deg is "to top". */
export function gradientAngle(start: Point = { x: 0.5, y: 0 }, end: Point = { x: 0.5, y: 1 }): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.round((Math.atan2(dx, -dy) * 180) / Math.PI * 100) / 100;
}

export function gradientCss(colors: readonly string[], start?: Point, end?: Point, locations?: readonly number[] | null): string {
  const stops = colors.map((c, i) => (locations && locations[i] !== undefined ? `${c} ${Math.round(locations[i] * 10000) / 100}%` : c));
  return `linear-gradient(${gradientAngle(start, end)}deg, ${stops.join(', ')})`;
}

/** Same props as expo-linear-gradient's LinearGradient. */
export function LinearGradient({ colors, start, end, locations, style, children, pointerEvents }: {
  colors: readonly string[]; start?: Point | [number, number]; end?: Point | [number, number]; locations?: readonly number[] | null; style?: RNStyle; children?: ReactNode; pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}) {
  const pt = (p?: Point | [number, number]): Point | undefined => (Array.isArray(p) ? { x: p[0], y: p[1] } : p);
  const css: CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', position: 'relative', boxSizing: 'border-box', flexShrink: 0, minWidth: 0, minHeight: 0,
    ...toCss(style),
    backgroundImage: gradientCss(colors, pt(start), pt(end), locations),
    ...(pointerEvents === 'none' || pointerEvents === 'box-none' ? { pointerEvents: 'none' as const } : {}),
  };
  return <div style={css}>{children}</div>;
}
