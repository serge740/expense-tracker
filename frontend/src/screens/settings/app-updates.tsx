import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Switch, SafeAreaView, MaterialIcons } from '@/rn';
import { useSettingsBack } from '@/hooks/use-settings-back';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { FadeInView } from '@/components/fade-in-view';
import { useI18n } from '@/context/language-context';
import { useAppUpdate } from '@/context/app-update-context';
import { usePwaInstall } from '@/context/pwa-install-context';

const when = (value: string | number | null) => {
  if (value === null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** Settings → App updates: which version is running, whether a newer one is waiting, and how to get it. */
export default function AppUpdatesScreen() {
  const goBack = useSettingsBack();
  const theme = useAppTheme();
  const { t } = useI18n();
  const { current, latest, status, available, lastChecked, autoCheck, setAutoCheck, check, apply } = useAppUpdate();
  const { isInstalled, isIos } = usePwaInstall();
  const [applying, setApplying] = useState(false);

  // One line that says where things stand.
  const state = status === 'checking' ? 'checking' : available ? 'available' : status === 'error' ? 'error' : latest ? 'upToDate' : 'unknown';
  const tone = {
    checking: { icon: 'sync', color: theme.primary, bg: theme.primaryBg, title: t('upd.checking') },
    available: { icon: 'system-update', color: theme.primary, bg: theme.primaryBg, title: t('upd.available') },
    error: { icon: 'cloud-off', color: theme.expense, bg: 'rgba(239,68,68,0.12)', title: t('upd.error') },
    upToDate: { icon: 'check-circle', color: theme.income, bg: 'rgba(34,197,94,0.12)', title: t('upd.upToDate') },
    unknown: { icon: 'help-outline', color: theme.textMuted, bg: theme.primaryBg, title: t('upd.notChecked') },
  }[state];

  const isAndroid = /Android/i.test(navigator.userAgent);
  const iconNote = !isInstalled ? t('upd.iconBrowser') : isIos() ? t('upd.iconIos') : isAndroid ? t('upd.iconAndroid') : t('upd.iconDesktop');

  const info: [string, string][] = [
    [t('upd.version'), `v${current.version}`],
    [t('upd.built'), when(current.buildId) ?? '—'],
    ...(available && latest ? [[t('upd.newest'), `v${latest.version} · ${when(latest.buildId) ?? ''}`] as [string, string]] : []),
    [t('upd.runningAs'), isInstalled ? t('upd.asApp') : t('upd.inBrowser')],
    [t('upd.lastChecked'), when(lastChecked) ?? t('upd.never')],
  ];

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <FadeInView delay={0} slideFrom="top" distance={12}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.surface }]} onPress={() => goBack()} activeOpacity={0.7} accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: theme.text }]}>{t('upd.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
      </FadeInView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <FadeInView delay={60} slideFrom="bottom" distance={14}>
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            <View style={s.stateRow}>
              <View style={[s.stateIcon, { backgroundColor: tone.bg }]}><MaterialIcons name={tone.icon} size={24} color={tone.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.stateTitle, { color: theme.text }]}>{tone.title}</Text>
                {state === 'available' ? <Text style={[s.small, { color: theme.textSecondary }]}>{t('upd.reloadNote')}</Text> : null}
              </View>
            </View>

            <View style={s.buttons}>
              {available ? (
                <TouchableOpacity
                  activeOpacity={0.85} disabled={applying} accessibilityRole="button"
                  onPress={() => { setApplying(true); void apply(); }}
                  style={[s.btn, { backgroundColor: theme.buttonBg }, applying && { opacity: 0.5 }]}
                >
                  <Text style={s.btnPrimary}>{t('upd.apply')}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                activeOpacity={0.8} disabled={status === 'checking'} accessibilityRole="button" onPress={() => { void check(); }}
                style={[s.btn, available ? { borderWidth: 1, borderColor: theme.border } : { backgroundColor: theme.buttonBg }, status === 'checking' && { opacity: 0.5 }]}
              >
                <Text style={available ? { color: theme.text, fontWeight: '600', fontSize: 14 } : s.btnPrimary}>{t('upd.check')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </FadeInView>

        <FadeInView delay={120} slideFrom="bottom" distance={14}>
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            {info.map(([label, value], i) => (
              <View key={label}>
                <View style={s.infoRow}>
                  <Text style={[s.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
                  <Text style={[s.infoValue, { color: theme.text }]}>{value}</Text>
                </View>
                {i < info.length - 1 && <View style={[s.divider, { backgroundColor: theme.border }]} />}
              </View>
            ))}
          </View>
        </FadeInView>

        <FadeInView delay={180} slideFrom="bottom" distance={14}>
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            <View style={s.stateRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoValue, { color: theme.text, textAlign: 'left' }]}>{t('upd.auto')}</Text>
                <Text style={[s.small, { color: theme.textSecondary }]}>{t('upd.autoSub')}</Text>
              </View>
              <Switch value={autoCheck} onValueChange={setAutoCheck} accessibilityLabel={t('upd.auto')} />
            </View>
          </View>
        </FadeInView>

        <FadeInView delay={240} slideFrom="bottom" distance={14}>
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            <View style={s.stateRow}>
              <View style={[s.stateIcon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name="apps" size={22} color={theme.primary} /></View>
              <Text style={[s.stateTitle, { color: theme.text, flex: 1 }]}>{t('upd.iconTitle')}</Text>
            </View>
            <Text style={[s.body, { color: theme.textSecondary }]}>{iconNote}</Text>
          </View>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 120, gap: 14 },
  card: { borderRadius: 20, padding: 16 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 16, fontWeight: '700' },
  small: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  btn: { flex: 1, minWidth: 140, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { color: '#fff', fontWeight: '700', fontSize: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, gap: 12 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  divider: { height: 1 },
  body: { fontSize: 13, lineHeight: 20, marginTop: 10 },
});
