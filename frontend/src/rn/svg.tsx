/**
 * react-native-svg look-alikes. The browser draws SVG natively, so each one is the matching SVG element;
 * only the RN-style `style` prop needs translating.
 */
import type { CSSProperties, ReactNode } from 'react';
import { toCss, type RNStyle } from './style';

type Common = { children?: ReactNode; style?: RNStyle; pointerEvents?: string; [key: string]: unknown };

const css = (style?: RNStyle): CSSProperties | undefined => (style ? toCss(style) : undefined);

export default function Svg({ style, children, pointerEvents, ...rest }: Common) {
  const pe = pointerEvents === 'none' || pointerEvents === 'box-none' ? ({ pointerEvents: 'none' } as CSSProperties) : undefined;
  return <svg {...(rest as object)} style={{ flexShrink: 0, ...css(style), ...pe }}>{children}</svg>;
}
export { Svg };

const make = (Tag: 'path' | 'circle' | 'rect' | 'line' | 'g' | 'defs' | 'stop' | 'linearGradient' | 'radialGradient' | 'polygon' | 'polyline' | 'ellipse' | 'clipPath' | 'text') =>
  function SvgElement({ style, children, ...rest }: Common) {
    const T = Tag as 'path';
    return <T {...(rest as object)} style={css(style)}>{children}</T>;
  };

export const Path = make('path');
export const Circle = make('circle');
export const Rect = make('rect');
export const Line = make('line');
export const G = make('g');
export const Defs = make('defs');
export const Stop = make('stop');
export const Polygon = make('polygon');
export const Polyline = make('polyline');
export const Ellipse = make('ellipse');
export const ClipPath = make('clipPath');
export const SvgText = make('text');
export const LinearGradient = make('linearGradient');
export const RadialGradient = make('radialGradient');
