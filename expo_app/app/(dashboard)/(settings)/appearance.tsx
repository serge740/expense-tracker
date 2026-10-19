import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { ThemePreference, useThemePreference } from '@/context/theme-context';
import { useI18n } from '@/context/language-context';
import { LANGUAGES, StringKey } from '@/i18n/strings';
import { SettingsScreen, Section, Hint, IconName } from '@/components/settings/ui';

const THEMES: { value: ThemePreference; label: StringKey; sub: StringKey; icon: IconName }[] = [
  { value: 'system', label: 'theme.system', sub: 'theme.systemSub', icon: 'brightness-auto' },
  { value: 'light',  label: 'theme.light',  sub: 'theme.lightSub',  icon: 'light-mode' },
  { value: 'dark',   label: 'theme.dark',   sub: 'theme.darkSub',   icon: 'dark-mode' },
];

export default function AppearanceScreen() {
  const theme = useAppTheme();
  const { preference, setPreference } = useThemePreference();
  const { t, language, setLanguage } = useI18n();

  return (
    <SettingsScreen title={t('appearance.title')} subtitle={t('appearance.subtitle')}>
      <Section title={t('section.theme')}>
        {THEMES.map(opt => (
          <Choice
            key={opt.value}
            selected={preference === opt.value}
            onPress={() => setPreference(opt.value)}
            leading={<MaterialIcons name={opt.icon} size={17} color={theme.primary} />}
            title={t(opt.label)}
            sub={t(opt.sub)}
          />
        ))}
      </Section>

      <Section title={t('section.language')}>
        {LANGUAGES.map(l => (
          <Choice
            key={l.code}
            selected={language === l.code}
            onPress={() => setLanguage(l.code)}
            leading={<Text style={s.flag}>{l.flag}</Text>}
            title={l.native}
            sub={l.native === l.name ? undefined : l.name}
          />
        ))}
      </Section>
      <Hint>{t('language.hint')}</Hint>
    </SettingsScreen>
  );
}

function Choice({
  selected, onPress, leading, title, sub,
}: { selected: boolean; onPress: () => void; leading: React.ReactNode; title: string; sub?: string }) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.icon, { backgroundColor: theme.primaryBg }]}>{leading}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: theme.text }]}>{title}</Text>
        {sub ? <Text style={[s.sub, { color: theme.textSecondary }]}>{sub}</Text> : null}
      </View>
      <View style={[s.radio, { borderColor: selected ? theme.primary : theme.border }]}>
        {selected && <View style={[s.dot, { backgroundColor: theme.primary }]} />}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  icon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  flag:  { fontSize: 17 },
  title: { fontSize: 13, fontWeight: '600' },
  sub:   { fontSize: 11, marginTop: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot:   { width: 9, height: 9, borderRadius: 5 },
});
