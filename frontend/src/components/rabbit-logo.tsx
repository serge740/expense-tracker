import { View, Text, type RNStyle } from '@/rn';

interface Props {
  size?: number;
  color?: string;
  wordmark?: boolean;
  style?: RNStyle;
}

const MARK = '/images/logo/rabbit.png';

/**
 * White-on-transparent rabbit mark, tinted to any colour. The tint is a CSS mask: the picture's shape
 * is filled with the colour, the same result as `tintColor` on the phone.
 */
export function RabbitLogo({ size = 88, color = '#00627F', wordmark = true, style }: Props) {
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      <div
        role="img" aria-label="Rabbit"
        style={{
          width: size, height: size, backgroundColor: color,
          WebkitMaskImage: `url(${MARK})`, maskImage: `url(${MARK})`,
          WebkitMaskSize: 'contain', maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center', maskPosition: 'center',
        }}
      />
      {wordmark && (
        <Text style={{ color, fontSize: Math.max(14, size * 0.22), letterSpacing: size * 0.04, fontWeight: '700', marginTop: 2 }}>
          RABBIT
        </Text>
      )}
    </View>
  );
}
