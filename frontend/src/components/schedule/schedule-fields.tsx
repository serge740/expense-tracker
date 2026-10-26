// Ported from expo_app/components/schedule/schedule-fields.tsx
import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import type { ScheduleMode } from '@/services/scheduled.service';
import { RepeatRule, wallOfDate } from '@/utils/recurrence';
import { describeRule, TextEnv } from '@/utils/recurrence-text';

/** "Repeat" row shown under the Date on the Add screen. Tapping it opens the Repeat sheet. */
export function RepeatRow({ start, rule, onPress }: { start: Date; rule: RepeatRule | null; onPress: () => void }) {
  const theme = useAppTheme();
  const { t, locale, language } = useI18n();
  const env: TextEnv = useMemo(() => ({ t, locale, language }), [t, locale, language]);
  const text = describeRule(rule, wallOfDate(start), env);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${t('sched.repeat')}: ${text}`}
      style={[s.row, { backgroundColor: theme.inputBg, borderColor: rule ? theme.primary : theme.border }]}
    >
      <MaterialIcons name="repeat" size={16} color={rule ? theme.primary : theme.textMuted} />
      <Text style={[s.text, { color: rule ? theme.text : theme.textMuted }]} numberOfLines={2} testID="repeat-row-text">{text}</Text>
      <MaterialIcons name="expand-more" size={18} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

/** "Remind me to confirm" (default) or "Post automatically". Shown once the transaction is scheduled. */
export function ModeChoice({ value, onChange }: { value: ScheduleMode; onChange: (m: ScheduleMode) => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const options: { id: ScheduleMode; label: 'sched.modeRemind' | 'sched.modeAuto'; icon: 'notifications-active' | 'bolt' }[] = [
    { id: 'REMIND_CONFIRM', label: 'sched.modeRemind', icon: 'notifications-active' },
    { id: 'AUTO_POST', label: 'sched.modeAuto', icon: 'bolt' },
  ];
  return (
    <View>
      <View style={[s.seg, { backgroundColor: theme.inputBg }]}>
        {options.map(o => {
          const on = value === o.id;
          return (
            <TouchableOpacity key={o.id} onPress={() => onChange(o.id)} activeOpacity={0.85} accessibilityRole="button"
                              accessibilityState={{ selected: on }} style={[s.segBtn, on && { backgroundColor: theme.surface }]}>
              <MaterialIcons name={o.icon} size={14} color={on ? theme.primary : theme.textMuted} />
              <Text style={[s.segText, { color: on ? theme.primary : theme.textMuted }]} numberOfLines={1}>{t(o.label)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[s.hint, { color: theme.textMuted }]}>{t(value === 'AUTO_POST' ? 'sched.modeAutoSub' : 'sched.modeRemindSub')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  text:    { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular' },
  seg:     { flexDirection: 'row', borderRadius: 14, padding: 3 },
  segBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 11, paddingHorizontal: 4 },
  segText: { fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  hint:    { fontSize: 11, lineHeight: 15, marginTop: 8, marginHorizontal: 2 },
});
