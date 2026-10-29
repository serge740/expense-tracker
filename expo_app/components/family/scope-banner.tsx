import React from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';

/** "Adding to: <Family> · everyone in the family will see this". Draws nothing in Personal. */
export function AddingToBanner() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { isFamily, family } = useScope();
  if (!isFamily || !family) return null;
  return (
    <View testID="adding-to-banner" style={[s.banner, { backgroundColor: theme.primaryBg, borderColor: theme.primary }]}>
      <MaterialIcons name="groups" size={18} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: theme.primary }]}>{t('family.add.banner', { family: family.name })}</Text>
        <Text style={[s.sub, { color: theme.textSecondary }]}>{t('family.add.visible')}</Text>
      </View>
    </View>
  );
}

/**
 * Shown in place of a personal-only screen (Loans and debts, Scheduled) while standing in a family: those belong to a
 * person, not a family. One button takes the person back to their own space.
 */
export function PersonalOnlyNotice({ testID = 'personal-only' }: { testID?: string }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { switchTo } = useScope();
  return (
    <View testID={testID} style={s.center}>
      <View style={[s.icon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name="lock-outline" size={26} color={theme.primary} /></View>
      <Text style={[s.noticeTitle, { color: theme.text }]}>{t('family.personalOnly.title')}</Text>
      <Text style={[s.noticeBody, { color: theme.textSecondary }]}>{t('family.personalOnly.body')}</Text>
      <TouchableOpacity testID="personal-only-switch" onPress={() => { void switchTo('personal'); }} activeOpacity={0.85} style={[s.button, { backgroundColor: theme.buttonBg }]}>
        <Text style={s.buttonText}>{t('family.personalOnly.button')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Shown in place of Add for a Viewer: they can look at the family's money, not add to it. */
export function ViewerCannotAdd({ onClose }: { onClose: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <View testID="viewer-cannot-add" style={s.center}>
      <View style={[s.icon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name="visibility" size={26} color={theme.primary} /></View>
      <Text style={[s.noticeTitle, { color: theme.text }]}>{t('family.add.viewerTitle')}</Text>
      <Text style={[s.noticeBody, { color: theme.textSecondary }]}>{t('family.add.viewerBody')}</Text>
      <TouchableOpacity testID="viewer-close" onPress={onClose} activeOpacity={0.85} style={[s.button, { backgroundColor: theme.buttonBg }]}>
        <Text style={s.buttonText}>{t('family.add.close')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Used by the personal-only tabs: send people to the Family hub if they want to manage the family instead. */
export const openFamilyHub = () => router.push('/(dashboard)/family' as any);

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 },
  title: { fontSize: 13, fontWeight: '800' },
  sub: { fontSize: 11.5, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  noticeTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  noticeBody: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  button: { marginTop: 8, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
});
