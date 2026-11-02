import React from 'react';
import { TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { usePreferences } from '@/context/preferences-context';
import { SettingsScreen, Section } from '@/components/settings/ui';
import { HOME_DEFAULTS, homeChoiceOf, periodDays, presetPeriod, type PresetId } from '@/utils/period';

/** One line saying what a choice covers today, so "Last 30 days" is not a guess. */
function covers(id: PresetId, weekStart: 'monday' | 'sunday', fmt: (iso: string) => string, all: string): string {
  const days = periodDays(presetPeriod(id, new Date(), weekStart));
  return days ? `${fmt(days.from)} – ${fmt(days.to)}` : all;
}

/** Home screen settings: which figures Home opens with. Home's own period pill still changes it for a visit. */
export default function HomeSettingsScreen() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { prefs, setPref } = usePreferences();
  const chosen = homeChoiceOf(prefs.homePeriod);
  const fmt = (iso: string) => formatDate(iso + 'T12:00:00', { day: 'numeric', month: 'short' });

  return (
    <SettingsScreen title={t('hset.title')} subtitle={t('hset.subtitle')}>
      <Section title={t('hset.section')}>
        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingVertical: 10 }}>{t('period.settingSub')}</Text>
        {HOME_DEFAULTS.map(id => {
          const on = id === chosen;
          return (
            <TouchableOpacity key={id} testID={`home-default-${id}`} onPress={() => setPref('homePeriod', id)} activeOpacity={0.8} accessibilityRole="radio" accessibilityState={{ selected: on }}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: on ? '700' : '500' }}>{t(`preset.${id}` as any)}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>{covers(id, prefs.weekStart, fmt, t('hset.everything'))}</Text>
              </View>
              <MaterialIcons name={on ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={on ? theme.primary : theme.textMuted} />
            </TouchableOpacity>
          );
        })}
      </Section>
    </SettingsScreen>
  );
}
