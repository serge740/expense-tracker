import React, { useState, useRef } from 'react';
import {
  View, TouchableOpacity, Dimensions,
  ScrollView, NativeSyntheticEvent, NativeScrollEvent,
  StatusBar, StyleSheet,
} from 'react-native';
import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { FadeInView } from '@/components/fade-in-view';

const { width } = Dimensions.get('window');
const BRAND = '#2D336B';

const SLIDES = [
  {
    id: 1,
    title: 'Manage your\nfinances easily',
    desc: 'Track expenses, scan receipts, and understand your spending — all in one place.',
  },
  {
    id: 2,
    title: 'Smart budget\ntracking',
    desc: 'Set monthly budgets per category and get notified before you overspend.',
  },
  {
    id: 3,
    title: 'Achieve your\nsavings goals',
    desc: 'Visualize spending trends and make better financial decisions every day.',
  },
];

export default function OnboardingScreen() {
  const theme     = useAppTheme();
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== idx) setIdx(i);
  };

  const next = () => {
    if (idx < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (idx + 1) * width, animated: true });
      setIdx(idx + 1);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND} />

      {/* ── Illustration area (top) ── */}
      <View style={s.top}>
        <View style={s.circleA} />
        <View style={s.circleB} />
        <View style={s.circleC} />

        {/* Shadow / back card */}
        <FadeInView delay={80} slideFrom="none">
          <View style={s.cardBack} />
        </FadeInView>

        {/* Main glass card */}
        <FadeInView delay={180} slideFrom="bottom" distance={30}>
          <View style={s.card}>
            <View style={s.cardGlow} />
            <Text style={s.cardLabel}>INCOME</Text>
            <Text style={s.cardAmount}>+$2,500</Text>
            <View style={s.cardFooter}>
              <View style={s.cardChip} />
              <Text style={s.cardNum}>•••• 4821</Text>
            </View>
          </View>
        </FadeInView>
      </View>

      {/* ── Bottom sheet ── */}
      <SafeAreaView edges={['bottom']} style={[s.sheet, { backgroundColor: theme.surface }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          scrollEnabled={false}
          style={{ width }}
        >
          {SLIDES.map(sl => (
            <View key={sl.id} style={[s.slide, { width }]}>
              <Text style={[s.slideTitle, { color: theme.text }]}>{sl.title}</Text>
              <Text style={[s.slideDesc, { color: theme.textSecondary }]}>{sl.desc}</Text>
            </View>
          ))}
        </ScrollView>

        <FadeInView delay={300} slideFrom="none">
          <View style={s.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[s.dot, {
                  backgroundColor: i === idx ? BRAND : theme.border,
                  width: i === idx ? 28 : 8,
                }]}
              />
            ))}
          </View>
        </FadeInView>

        <FadeInView delay={380} slideFrom="bottom" distance={18}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: BRAND }]}
            activeOpacity={0.85}
            onPress={() => idx === SLIDES.length - 1 ? router.replace('/(auth)') : next()}
          >
            <Text style={s.btnText}>
              {idx === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
          </TouchableOpacity>
        </FadeInView>

        <FadeInView delay={460} slideFrom="none">
          <View style={s.signRow}>
            <Text style={[s.signPrompt, { color: theme.textSecondary }]}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} activeOpacity={0.7}>
              <Text style={[s.signLink, { color: BRAND }]}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </FadeInView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  top: {
    flex: 1, backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  circleA: {
    position: 'absolute', width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -100, right: -80,
  },
  circleB: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -55, left: -55,
  },
  circleC: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.04)', top: '38%', left: '6%',
  },

  cardBack: {
    position: 'absolute',
    width: 234, height: 140, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    transform: [{ rotate: '-7deg' }, { translateY: 16 }],
  },
  card: {
    width: 244, borderRadius: 24, padding: 22,
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.30, shadowRadius: 26, elevation: 14,
  },
  cardGlow: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -46, right: -36,
  },
  cardLabel:  { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 6 },
  cardAmount: { fontSize: 34, fontWeight: '800', color: '#fff', marginBottom: 22 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardChip:   { width: 32, height: 22, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.28)' },
  cardNum:    { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '500', letterSpacing: 2 },

  sheet: {
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    paddingHorizontal: 28, paddingTop: 30, paddingBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 18, elevation: 14,
  },
  slide:      { paddingRight: 8 },
  slideTitle: { fontSize: 30, fontWeight: '800', marginBottom: 10, lineHeight: 38 },
  slideDesc:  { fontSize: 15, lineHeight: 24 },

  dots: { flexDirection: 'row', gap: 6, marginTop: 22, marginBottom: 24 },
  dot:  { height: 8, borderRadius: 4 },

  btn: {
    borderRadius: 18, paddingVertical: 17, alignItems: 'center',
    shadowColor: BRAND, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.30, shadowRadius: 14, elevation: 7,
  },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  signRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, marginBottom: 6 },
  signPrompt: { fontSize: 14 },
  signLink:   { fontSize: 14, fontWeight: '700' },
});
