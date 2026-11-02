import React, { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { usePwaInstall } from '@/context/pwa-install-context';
import { isIosSafari } from '@/lib/platform';
import { storage } from '@/lib/storage';
import { LOGO_FULL } from '@/brand';
import type { StringKey } from '@/i18n/strings';

/**
 * iPhones have no Install button. This is the guide that shows the three taps instead: it opens by itself once for someone on an
 * iPhone who has not installed the app yet, and any time from the "Install app" row in Settings.
 */
const EVENT = 'abyex:ios-install-guide';
const SEEN_KEY = 'iosInstallGuideSeen';

export const openIosInstallGuide = () => { try { window.dispatchEvent(new Event(EVENT)); } catch { /* not in a browser */ } };

const SHOTS: Array<{ src: string; ratio: number }> = [
  { src: '/images/pwa-guide/step-1.png', ratio: 499 / 540 },
  { src: '/images/pwa-guide/step-2.png', ratio: 1080 / 805 },
  { src: '/images/pwa-guide/step-3.png', ratio: 499 / 400 },
];
const LAST = 3;

/** Mounted once in the dashboard: listens for "open the guide" and offers it once by itself. */
export function IosInstallGuideHost() {
  const { isInstalled, isIos } = usePwaInstall();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, []);

  // Offered once, a few seconds after opening the app on an iPhone that has not got it installed.
  useEffect(() => {
    if (isInstalled || !isIos() || storage.get(SEEN_KEY) === '1') return;
    const id = setTimeout(() => setOpen(true), 5000);
    return () => clearTimeout(id);
  }, [isInstalled, isIos]);

  const close = () => { storage.set(SEEN_KEY, '1'); setOpen(false); };
  if (!open || isInstalled) return null;
  return <IosInstallGuide onClose={close} />;
}

export function IosInstallGuide({ onClose }: { onClose: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const safari = isIosSafari();
  const wrong = i === 0 && !safari;
  const k = (key: string) => t(`pwa.ios.${key}` as StringKey);

  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.origin); } catch { /* the link is still on screen */ }
    setCopied(true);
  };
  const next = () => { if (wrong) void copy(); else if (i === LAST) onClose(); else setI(i + 1); };
  const accent = theme.primary;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel={t('toast.close')} />
        <View testID="ios-guide" style={[s.sheet, { backgroundColor: theme.surface }]}>
          <View style={[s.grab, { backgroundColor: theme.border }]} />
          <View style={s.head}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: theme.text }}>{k('title')}</Text>
            <TouchableOpacity testID="ios-guide-close" onPress={onClose} style={s.x} accessibilityRole="button" accessibilityLabel={t('toast.close')}><MaterialIcons name="close" size={24} color={theme.text} /></TouchableOpacity>
          </View>
          <View style={s.progress}>
            {[0, 1, 2, 3].map(n => <View key={n} style={[s.seg, { backgroundColor: n <= i ? accent : theme.border }]} />)}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            {i === 0 ? (
              <View testID="ios-guide-intro">
                <Image source={LOGO_FULL} style={s.logo} resizeMode="contain" accessibilityLabel="AbyEx" />
                <Text style={[s.h, { color: theme.text }]}>{k('introTitle')}</Text>
                <Text style={[s.p, { color: theme.textSecondary }]}>{k('introText')}</Text>
                <View testID={safari ? 'ios-guide-safari-ok' : 'ios-guide-safari-bad'} style={[s.box, { backgroundColor: safari ? 'rgba(61,220,151,0.1)' : 'rgba(255,176,74,0.1)', borderColor: safari ? 'rgba(61,220,151,0.35)' : 'rgba(255,176,74,0.4)' }]}>
                  <MaterialIcons name={safari ? 'check-circle' : 'warning'} size={22} color={safari ? '#3DDC97' : '#FFB04A'} />
                  <Text style={{ flex: 1, color: theme.text, fontSize: 13.5, lineHeight: 19 }}>{k(safari ? 'browserOk' : 'browserBad')}</Text>
                </View>
                {copied ? <Text testID="ios-guide-copied" style={{ color: '#3DDC97', fontSize: 13, marginTop: 8 }}>{k('copied')}</Text> : null}
                {['pt1', 'pt2', 'pt3'].map((p, n) => (
                  <View key={p} style={s.point}>
                    <View style={[s.pointIcon, { backgroundColor: theme.surface2 }]}><MaterialIcons name={['fullscreen', 'notifications-active', 'timer'][n]} size={18} color={accent} /></View>
                    <Text style={{ flex: 1, color: theme.text, fontSize: 14 }}>{k(p)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View testID={`ios-guide-step-${i}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.num, { backgroundColor: accent }]}><Text style={{ color: theme.isDark ? '#04222D' : '#FFFFFF', fontWeight: '800', fontSize: 13 }}>{i}</Text></View>
                  <Text style={{ color: accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>{t('pwa.ios.stepOf', { n: String(i) })}</Text>
                </View>
                <Text style={[s.h, { color: theme.text }]}>{k(`s${i}Title`)}</Text>
                <Text style={[s.p, { color: theme.textSecondary }]}>{k(`s${i}Text`)}</Text>
                <View style={[s.shot, { borderColor: theme.border }]}>
                  <Image source={SHOTS[i - 1].src} style={{ width: '100%', aspectRatio: SHOTS[i - 1].ratio }} resizeMode="cover" accessibilityLabel={k(`s${i}Title`)} />
                </View>
                <View style={[s.hint, { backgroundColor: theme.primaryBg, borderColor: theme.border }]}>
                  <MaterialIcons name="visibility" size={18} color={accent} />
                  <Text style={{ flex: 1, color: theme.text, fontSize: 13.5, lineHeight: 19 }}>{k(`s${i}Hint`)}</Text>
                </View>
                {i === LAST ? <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 10 }}>{k('note')}</Text> : null}
              </View>
            )}
          </ScrollView>

          <View style={[s.bar, { borderTopColor: theme.border }]}>
            {i > 0 ? (
              <TouchableOpacity testID="ios-guide-back" onPress={() => setI(i - 1)} accessibilityRole="button" style={[s.btn, { flex: 0.42, borderWidth: 1.5, borderColor: theme.border }]}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{k('back')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity testID="ios-guide-next" onPress={next} accessibilityRole="button" style={[s.btn, { flex: 1, backgroundColor: accent }]}>
              <Text style={{ color: theme.isDark ? '#04222D' : '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{wrong ? k('copy') : i === 0 ? k('start') : i === LAST ? k('done') : k('next')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,12,16,0.6)', justifyContent: 'flex-end' },
  sheet: { height: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 10 },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 6, paddingTop: 4 },
  x: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingTop: 2 },
  seg: { flex: 1, height: 4, borderRadius: 4 },
  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 },
  logo: { width: 150, height: 106, alignSelf: 'center', marginBottom: 12, borderRadius: 14, backgroundColor: '#FFFFFF' },
  h: { fontSize: 22, fontWeight: '700', marginTop: 8, marginBottom: 6, letterSpacing: -0.2 },
  p: { fontSize: 14.5, lineHeight: 22 },
  box: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 14 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  pointIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  shot: { marginTop: 14, marginBottom: 12, borderRadius: 18, overflow: 'hidden', borderWidth: 1, backgroundColor: '#000000' },
  hint: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 12 },
  bar: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, borderTopWidth: 1 },
  btn: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
});
