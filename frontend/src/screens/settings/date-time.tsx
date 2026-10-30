// Ported from expo_app/app/(dashboard)/(settings)/date-time.tsx
import React, { useMemo } from 'react';
import { View, StyleSheet } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePreferences, Preferences } from '@/context/preferences-context';
import { useI18n } from '@/context/language-context';
import { SettingsScreen, Section, Row, Chips, OptionBlock } from '@/components/settings/ui';

function formatDate(d: Date, fmt: Preferences['dateFormat']) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return fmt === 'MM/DD/YYYY' ? `${mm}/${dd}/${yyyy}` : fmt === 'YYYY-MM-DD' ? `${yyyy}-${mm}-${dd}` : `${dd}/${mm}/${yyyy}`;
}

export default function DateTimeScreen() {
  const theme = useAppTheme();
  const { prefs, setPref, formatTime } = usePreferences();
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <SettingsScreen title="Date & time" subtitle="How dates and times appear in the app">
      <View style={[s.preview, { backgroundColor: theme.buttonBg }]}>
        <Text style={s.previewTime}>{formatTime(now.getHours() * 60 + now.getMinutes())}</Text>
        <Text style={s.previewDate}>
          {now.toLocaleDateString('en-US', { weekday: 'long' })} · {formatDate(now, prefs.dateFormat)}
        </Text>
      </View>

      <Section title="FORMAT">
        <OptionBlock icon="schedule" title="Time format">
          <Chips value={prefs.timeFormat} onChange={v => setPref('timeFormat', v)}
                 options={[{ label: '24-hour (14:30)', value: '24h' }, { label: '12-hour (2:30 PM)', value: '12h' }]} />
        </OptionBlock>
        <OptionBlock icon="calendar-today" title="Date format">
          <Chips value={prefs.dateFormat} onChange={v => setPref('dateFormat', v)}
                 options={(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const).map(f => ({ label: f, value: f }))} />
        </OptionBlock>
        <OptionBlock icon="view-week" title="Week starts on" sub="Affects calendars and weekly reports">
          <Chips value={prefs.weekStart} onChange={v => setPref('weekStart', v)}
                 options={[{ label: 'Monday', value: 'monday' }, { label: 'Sunday', value: 'sunday' }]} />
        </OptionBlock>
      </Section>

      <Section title="HOME">
        <OptionBlock icon="date-range" title={t('period.setting')} sub={t('period.settingSub')}>
          <Chips value={prefs.homePeriod} onChange={v => setPref('homePeriod', v)}
                 options={[{ label: t('period.optMonth'), value: 'month' }, { label: t('period.optYear'), value: 'year' }, { label: t('period.optAll'), value: 'all' }]} />
        </OptionBlock>
      </Section>

      <Section title="TIME ZONE">
        <Row icon="public" title="Time zone" sub="Set automatically from your device" value={timeZone.replace(/_/g, ' ')} />
      </Section>
    </SettingsScreen>
  );
}

const s = StyleSheet.create({
  preview:     { borderRadius: 20, paddingVertical: 20, alignItems: 'center', marginBottom: 18 },
  previewTime: { color: '#FFFFFF', fontSize: 30, fontWeight: '700' },
  previewDate: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
});
