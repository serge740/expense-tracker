import React from 'react';
import { StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { OWE, OWED } from '@/components/debt/tone-chip';
import { agoPhrase, calendarDays, whenPhrase, type AgendaItem, type HomeSchedule } from '@/utils/schedule-agenda';
import { STARTERS, starterParams } from '@/utils/schedule-starters';

/** "Tomorrow", "in 5 days", "12 days overdue" for a date, in the person's language. */
export function useWhen() {
  const { t } = useI18n();
  return (iso: string) => { const w = whenPhrase(calendarDays(iso)); return t(w.key, w.vars); };
}

/** Where a row leads: the loan or credit for a pay date, the schedule for a scheduled item. */
export function openAgendaItem(i: AgendaItem) {
  if (i.source === 'SCHEDULED') router.push({ pathname: '/(dashboard)/scheduled', params: { id: i.refId } } as any);
  else router.push({ pathname: '/(dashboard)/debts', params: { openId: i.refId } } as any);
}

export const agendaTitle = (i: AgendaItem, t: (k: any, v?: any) => string) =>
  i.source === 'DEBT' ? t('rem.payPerson', { person: i.person ?? '' }) : i.source === 'CREDIT' ? t('rem.owesYou', { person: i.person ?? '' }) : i.title;

/**
 * "Schedules" on Home: the next two things coming (scheduled items and loan or credit pay dates) with how many days
 * are left, or the latest one when nothing is ahead. Tapping a row opens it; "Manage" opens the Scheduled page.
 */
export function ScheduleCard({ schedule, hidden }: { schedule: HomeSchedule; hidden: boolean }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const when = useWhen();
  const ago = (iso: string) => { const w = agoPhrase(calendarDays(iso)); return t(w.key, w.vars); };
  const { upcoming, more, last } = schedule;

  return (
    <View testID="schedule-card" style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {upcoming.length > 0 ? (
        <>
          {upcoming.map((i, idx) => {
            const tint = i.overdue ? OWE : i.direction === 'IN' ? OWED : theme.primary;
            return (
              <TouchableOpacity key={i.key} testID="schedule-row" activeOpacity={0.8} onPress={() => openAgendaItem(i)} accessibilityRole="button"
                                style={[s.row, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <View style={[s.icon, { backgroundColor: `${tint}1F` }]}>
                  <MaterialIcons name={i.source === 'SCHEDULED' ? 'event-repeat' : i.source === 'DEBT' ? 'north-east' : 'south-west'} size={17} color={tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{agendaTitle(i, t)}</Text>
                  <Text style={[s.when, { color: i.overdue ? OWE : theme.textSecondary }]} numberOfLines={1}>
                    {when(i.dueAt)} · {formatDate(i.dueAt, { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                {i.amount != null ? (
                  <Text style={[s.amount, { color: i.direction === 'IN' ? OWED : theme.text }]} numberOfLines={1}>
                    {i.direction === 'IN' ? '+' : ''}{formatMoney(i.amount, i.currency || 'RWF', { hidden })}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
          {more > 0 ? <Text style={[s.more, { color: theme.textMuted }]}>{t('home.schedMore', { n: more })}</Text> : null}
        </>
      ) : last ? (
        <TouchableOpacity testID="schedule-last" activeOpacity={0.8} onPress={() => router.push('/(dashboard)/scheduled' as any)} accessibilityRole="button" style={s.row}>
          <View style={[s.icon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name="history" size={17} color={theme.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.when, { color: theme.textMuted }]}>{t('home.lastSched')}</Text>
            <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{last.title}</Text>
            <Text style={[s.when, { color: theme.textSecondary }]} numberOfLines={1}>
              {t(`home.last${last.status === 'POSTED' ? 'Posted' : last.status === 'SKIPPED' ? 'Skipped' : last.status === 'FAILED' ? 'Failed' : 'Created'}` as any)} · {ago(last.at)} · {formatDate(last.at, { day: 'numeric', month: 'short' })}
            </Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={s.row}>
          <View style={[s.icon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name="event-repeat" size={17} color={theme.primary} /></View>
          <Text style={[s.when, { color: theme.textSecondary, flex: 1 }]}>{t('home.noSchedule')}</Text>
        </View>
      )}
    </View>
  );
}

/** "Plan a schedule": one-tap starting points that open the Add form already filled in (a loan pay date goes to Loans). */
export function PlanCard() {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <View testID="plan-card" style={[s.plan, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={s.planHead}>
        <View style={[s.planIcon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name="auto-awesome" size={20} color={theme.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.planTitle, { color: theme.primary }]}>{t('plan.title')}</Text>
          <Text style={[s.when, { color: theme.textSecondary }]}>{t('plan.sub')}</Text>
        </View>
      </View>
      <View style={s.chips}>
        {STARTERS.map(st => (
          <TouchableOpacity key={st.id} testID={`plan-${st.id}`} activeOpacity={0.8} accessibilityRole="button"
                            onPress={() => router.push(st.route ? (st.route as any) : ({ pathname: '/(dashboard)/add', params: starterParams(st) } as any))}
                            style={[s.chip, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name={st.icon} size={15} color={theme.primary} />
            <Text style={[s.chipText, { color: theme.text }]} numberOfLines={1}>{t(st.label)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 18, borderRadius: 24, borderWidth: 1, paddingHorizontal: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700' },
  when: { fontSize: 12, marginTop: 1 },
  amount: { fontSize: 13.5, fontWeight: '800', maxWidth: '38%' },
  more: { fontSize: 11.5, fontWeight: '600', textAlign: 'center', paddingBottom: 10 },

  plan: { marginHorizontal: 18, marginTop: 4, marginBottom: 6, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', padding: 14 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  planTitle: { fontSize: 14.5, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 99, borderWidth: 1 },
  chipText: { fontSize: 12.5, fontWeight: '600' },
});
