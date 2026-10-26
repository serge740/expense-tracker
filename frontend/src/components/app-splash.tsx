import { useEffect } from 'react';
import { View, Text, Image, StyleSheet } from '@/rn';
import { BRAND as LOGO_SET, LOGO_FULL } from '@/brand';
import { RabbitLogo } from './rabbit-logo';

const BRAND = '#00627F';

/**
 * The opening animation: a soft circle grows behind the rabbit, the rabbit bounces in, "TRACKER" follows,
 * then everything fades and grows slightly as it leaves. Same timings as the phone app (1.9 s hold, 0.48 s out).
 */
export function AppSplash({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const t = setTimeout(onComplete, 1900 + 480);
    return () => clearTimeout(t);
  }, [onComplete]);

  // The AbyExpense logo comes in on plain white; the rabbit splash below is kept for going back (see brand.ts).
  if (LOGO_SET === 'aby') {
    return (
      <View pointerEvents="none" style={[s.root, { backgroundColor: '#FFFFFF', animation: 'splash-out 480ms cubic-bezier(0.55, 0, 1, 0.45) 1900ms both' }]}>
        <View style={{ animation: 'splash-logo 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 120ms both' }}>
          <Image source={LOGO_FULL} style={{ width: 260, height: 177 }} resizeMode="contain" accessibilityLabel="AbyExpense" />
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={[s.root, { animation: 'splash-out 480ms cubic-bezier(0.55, 0, 1, 0.45) 1900ms both' }]}>
      <View style={[s.glow, { animation: 'splash-glow 1100ms cubic-bezier(0.215, 0.61, 0.355, 1) both' }]} />
      <View style={{ animation: 'splash-logo 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 120ms both' }}>
        <RabbitLogo size={132} color="#FFFFFF" />
      </View>
      <View style={{ animation: 'splash-sub 420ms cubic-bezier(0.22, 1, 0.36, 1) 520ms both' }}>
        <Text style={s.sub}>TRACKER</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  // Offset up-left of the rabbit, like the brand mark
  glow: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)', marginLeft: -90, marginTop: -50 },
  sub: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.65)', letterSpacing: 8, marginTop: 4, marginLeft: 8 },
});
