import React from 'react';
import { View, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Text } from '@/components/text';

interface Props {
  size?: number;
  color?: string;
  wordmark?: boolean;
  style?: StyleProp<ViewStyle>;
}

// White-on-transparent rabbit mark, tinted to any color.
export function RabbitLogo({ size = 88, color = '#00627F', wordmark = true, style }: Props) {
  return (
    <View style={[s.wrap, style]}>
      <Image
        source={require('@/assets/images/logo/rabbit.png')}
        style={{ width: size, height: size, tintColor: color }}
        resizeMode="contain"
      />
      {wordmark && (
        <Text style={[s.word, { color, fontSize: Math.max(14, size * 0.22), letterSpacing: size * 0.04 }]}>
          RABBIT
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center' },
  word: { fontWeight: '700', marginTop: 2 },
});
