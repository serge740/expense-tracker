import React from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { ThemePreference, useThemePreference } from '@/context/theme-context';
import { FadeInView } from '@/components/fade-in-view';

type Option = { value: ThemePreference; label: string; sub: string; icon: keyof typeof MaterialIcons.glyphMap };

const OPTIONS: Option[] = [
  { value: 'system', label: 'System Default', sub: 'Follows your device setting automatically', icon: 'brightness-auto' },
  { value: 'light',  label: 'Light Mode',     sub: 'Always use light theme',                   icon: 'light-mode'       },
  { value: 'dark',   label: 'Dark Mode',      sub: 'Always use dark theme',                    icon: 'dark-mode'        },
];

export default function AppearanceScreen() {
  const theme = useAppTheme();
  const { preference, setPreference } = useThemePreference();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <FadeInView delay={0} slideFrom="top" distance={12}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: theme.text }]}>Appearance</Text>
          <View style={{ width: 40 }} />
        </View>
      </FadeInView>

      <View style={s.content}>
        <FadeInView delay={80} slideFrom="bottom" distance={16}>
          <Text style={[s.sectionLabel, { color: theme.textMuted }]}>THEME</Text>
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            {OPTIONS.map((opt, i) => (
              <React.Fragment key={opt.value}>
                <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => setPreference(opt.value)}>
                  <View style={[s.iconWrap, { backgroundColor: theme.primaryBg }]}>
                    <MaterialIcons name={opt.icon} size={22} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowLabel, { color: theme.text }]}>{opt.label}</Text>
                    <Text style={[s.rowSub, { color: theme.textMuted }]}>{opt.sub}</Text>
                  </View>
                  <View style={[s.radio, { borderColor: preference === opt.value ? theme.primary : theme.border }]}>
                    {preference === opt.value && (
                      <View style={[s.radioDot, { backgroundColor: theme.primary }]} />
                    )}
                  </View>
                </TouchableOpacity>
                {i < OPTIONS.length - 1 && <View style={[s.divider, { backgroundColor: theme.border }]} />}
              </React.Fragment>
            ))}
          </View>
        </FadeInView>

        <FadeInView delay={180} slideFrom="bottom" distance={14}>
          <View style={[s.infoBox, { backgroundColor: theme.primaryBg, borderColor: theme.border }]}>
            <MaterialIcons name="info-outline" size={18} color={theme.primary} style={{ marginTop: 1 }} />
            <Text style={[s.infoText, { color: theme.textSecondary }]}>
              Changes apply instantly across all screens. Your preference is saved for future sessions.
            </Text>
          </View>
        </FadeInView>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1 },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 18, fontWeight: '700' },
  content: { flex: 1, padding: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  card:    { borderRadius: 18, overflow: 'hidden' },
  row:     { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  iconWrap:{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowLabel:{ fontSize: 15, fontWeight: '600', marginBottom: 2 },
  rowSub:  { fontSize: 12 },
  divider: { height: 1, marginLeft: 72 },
  radio:   { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot:{ width: 10, height: 10, borderRadius: 5 },
  infoBox: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 14, padding: 14, borderWidth: 1, marginTop: 20 },
  infoText:{ flex: 1, fontSize: 13, lineHeight: 19 },
});
