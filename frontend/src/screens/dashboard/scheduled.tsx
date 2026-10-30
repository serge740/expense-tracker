import { withPersonalOnly } from '@/components/family/personal-only-screen';
// Ported from expo_app/app/(dashboard)/scheduled.tsx, then extended on the web: status cards, filters, and loan / credit pay dates.
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect, useLocalSearchParams } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { usePreferences } from '@/context/preferences-context';
import { ToneChip, OWE, OWED } from '@/components/debt/tone-chip';
import { ConfirmSheet, ConfirmItem } from '@/components/schedule/confirm-sheet';
import { ScheduleDetail } from '@/components/schedule/schedule-detail';
import { agendaTitle, openAgendaItem, useWhen } from '@/components/home/schedule-cards';
import { getScheduledList, getWaitingDates, Scheduled, skipOccurrence, WaitingItem } from '@/services/scheduled.service';
import { getAgenda } from '@/services/home.service';
import { describeRule, TextEnv, wallInZone } from '@/utils/recurrence-text';
import {
  filterItems, KIND_ORDER, showsSchedules, STATUS_ORDER, statusCounts, type AgendaItem, type KindFilter, type StatusFilter,
} from '@/utils/schedule-agenda';

const STATUS_TINT: Record<StatusFilter, string> = { overdue: OWE, waiting: '#2563EB', week: '#D97706', later: '#64748B', paused: '#94A3B8', ended: '#94A3B8' };

