/**
 * Turns a React Native style object into a CSS style object, so screens ported from the Expo app can keep
 * their StyleSheet values as they are. Only what differs between the two is handled here: padding/margin
 * shorthands, shadows, transforms, line-height in pixels and the default border style.
 */
import type { CSSProperties } from 'react';

export type RNStyle = Record<string, any> | false | null | undefined | RNStyle[];

export function flatten(style: RNStyle): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce<Record<string, any>>((acc, s) => Object.assign(acc, flatten(s)), {});
  return { ...style };
}

/** StyleSheet.create is the identity in React Native too; it only gives the editor something to check. */
export const StyleSheet = {
  create: <T extends Record<string, any>>(styles: T): T => styles,
  flatten,
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as Record<string, any>,
  hairlineWidth: 1,
};

/** "#00627F" or "#0F3" or "rgb(…)" + opacity → an rgba() colour. */
export function withOpacity(color: string, opacity: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (rgb) {
    const [r, g, b, a] = rgb[1].split(',').map(p => p.trim());
    return `rgba(${r}, ${g}, ${b}, ${(a === undefined ? 1 : Number(a)) * opacity})`;
  }
  return color;
}

const px = (v: unknown) => (typeof v === 'number' ? `${v}px` : (v as string));

function transformOf(list: unknown): string | undefined {
  if (typeof list === 'string') return list;
  if (!Array.isArray(list)) return undefined;
  return list
    .map(t => {
      const [key, value] = Object.entries(t as Record<string, unknown>)[0];
      if (key === 'scale' || key === 'scaleX' || key === 'scaleY') return `${key}(${value})`;
      if (key.startsWith('translate') || key === 'perspective') return `${key}(${px(value)})`;
      return `${key}(${value})`;
    })
    .join(' ');
}

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;

function expandBox(out: Record<string, any>, s: Record<string, any>, prop: 'padding' | 'margin') {
  const has = [prop, `${prop}Horizontal`, `${prop}Vertical`, ...SIDES.map(x => prop + x)].some(k => s[k] !== undefined);
  if (!has) return;
  // Precedence in React Native: a single side beats horizontal/vertical, which beats the shorthand.
  const all = s[prop];
  const h = s[`${prop}Horizontal`] ?? all;
  const v = s[`${prop}Vertical`] ?? all;
  const values: Record<(typeof SIDES)[number], unknown> = {
    Top: s[`${prop}Top`] ?? v,
    Bottom: s[`${prop}Bottom`] ?? v,
    Left: s[`${prop}Left`] ?? s[`${prop}Start`] ?? h,
    Right: s[`${prop}Right`] ?? s[`${prop}End`] ?? h,
  };
  for (const side of SIDES) if (values[side] !== undefined) out[prop + side] = values[side];
  for (const k of [prop, `${prop}Horizontal`, `${prop}Vertical`, `${prop}Start`, `${prop}End`]) delete out[k];
}

const DROPPED = ['elevation', 'textAlignVertical', 'includeFontPadding', 'resizeMode', 'tintColor', 'overlayColor', 'writingDirection'];

export function toCss(style: RNStyle): CSSProperties {
  const s = flatten(style);
  const out: Record<string, any> = { ...s };

  expandBox(out, s, 'padding');
  expandBox(out, s, 'margin');

  // Shadows: React Native draws one only when the opacity is above zero.
  if (s.shadowColor !== undefined || s.shadowOpacity !== undefined || s.shadowRadius !== undefined || s.shadowOffset !== undefined) {
    const opacity = s.shadowOpacity ?? 0;
    if (opacity > 0) {
      const { width = 0, height = 0 } = s.shadowOffset ?? {};
      const colour = withOpacity(s.shadowColor ?? '#000', opacity);
      const shadow = `${width}px ${height}px ${s.shadowRadius ?? 0}px ${colour}`;
      out.boxShadow = out.boxShadow ? `${out.boxShadow}, ${shadow}` : shadow;
    }
    for (const k of ['shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius']) delete out[k];
  }

  if (out.transform !== undefined) out.transform = transformOf(out.transform);
  if (typeof out.lineHeight === 'number') out.lineHeight = `${out.lineHeight}px`;
  if (Array.isArray(out.fontVariant)) {
    out.fontVariantNumeric = out.fontVariant.includes('tabular-nums') ? 'tabular-nums' : undefined;
    delete out.fontVariant;
  }
  if (out.textDecorationLine !== undefined) { out.textDecoration = out.textDecorationLine; delete out.textDecorationLine; }
  if (typeof out.fontWeight === 'number') out.fontWeight = String(out.fontWeight);

  // The phone app names Poppins by weight (Poppins_600SemiBold); on the web one family has every weight.
  const poppins = typeof out.fontFamily === 'string' ? /^Poppins_(\d{3})/.exec(out.fontFamily) : null;
  if (poppins) {
    out.fontFamily = 'Poppins, system-ui, sans-serif';
    if (out.fontWeight === undefined) out.fontWeight = poppins[1];
  }

  // A width without a style draws nothing in CSS; React Native always draws it solid.
  const hasBorder = Object.keys(out).some(k => /^border(Top|Right|Bottom|Left)?Width$/.test(k) && out[k]);
  if (hasBorder && out.borderStyle === undefined) out.borderStyle = 'solid';
  // Sides with no width are 0 in React Native, but CSS gives a solid border a 3px default.
  if (hasBorder && out.borderWidth === undefined) {
    for (const side of SIDES) if (out[`border${side}Width`] === undefined) out[`border${side}Width`] = 0;
  }

  for (const k of DROPPED) delete out[k];
  return out as CSSProperties;
}
