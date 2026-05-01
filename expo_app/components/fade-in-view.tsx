import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withDelay, withSpring,
} from 'react-native-reanimated';

interface Props {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  slideFrom?: 'bottom' | 'top' | 'left' | 'right' | 'none';
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

export function FadeInView({
  children,
  delay = 0,
  duration = 420,
  slideFrom = 'bottom',
  distance = 22,
  style,
}: Props) {
  const opacity    = useSharedValue(0);
  const translateX = useSharedValue(slideFrom === 'left' ? -distance : slideFrom === 'right' ? distance : 0);
  const translateY = useSharedValue(slideFrom === 'bottom' ? distance : slideFrom === 'top' ? -distance : 0);

  useEffect(() => {
    opacity.value    = withDelay(delay, withTiming(1,  { duration }));
    translateX.value = withDelay(delay, withSpring(0,  { damping: 22, stiffness: 220 }));
    translateY.value = withDelay(delay, withSpring(0,  { damping: 22, stiffness: 220 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
}
