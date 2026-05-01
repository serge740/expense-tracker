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

const SLIDES = [
  {
    id: 1,
    title: 'Manage your\nfinances easily',
    desc: 'Track expenses, scan receipts, and understand your spending — all in one place.',
    icon: 'account-balance-wallet',
  },
  {
    id: 2,
    title: 'Smart budget\ntracking',
    desc: 'Set monthly budgets per category and get notified before you overspend.',
    icon: 'bar-chart',
  },
  {
    id: 3,
    title: 'Achieve your\nsavings goals',
    desc: 'Visualize spending trends and make better financial decisions every day.',
    icon: 'trending-up',
  },
];

export default function OnboardingScreen() {
  const theme    = useAppTheme();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
      setIndex(index + 1);
    }
  };

  const illustrationBg = '#2D336B';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={illustrationBg} />

      {/* Top illustration area */}
      <View style={[styles.illustrationArea, { backgroundColor: illustrationBg }]}>
        {/* Decorative circles */}
        <View style={styles.decorCircleTR} />
        <View style={styles.decorCircleBL} />
        <View style={styles.decorCircleMid} />

        {/* Back card */}
        <FadeInView delay={100} slideFrom="none">
          <View style={styles.cardBack} />
        </FadeInView>

        {/* Main glass card */}
        <FadeInView delay={180} slideFrom="bottom" distance={30}>
          <View style={styles.card}>
            <View style={styles.cardGlow} />
            <Text style={styles.cardLabel}>INCOME</Text>
            <Text style={styles.cardAmount}>+$2,500</Text>
            <View style={styles.cardFooter}>
              <View style={styles.cardChip} />
              <Text style={styles.cardNumber}>•••• 4821</Text>
            </View>
          </View>
        </FadeInView>
      </View>

      {/* Bottom sheet */}
      <SafeAreaView
        edges={['bottom']}
        style={[styles.bottomSheet, { backgroundColor: theme.surface }]}
      >
        {/* Slide content */}
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
          {SLIDES.map(s => (
            <View key={s.id} style={[styles.slide, { width }]}>
              <Text style={[styles.slideTitle, { color: theme.text }]}>{s.title}</Text>
              <Text style={[styles.slideDesc, { color: theme.textSecondary }]}>{s.desc}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <FadeInView delay={300} slideFrom="none">
          <View style={styles.dotsRow}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === index ? theme.buttonBg : theme.border,
                    width: i === index ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>
        </FadeInView>

        <FadeInView delay={380} slideFrom="bottom" distance={18}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.buttonBg }]}
            activeOpacity={0.85}
            onPress={() =>
              index === SLIDES.length - 1 ? router.replace('/(auth)') : next()
            }
          >
            <Text style={styles.primaryBtnText}>
              {index === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
          </TouchableOpacity>
        </FadeInView>

        <FadeInView delay={460} slideFrom="none">
          <View style={styles.signInRow}>
            <Text style={[styles.signInPrompt, { color: theme.textSecondary }]}>
              Already have an account?{' '}
            </Text>
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              activeOpacity={0.7}
            >
              <Text style={[styles.signInLink, { color: theme.buttonBg }]}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </FadeInView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  illustrationArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  decorCircleTR: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.1)', top: -80, right: -70,
  },
  decorCircleBL: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: -50, left: -50,
  },
  decorCircleMid: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)', top: '35%', left: '10%',
  },

  cardBack: {
    position: 'absolute',
    width: 220, height: 130, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    transform: [{ rotate: '-6deg' }, { translateY: 20 }],
  },
  card: {
    width: 230, borderRadius: 22, padding: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  cardGlow: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -40, right: -30,
  },
  cardLabel: {
    fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.5, marginBottom: 8,
  },
  cardAmount: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginBottom: 22 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardChip: { width: 30, height: 22, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.3)' },
  cardNumber: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500', letterSpacing: 1.5 },

  bottomSheet: {
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 28, paddingTop: 28, paddingBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 12,
  },
  slide: { paddingRight: 8 },
  slideTitle: { fontSize: 28, fontWeight: '800', marginBottom: 10, lineHeight: 36 },
  slideDesc:  { fontSize: 15, lineHeight: 24 },

  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 24, marginBottom: 26 },
  dot:     { height: 8, borderRadius: 4 },

  primaryBtn: {
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#2D336B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  signInRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: 20, marginBottom: 8,
  },
  signInPrompt: { fontSize: 14 },
  signInLink:   { fontSize: 14, fontWeight: '700' },
});
