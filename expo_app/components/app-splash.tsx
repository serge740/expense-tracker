import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay,
  runOnJS, Easing,
} from 'react-native-reanimated';
import { Text } from '@/components/text';
import { RabbitLogo } from '@/components/rabbit-logo';

const BRAND = '#00627F';

interface Props { onComplete: () => void }

export function AppSplash({ onComplete }: Props) {
  const rootOpacity = useSharedValue(1);
  const rootScale   = useSharedValue(1);

  const glowScale   = useSharedValue(0.4);
  const glowOpacity = useSharedValue(0);

  const logoScale   = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);

  const subOpacity  = useSharedValue(0);
  const subY        = useSharedValue(14);

  useEffect(() => {
    // ── Soft circle grows in behind the rabbit ────────────────────────────
    glowOpacity.value = withTiming(1, { duration: 700 });
    glowScale.value   = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });

    // ── Rabbit + wordmark bounce in ───────────────────────────────────────
    logoOpacity.value = withDelay(120, withTiming(1, { duration: 300 }));
    logoScale.value   = withDelay(120, withSpring(1, { damping: 12, stiffness: 160 }));

    // ── "TRACKER" follows ────────────────────────────────────────────────
    subOpacity.value  = withDelay(520, withTiming(1, { duration: 380 }));
    subY.value        = withDelay(520, withSpring(0, { damping: 20, stiffness: 220 }));

    // ── Whole screen fades + scales out ──────────────────────────────────
    rootOpacity.value = withDelay(1900,
      withTiming(0, { duration: 480, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) runOnJS(onComplete)();
      }),
    );
    rootScale.value   = withDelay(1900, withTiming(1.07, { duration: 480 }));
  }, []);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: rootOpacity.value,
    transform: [{ scale: rootScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
    transform: [{ translateY: subY.value }],
  }));

  return (
    <Animated.View style={[s.root, rootStyle]} pointerEvents="none">
      <Animated.View style={[s.glow, glowStyle]} />

      <Animated.View style={logoStyle}>
        <RabbitLogo size={132} color="#FFFFFF" />
      </Animated.View>

      <Animated.View style={subStyle}>
        <Text style={s.sub}>TRACKER</Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  // Offset up-left of the rabbit, like the brand mark
  glow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginLeft: -90,
    marginTop: -50,
  },
  sub: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 8,
    marginTop: 4,
    marginLeft: 8,
  },
});
