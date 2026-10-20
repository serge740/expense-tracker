import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import type { Debt } from '@/services/debt.service';

/** Every detail of one debt or credit, as plain rows: amounts, dates, the next pay date and the next reminder. */
export function DebtInfo({ debt, hidden }: { debt: Debt; hidden: boolean }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const lent = debt.kind === 'LENT';
  const money = (n: number) => formatMoney(n, debt.currency, { hidden });
  const day = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  const moment = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const open = debt.status === 'OPEN' && !debt.archived;

  const rows: { key: string; label: string; value: string }[] = [
    { key: 'total', label: t('debt2.infoTotal'), value: money(debt.amount) },
    { key: 'paid', label: t(lent ? 'debt2.infoReceived' : 'debt2.infoPaid'), value: money(debt.paid) },
    ...(debt.writtenOffAmount > 0 ? [{ key: 'forgiven', label: t('debt2.infoForgiven'), value: money(debt.writtenOffAmount) }] : []),
    { key: 'left', label: t('debt2.infoLeft'), value: money(debt.remaining) },
    ...(!lent && debt.unspent != null ? [{ key: 'unspent', label: t('debt2.infoUnspent'), value: money(debt.unspent) }] : []),
    { key: 'started', label: t('debt2.infoStarted'), value: day(debt.date) },
    ...(open ? [
      { key: 'next', label: t('debt2.infoNextPay'), value: debt.nextDueAt ? moment(debt.nextDueAt) : t('debt2.infoNone') },
      ...(debt.dueDate && debt.dueDate !== debt.nextDueAt ? [{ key: 'final', label: t('debt2.infoFinal'), value: moment(debt.dueDate) }] : []),
      { key: 'reminder', label: t('debt2.infoNextReminder'), value: !debt.remindersOn ? t('debt2.infoReminderOff') : debt.nextReminderAt ? moment(debt.nextReminderAt) : t('debt2.infoNone') },
    ] : []),
    ...(debt.phone ? [{ key: 'phone', label: t('debt2.infoPhone'), value: debt.phone }] : []),
    ...(debt.note ? [{ key: 'note', label: t('debt2.infoNote'), value: debt.note }] : []),
  ];

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[s.title, { color: theme.textMuted }]}>{t('debt2.infoTitle')}</Text>
      <View style={[s.box, { backgroundColor: theme.inputBg, borderColor: theme.border }]} testID="debt-info">
        {rows.map((r, i) => (
          <View key={r.key} style={[s.row, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
            <Text style={[s.label, { color: theme.textSecondary }]}>{r.label}</Text>
            <Text style={[s.value, { color: theme.text }]} numberOfLines={2}>{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  box:   { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12 },
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9 },
  label: { fontSize: 12 },
  value: { fontSize: 12.5, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
});
