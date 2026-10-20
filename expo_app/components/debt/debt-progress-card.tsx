import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { OWE, OWED, ToneChip } from '@/components/debt/tone-chip';
import type { Debt } from '@/services/debt.service';
import { closedTag } from '@/utils/debt';

/** How much of the debt is cleared, 0…100: payments and anything forgiven both count. */
export const progressPercent = (d: Pick<Debt, 'amount' | 'paid' | 'writtenOffAmount'>) =>
  d.amount > 0 ? Math.max(0, Math.min(100, ((d.paid + d.writtenOffAmount) / d.amount) * 100)) : 0;

/**
 * One debt or credit as a card: who, how much, a horizontal bar of paid versus left, and when it is next due.
 * Tapping it opens that debt's full details.
 */
export function DebtProgressCard({ debt, hidden, onPress }: { debt: Debt; hidden: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const lent = debt.kind === 'LENT';
  const color = lent ? OWED : OWE;
  const pct = progressPercent(debt);
  const money = (n: number) => formatMoney(n, debt.currency, { hidden });
  const outcome = closedTag(debt.status);
  const due = debt.nextDueAt ?? debt.dueDate;
  const initials = debt.person.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button" testID="debt-card"
                      accessibilityLabel={`${debt.person}, ${money(debt.amount)}`}
                      style={[s.card, { backgroundColor: theme.surface, borderColor: debt.overdue ? `${OWE}66` : theme.border }]}>
      <View style={s.top}>
        <View style={[s.avatar, { backgroundColor: `${color}1A` }]}><Text style={[s.avatarText, { color }]}>{initials}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.person, { color: theme.text }]} numberOfLines={1}>{debt.person}</Text>
          <Text style={[s.sub, { color: theme.textMuted }]} numberOfLines={1}>
            {debt.note || debt.phone || t('debts.since', { date: formatDate(debt.date, { day: 'numeric', month: 'short', year: 'numeric' }) })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={[s.total, { color: theme.text }]}>{money(debt.amount)}</Text>
          {outcome ? <ToneChip label={t(outcome.label)} tone={outcome.tone} />
            : debt.overdue ? <ToneChip label={t('debts.overdue')} tone="red" /> : null}
        </View>
      </View>

      {/* Paid versus left */}
      <View style={[s.track, { backgroundColor: theme.inputBg }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
        <View style={[s.fill, { width: `${pct}%`, backgroundColor: color }]} testID="debt-progress-fill" />
      </View>
      <View style={s.labels}>
        <Text style={[s.label, { color }]}>{t(lent ? 'debt2.progressReceived' : 'debt2.progressPaid', { amount: money(debt.paid) })}</Text>
        <Text style={[s.label, { color: theme.textSecondary }]}>{t('debt2.progressLeft', { amount: money(debt.remaining) })}</Text>
      </View>

      <View style={s.foot}>
        {debt.status === 'OPEN' && due ? (
          <View style={s.footItem}>
            <MaterialIcons name="event" size={13} color={debt.overdue ? OWE : theme.textMuted} />
            <Text style={[s.footText, { color: debt.overdue ? OWE : theme.textMuted }]}>{t('home.nextOn', { when: formatDate(due, { day: 'numeric', month: 'short' }) })}</Text>
          </View>
        ) : <View />}
        {debt.status === 'OPEN' && debt.remindersOn ? (
          <View style={s.footItem}>
            <MaterialIcons name="notifications-active" size={13} color={theme.textMuted} />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:       { borderRadius: 18, borderWidth: 1, padding: 12, marginBottom: 10 },
  top:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  person:     { fontSize: 14, fontWeight: '700' },
  sub:        { fontSize: 11, marginTop: 1 },
  total:      { fontSize: 14, fontWeight: '800' },
  track:      { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  fill:       { height: '100%', borderRadius: 4 },
  labels:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  label:      { fontSize: 11, fontWeight: '700' },
  foot:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  footItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footText:   { fontSize: 11 },
});