/** Scheduled and repeating transactions and loan / credit pay dates: what needs you, what is coming, and everything set up. */
function ScheduledScreen() {
  const theme = useAppTheme();
  const { t, locale, language, formatDate } = useI18n();
  const { prefs } = usePreferences();
  const when = useWhen();
  const env: TextEnv = useMemo(() => ({ t, locale, language }), [t, locale, language]);
  const { id: linkedId } = useLocalSearchParams<{ id?: string }>();

  const [list, setList] = useState<Scheduled[]>([]);
  const [ended, setEnded] = useState<Scheduled[]>([]);
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(linkedId ?? null);
  const [confirming, setConfirming] = useState<ConfirmItem | null>(null);
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, w, e, a] = await Promise.all([getScheduledList(), getWaitingDates(), getScheduledList('ENDED'), getAgenda()]);
      setList(l); setWaiting(w); setEnded(e); setAgenda(a.items);
    } catch { /* keep what we have */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  React.useEffect(() => { if (linkedId) setOpenId(linkedId); }, [linkedId]);

  const back = () => { if (router.canGoBack()) router.back(); else router.navigate('/(dashboard)/profile' as any); };
  const dateTime = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const money = (n: number, cur: string) => formatMoney(n, cur || 'RWF', { hidden: prefs.hideBalances });

  const skip = (w: WaitingItem) => Alert.alert(t('sched.skipTitle'), t('sched.skipMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('sched.skip'), onPress: async () => {
        try { await skipOccurrence(w.id); await load(); }
        catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave')); }
      },
    },
  ]);

  // ── What is shown, after the two filters ───────────────────────────────────
  const paused = list.filter(x => x.status === 'PAUSED');
  const counts = statusCounts(agenda, paused.length, ended.length, kind);
  const dateRows = filterItems(agenda, kind, status).filter(i => !i.waiting);
  const kindOk = (type: 'INCOME' | 'EXPENSE') => kind === 'all' || kind === 'scheduled' || (kind === 'in' ? type === 'INCOME' : kind === 'out' ? type === 'EXPENSE' : false);
  const waitingShown = showsSchedules(kind) && (status === null || status === 'waiting' || status === 'overdue')
    ? waiting.filter(w => kindOk(w.type) && (status !== 'overdue' || w.overdue)) : [];
  const templates = !showsSchedules(kind) || (status !== null && status !== 'paused' && status !== 'ended') ? []
    : (status === 'ended' ? ended : status === 'paused' ? paused : list).filter(x => kindOk(x.type));
  const nothing = waitingShown.length === 0 && dateRows.length === 0 && templates.length === 0;

  const kindLabel = (k: KindFilter) => t(`sched.kind.${k}` as any);
  const statusLabel = (st: StatusFilter) => t(`sched.status.${st}` as any);

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <View style={s.header}>
        <TouchableOpacity onPress={back} style={[s.round, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityRole="button" accessibilityLabel={t('rem.back')}>
          <MaterialIcons name="arrow-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.text }]}>{t('sched.title')}</Text>
          <Text style={[s.sub, { color: theme.textMuted }]}>{t('sched.subtitle')}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(dashboard)/add' as any)} style={[s.round, { backgroundColor: theme.buttonBg, borderColor: theme.buttonBg }]} accessibilityRole="button" accessibilityLabel={t('sched.newTitle')}>
          <MaterialIcons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}>
        {loading ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : (
          <>
            {/* Status cards: tap one to filter by it, tap again to clear */}
            <View style={s.statusGrid} testID="status-cards">
              {STATUS_ORDER.map(st => {
                const on = status === st;
                const tint = STATUS_TINT[st];
                return (
                  <TouchableOpacity key={st} testID={`status-${st}`} activeOpacity={0.8} onPress={() => setStatus(on ? null : st)} accessibilityRole="button" accessibilityState={{ selected: on }}
                                    style={[s.statusCard, { backgroundColor: on ? `${tint}1F` : theme.surface, borderColor: on ? tint : theme.border }]}>
                    <Text style={[s.statusNum, { color: counts[st] > 0 ? tint : theme.textMuted }]}>{counts[st]}</Text>
                    <Text style={[s.statusLabel, { color: on ? tint : theme.textSecondary }]} numberOfLines={1}>{statusLabel(st)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.kindRow} testID="kind-chips">
              {KIND_ORDER.map(k => {
                const on = kind === k;
                return (
                  <TouchableOpacity key={k} testID={`kind-${k}`} onPress={() => setKind(k)} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: on }}
                                    style={[s.kindChip, { backgroundColor: on ? theme.primary : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                    <Text style={[s.kindText, { color: on ? (theme.isDark ? '#07202A' : '#FFFFFF') : theme.textSecondary }]}>{kindLabel(k)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {waitingShown.length > 0 && (
              <>
                <Text style={[s.sec, { color: theme.text }]}>{t('sched.waiting')}</Text>
                {waitingShown.map(w => {
                  const income = w.type === 'INCOME';
                  return (
                    <View key={w.id} style={[s.card, { backgroundColor: theme.surface, borderColor: w.overdue ? `${OWE}66` : theme.border }]} testID="waiting-card">
                      <View style={s.cardTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.cardTitle, { color: theme.text }]} numberOfLines={1}>{w.title}</Text>
                          <Text style={[s.cardSub, { color: w.overdue ? OWE : theme.textMuted }]}>{dateTime(w.dueAt)}</Text>
                        </View>
                        <Text style={[s.amount, { color: income ? '#16A34A' : theme.text }]}>{income ? '+' : ''}{money(w.amount, w.currency)}</Text>
                      </View>
                      <View style={s.row}>
                        <TouchableOpacity style={[s.btn, { backgroundColor: theme.buttonBg, flex: 1.3 }]} accessibilityRole="button"
                                          onPress={() => setConfirming({ occurrenceId: w.id, title: w.title, type: w.type, amount: w.amount, currency: w.currency, walletId: w.walletId })}>
                          <Text style={[s.btnText, { color: '#FFFFFF' }]}>{t(income ? 'sched.receive' : 'sched.pay')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.btn, { backgroundColor: theme.primaryBg }]} onPress={() => skip(w)} accessibilityRole="button">
                          <Text style={[s.btnText, { color: theme.primary }]} numberOfLines={1}>{t('sched.skip')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {dateRows.length > 0 && (
              <>
                <Text style={[s.sec, { color: theme.text }]}>{t('sched.comingUp')}</Text>
                {dateRows.map(i => {
                  const tint = i.overdue ? OWE : i.direction === 'IN' ? OWED : theme.primary;
                  return (
                    <TouchableOpacity key={i.key} testID="agenda-row" activeOpacity={0.85} accessibilityRole="button"
                                      onPress={() => (i.source === 'SCHEDULED' ? setOpenId(i.refId) : openAgendaItem(i))}
                                      style={[s.card, { backgroundColor: theme.surface, borderColor: i.overdue ? `${OWE}66` : theme.border }]}>
                      <View style={s.cardTop}>
                        <View style={[s.icon, { backgroundColor: `${tint}1F` }]}>
                          <MaterialIcons name={i.source === 'SCHEDULED' ? 'event-repeat' : i.source === 'DEBT' ? 'north-east' : 'south-west'} size={16} color={tint} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.cardTitle, { color: theme.text }]} numberOfLines={1}>{agendaTitle(i, t)}</Text>
                          <Text style={[s.cardSub, { color: i.overdue ? OWE : theme.textMuted }]} numberOfLines={1}>{when(i.dueAt)} · {formatDate(i.dueAt, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 3 }}>
                          {i.amount != null ? <Text style={[s.amount, { color: i.direction === 'IN' ? '#16A34A' : theme.text }]}>{i.direction === 'IN' ? '+' : ''}{money(i.amount, i.currency)}</Text> : null}
                          {i.source !== 'SCHEDULED' ? <ToneChip label={t(i.source === 'DEBT' ? 'sched.kindLoan' : 'sched.kindCredit')} tone={i.source === 'DEBT' ? 'red' : 'green'} /> : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {templates.length > 0 && (
              <>
                <Text style={[s.sec, { color: theme.text }]}>{t(status === 'ended' ? 'sched.status.ended' : status === 'paused' ? 'sched.status.paused' : 'sched.upcoming')}</Text>
                {templates.map(x => {
                  const income = x.type === 'INCOME';
                  return (
                    <TouchableOpacity key={x.id} activeOpacity={0.85} onPress={() => setOpenId(x.id)} testID="schedule-card" accessibilityRole="button"
                                      style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, opacity: x.status === 'PAUSED' || x.status === 'ENDED' ? 0.7 : 1 }]}>
                      <View style={s.cardTop}>
                        <View style={[s.icon, { backgroundColor: theme.primaryBg }]}>
                          <MaterialIcons name={x.repeat ? 'repeat' : 'event'} size={16} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.cardTitle, { color: theme.text }]} numberOfLines={1}>{x.title}</Text>
                          <Text style={[s.cardSub, { color: theme.textMuted }]} numberOfLines={2}>
                            {describeRule(x.repeat, wallInZone(new Date(x.startAt), x.timezone), env)}
                          </Text>
                        </View>
                        <Text style={[s.amount, { color: income ? '#16A34A' : theme.text }]}>{income ? '+' : ''}{money(x.amount, x.currency)}</Text>
                      </View>
                      <View style={s.chips}>
                        {x.status === 'PAUSED' && <ToneChip label={t('sched.paused')} tone="amber" />}
                        {x.mode === 'AUTO_POST' && <ToneChip label={t('sched.auto')} tone="blue" />}
                        <Text style={[s.next, { color: theme.textMuted }]}>
                          {x.nextDueAt && x.status === 'ACTIVE' ? t('sched.nextOn', { when: dateTime(x.nextDueAt) }) : x.status === 'ACTIVE' ? t('sched.noNext') : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {nothing && (
              <View style={s.empty} testID="schedule-empty">
                <MaterialIcons name="event-repeat" size={30} color={theme.textMuted} />
                <Text style={[s.emptyText, { color: theme.textMuted }]}>{t(kind === 'all' && status === null ? 'sched.empty' : 'sched.nothingMatch')}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ScheduleDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />
      <Modal visible={!!confirming} transparent animationType="fade" onRequestClose={() => setConfirming(null)}>
        {confirming && <ConfirmSheet item={confirming} onClose={() => setConfirming(null)} onDone={() => { setConfirming(null); load(); }} />}
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  round:  { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:  { fontSize: 17, fontWeight: '700' },
  sub:    { fontSize: 11 },
  scroll: { paddingHorizontal: 16, paddingBottom: 120 },
  sec:    { fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },

  statusGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statusCard:  { width: '31.5%', flexGrow: 1, borderRadius: 16, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 10 },
  statusNum:   { fontSize: 22, fontWeight: '800' },
  statusLabel: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  kindRow:     { gap: 8, paddingVertical: 12 },
  kindChip:    { paddingHorizontal: 14, height: 34, borderRadius: 99, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kindText:    { fontSize: 12.5, fontWeight: '700' },

  card:      { borderRadius: 18, borderWidth: 1, padding: 12, marginBottom: 10 },
  cardTop:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon:      { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '700' },
  cardSub:   { fontSize: 11, marginTop: 1 },
  amount:    { fontSize: 14, fontWeight: '800' },
  chips:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  next:      { fontSize: 11, flex: 1, textAlign: 'right' },
  row:       { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn:       { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  btnText:   { fontSize: 12, fontWeight: '700' },

  empty:     { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 12, textAlign: 'center', maxWidth: 270, lineHeight: 17 },
});

export default withPersonalOnly(ScheduledScreen);
