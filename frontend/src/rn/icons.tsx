import { toCss, type RNStyle } from './style';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: RNStyle;
}

/**
 * The Expo app names icons like "shopping-cart"; the font's ligatures are spelled "shopping_cart".
 * Same icon set, so every icon looks the same on both.
 */
export function MaterialIcons({ name, size = 24, color = '#000', style }: IconProps) {
  return (
    <span
      className="material-icons" aria-hidden="true"
      style={{ fontSize: size, width: size, height: size, lineHeight: `${size}px`, color, overflow: 'hidden', textAlign: 'center', ...toCss(style) }}
    >
      {name.replace(/-/g, '_')}
    </span>
  );
}
