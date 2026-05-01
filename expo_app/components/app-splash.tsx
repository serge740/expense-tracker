import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Image } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay, withSequence,
  runOnJS, Easing,
} from 'react-native-reanimated';
import { Text } from '@/components/text';

const { width: W } = Dimensions.get('window');

interface Props { onComplete: () => void }

export function AppSplash({ onComplete }: Props) {
  // Individual animated values
  const rootOpacity  = useSharedValue(1);
  const rootScale    = useSharedValue(1);

  const glowScale    = useSharedValue(0.2);
  const glowOpacity  = useSharedValue(0);

  const logoScale    = useSharedValue(0.2);
  const logoOpacity  = useSharedValue(0);

  const abyOpacity   = useSharedValue(0);
  const abyY         = useSharedValue(28);

  const expOpacity   = useSharedValue(0);
  const expY         = useSharedValue(20);

  const lineWidth    = useSharedValue(0);
  const tagOpacity   = useSharedValue(0);

  useEffect(() => {
    // ── Glow ring expands slowly ──────────────────────────────────────────
    glowOpacity.value = withTiming(0.18, { duration: 900 });
    glowScale.value   = withTiming(2.2,  { duration: 2000, easing: Easing.out(Easing.quad) });

    // ── Logo bounces in ───────────────────────────────────────────────────
    logoOpacity.value = withDelay(80, withTiming(1, { duration: 280 }));
    logoScale.value   = withDelay(80, withSpring(1, { damping: 12, stiffness: 160 }));

    // ── "ABY" slides up + fades in ─────────────────────────────────────
    abyOpacity.value  = withDelay(320, withTiming(1, { duration: 380 }));
    abyY.value        = withDelay(320, withSpring(0, { damping: 20, stiffness: 220 }));

    // ── "EXPENSE" follows ─────────────────────────────────────────────
    expOpacity.value  = withDelay(460, withTiming(1, { duration: 360 }));
    expY.value        = withDelay(460, withSpring(0, { damping: 20, stiffness: 220 }));

    // ── Underline draws in ─────────────────────────────────────────────
    lineWidth.value   = withDelay(680, withTiming(W * 0.38, { duration: 450, easing: Easing.out(Easing.exp) }));

    // ── Tagline fades in ───────────────────────────────────────────────
    tagOpacity.value  = withDelay(900, withTiming(1, { duration: 420 }));

    // ── Whole screen fades + scales out ────────────────────────────────
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
  const abyStyle = useAnimatedStyle(() => ({
    opacity: abyOpacity.value,
    transform: [{ translateY: abyY.value }],
  }));
  const expStyle = useAnimatedStyle(() => ({
    opacity: expOpacity.value,
    transform: [{ translateY: expY.value }],
  }));
  const lineStyle  = useAnimatedStyle(() => ({ width: lineWidth.value }));
  const tagStyle   = useAnimatedStyle(() => ({ opacity: tagOpacity.value }));

  return (
    <Animated.View style={[s.root, rootStyle]} pointerEvents="none">
      {/* Soft glow ring */}
      <Animated.View style={[s.glow, glowStyle]} />

      {/* Logo */}
      <Animated.View style={[s.logoWrap, logoStyle]}>
        <Image
          source={require('@/assets/images/logo/dark.png')}
          style={s.logoImg}
          resizeMode="contain"
        />
      </Animated.View>

      {/* ABY */}
      <Animated.View style={abyStyle}>
        <Text style={s.brandMain}>ABY</Text>
      </Animated.View>

      {/* EXPENSE */}
      <Animated.View style={expStyle}>
        <Text style={s.brandSub}>EXPENSE</Text>
      </Animated.View>

      {/* Underline */}
      <Animated.View style={[s.line, lineStyle]} />

      {/* Tagline */}
      <Animated.View style={[s.tagWrap, tagStyle]}>
        <Text style={s.tagline}>Smart Money Management</Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2D336B',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#FFF2F2',
  },
  logoWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  logoImg: {
    width: 120,
    height: 120,
  },
  brandMain: {
    fontSize: 56,
    fontWeight: '900',
    color: '#FFF2F2',
    letterSpacing: 10,
    fontFamily: 'Poppins_800ExtraBold',
  },
  brandSub: {
    fontSize: 17,
    fontWeight: '300',
    color: 'rgba(255,242,242,0.65)',
    letterSpacing: 13,
    marginTop: -6,
    fontFamily: 'Poppins_300Light',
  },
  line: {
    height: 1.5,
    backgroundColor: 'rgba(255,242,242,0.30)',
    borderRadius: 1,
    marginTop: 20,
  },
  tagWrap: {
    marginTop: 18,
    alignItems: 'center',
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,242,242,0.50)',
    letterSpacing: 1.5,
    fontFamily: 'Poppins_300Light',
  },
});
