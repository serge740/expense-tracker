// Ported from expo_app/app/(dashboard)/scheduled.tsx
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
import { ToneChip, OWE } from '@/components/debt/tone-chip';
import { ConfirmSheet, ConfirmItem } from '@/components/schedule/confirm-sheet';
import { ScheduleDetail } from '@/components/schedule/schedule-detail';
import { getScheduledList, getWaitingDates, Scheduled, skipOccurrence, WaitingItem } from '@/services/scheduled.service';
import { describeRule, TextEnv, wallInZone } from '@/utils/recurrence-text';

/** Scheduled and repeating transactions: what is waiting for an answer, and everything that is set up. */
export default function ScheduledScreen() {
  const theme = useAppTheme();
  const { t, locale, language, formatDate } = useI18n();
  const { prefs } = usePreferences();
  const env: TextEnv = useMemo(() => ({ t, locale, language }), [t, locale, language]);
  const { id: linkedId } = useLocalSearchParams<{ id?: string }>();

  const [list, setList] = useState<Scheduled[]>([]);
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(linkedId ?? null);
  const [confirming, setConfirming] = useState<ConfirmItem | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, w] = await Promise.all([getScheduledList(), getWaitingDates()]);
      setList(l); setWaiting(w);
    } catch { /* keep what we have */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  React.useEffect(() => { if (linkedId) setOpenId(linkedId); }, [linkedId]);

  const back = () => { if (router.canGoBack()) router.back(); else router.navigate('/(dashboard)/profile' as any); };
  const when = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
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
            {waiting.length > 0 && (
              <>
                <Text style={[s.sec, { color: theme.text }]}>{t('sched.waiting')}</Text>
                {waiting.map(w => {
                  const income = w.type === 'INCOME';
                  return (
                    <View key={w.id} style={[s.card, { backgroundColor: theme.surface, borderColor: w.overdue ? `${OWE}66` : theme.border }]} testID="waiting-card">
                      <View style={s.cardTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.cardTitle, { color: theme.text }]} numberOfLines={1}>{w.title}</Text>
                          <Text style={[s.cardSub, { color: w.overdue ? OWE : theme.textMuted }]}>{when(w.dueAt)}</Text>
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

            <Text style={[s.sec, { color: theme.text }]}>{t('sched.upcoming')}</Text>
            {list.length === 0 ? (
              <View style={s.empty}>
                <MaterialIcons name="event-repeat" size={30} color={theme.textMuted} />
                <Text style={[s.emptyText, { color: theme.textMuted }]}>{t('sched.empty')}</Text>
              </View>
            ) : list.map(x => {
              const income = x.type === 'INCOME';
              return (
                <TouchableOpacity key={x.id} activeOpacity={0.85} onPress={() => setOpenId(x.id)} testID="schedule-card" accessibilityRole="button"
                                  style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, opacity: x.status === 'PAUSED' ? 0.7 : 1 }]}>
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
                      {x.nextDueAt && x.status === 'ACTIVE' ? t('sched.nextOn', { when: when(x.nextDueAt) }) : x.status === 'ACTIVE' ? t('sched.noNext') : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
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
