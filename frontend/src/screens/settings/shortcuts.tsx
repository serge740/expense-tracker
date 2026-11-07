import React from 'react';
import { Switch, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { usePreferences } from '@/context/preferences-context';
import { SettingsScreen } from '@/components/settings/ui';
import type { StringKey } from '@/i18n/strings';

const TOOLS: Array<{ id: 'reports' | 'exchange' | 'add'; icon: string; route: string; title: StringKey; sub: StringKey }> = [
  { id: 'reports', icon: 'bar-chart', route: '/(dashboard)/reports', title: 'sc.reports', sub: 'sc.reportsSub' },
  { id: 'exchange', icon: 'currency-exchange', route: '/(dashboard)/transfer?mode=exchange', title: 'sc.exchange', sub: 'sc.exchangeSub' },
  { id: 'add', icon: 'add', route: '/(dashboard)/add', title: 'sc.add', sub: 'sc.addSub' },
];

/** Shortcuts that used to sit on Home, plus the switch for counting loans and debts in the Home figures (off until turned on). */
export default function ShortcutsScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { prefs, setPref } = usePreferences();
  const ink = theme.isDark ? '#04222D' : '#FFFFFF';

  return (
    <SettingsScreen title={t('sc.title')} subtitle={t('sc.subtitle')}>
      <View style={{ paddingHorizontal: 14, gap: 10 }}>
        {TOOLS.map(tool => (
          <TouchableOpacity key={tool.id} testID={`shortcut-${tool.id}`} activeOpacity={0.85} accessibilityRole="button" onPress={() => router.push(tool.route as any)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}>
            <View style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary }}>
              <MaterialIcons name={tool.icon} size={24} color={ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{t(tool.title)}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{t(tool.sub)}</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={15} color={theme.textMuted} />
          </TouchableOpacity>
        ))}

        <View style={{ marginTop: 6, borderRadius: 22, padding: 14, backgroundColor: theme.primaryBg, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{t('home.includeLoans')}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 }}>{t(prefs.includeLoans ? 'sc.loansOn' : 'sc.loansOff')}</Text>
            </View>
            <Switch testID="shortcut-loans" value={prefs.includeLoans} onValueChange={v => setPref('includeLoans', v)} trackColor={{ true: '#4ADE80', false: theme.border }} thumbColor="#FFFFFF" accessibilityLabel={t('home.includeLoans')} />
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 11.5, marginTop: 10, lineHeight: 16 }}>{t('sc.borrowedNote')}</Text>
        </View>
      </View>
    </SettingsScreen>
  );
}
