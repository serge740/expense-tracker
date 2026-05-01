import React from 'react';
import { Text as RNText, TextProps, StyleSheet } from 'react-native';

const WEIGHT_MAP: Record<string, string> = {
  '100':   'Poppins_100Thin',
  '200':   'Poppins_200ExtraLight',
  '300':   'Poppins_300Light',
  '400':   'Poppins_400Regular',
  'normal':'Poppins_400Regular',
  '500':   'Poppins_500Medium',
  '600':   'Poppins_600SemiBold',
  '700':   'Poppins_700Bold',
  'bold':  'Poppins_700Bold',
  '800':   'Poppins_800ExtraBold',
  '900':   'Poppins_900Black',
};

export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style);
  const weight = (flat?.fontWeight as string) ?? '400';
  const fontFamily = WEIGHT_MAP[weight] ?? 'Poppins_400Regular';
  return <RNText style={[{ fontFamily }, style]} {...props} />;
}
