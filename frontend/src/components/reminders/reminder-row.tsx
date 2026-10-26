// Ported from expo_app/components/reminders/reminder-row.tsx
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { Debt, updateDebt } from '@/services/debt.service';
import { wakeReminder } from '@/services/reminder.service';

/** The "Remind me" switch with its explanation: used on the debt screen and in the new-debt form. */
export function RemindSwitch({ value, onChange, sub, disabled }: {
  value: boolean; onChange: (v: boolean) => void; sub: string; disabled?: boolean;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <>
      <View style={[s.row, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
        <View style={[s.icon, { backgroundColor: theme.primaryBg }]}>
          <MaterialIcons name="notifications-active" size={16} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.text }]}>{t('rem.remindMe')}</Text>
          <Text style={[s.sub, { color: theme.textMuted }]} numberOfLines={2}>{sub}</Text>
        </View>
        <Switch value={value} onValueChange={onChange} disabled={disabled}
                trackColor={{ true: theme.primary, false: theme.border }} accessibilityLabel={t('rem.remindMe')} />
      </View>
      <Text style={[s.hint, { color: theme.textMuted }]}>{t(value ? 'rem.hintOn' : 'rem.hintOff')}</Text>
    </>
  );
}

/** Reminder control of one open debt or credit: switch, next reminder time, and "Wake now" while snoozed. */
export function ReminderRow({ debt, onChanged }: { debt: Debt; onChanged: () => void }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const [on, setOn] = useState(debt.remindersOn);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOn(debt.remindersOn), [debt.remindersOn]);

  const when = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const snoozed = on && debt.reminderStatus === 'SNOOZED' && !!debt.nextReminderAt;
  const sub = !on ? t('rem.off')
    : snoozed ? t('rem.snoozed', { when: when(debt.nextReminderAt!) })
    : debt.nextReminderAt ? t('rem.nextAt', { when: when(debt.nextReminderAt) })
    : t('rem.none');

  const toggle = async (v: boolean) => {
    setOn(v);
    setBusy(true);
    try { await updateDebt(debt.id, { remindersOn: v }); onChanged(); }
    catch (e: any) { setOn(!v); Alert.alert(t('common.error'), e?.response?.data?.message || t('rem.saveFailed')); }
    finally { setBusy(false); }
  };

  const wake = async () => {
    if (!debt.reminderId) return;
    setBusy(true);
    try { await wakeReminder(debt.reminderId); onChanged(); }
    catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('rem.saveFailed')); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ marginTop: 14 }}>
      <RemindSwitch value={on} onChange={toggle} sub={sub} disabled={busy} />
      {snoozed && (
        <TouchableOpacity onPress={wake} disabled={busy} style={[s.wake, { backgroundColor: theme.primaryBg }]} accessibilityRole="button">
          <MaterialIcons name="alarm-on" size={15} color={theme.primary} />
          <Text style={[s.wakeText, { color: theme.primary }]}>{t('rem.wake')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  icon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, fontWeight: '700' },
  sub:   { fontSize: 11, marginTop: 1 },
  hint:  { fontSize: 10.5, lineHeight: 15, marginTop: 6, marginHorizontal: 2 },
  wake:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 12, marginTop: 8 },
  wakeText: { fontSize: 12, fontWeight: '700' },
});
