import { View, Image, type RNStyle } from '@/rn';
import { BRAND, LOGO_FULL } from '@/brand';
import { RabbitLogo } from './rabbit-logo';

// aby-logo.png is 640 x 436 (see scripts/make-brand.mjs)
const RATIO = 640 / 436;

/**
 * The logo at the top of the sign-in screens. `size` is the height of the mark in the old rabbit layout, so the
 * screens did not need to change: the AbyEx logo (mark and name together) is drawn about twice that tall.
 */
export function BrandLogo({ size = 56, color = '#00627F', style }: { size?: number; color?: string; style?: RNStyle }) {
  if (BRAND === 'rabbit') return <RabbitLogo size={size} color={color} style={style} />;
  const height = Math.round(size * 1.9);
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      <Image source={LOGO_FULL} style={{ width: Math.round(height * RATIO), height }} resizeMode="contain" accessibilityLabel="AbyEx" />
    </View>
  );
}
