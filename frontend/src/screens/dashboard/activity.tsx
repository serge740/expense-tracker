import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect, useLocalSearchParams } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { usePreferences } from '@/context/preferences-context';
import { StateBlock } from '@/components/history/history-parts';
import { getActivity, type ActivityChange, type ActivityItem, type ActivityWeek } from '@/services/history.service';
import { restoreTrash } from '@/services/transaction.service';
import { shortAmount } from '@/utils/history';
import type { StringKey } from '@/i18n/strings';

type Tab = 'all' | 'transaction' | 'wallet' | 'debt' | 'budget' | 'schedule' | 'family';
const TABS: Array<{ id: Tab; label: StringKey }> = [
  { id: 'all', label: 'act.all' }, { id: 'transaction', label: 'act.transactions' }, { id: 'wallet', label: 'act.wallets' }, { id: 'debt', label: 'act.debts' },
  { id: 'budget', label: 'act.budgets' }, { id: 'schedule', label: 'act.schedules' }, { id: 'family', label: 'act.familyTab' },
];
const KIND: Record<string, { label: StringKey; icon: string; tone: 'pos' | 'neg' | 'info' }> = {
  'transaction.created': { label: 'act.created', icon: 'add-circle-outline', tone: 'pos' },
  'transaction.edited': { label: 'act.edited', icon: 'edit', tone: 'info' },
  'transaction.deleted': { label: 'act.deleted', icon: 'delete-outline', tone: 'neg' },
  'transaction.restored': { label: 'act.restored', icon: 'restore', tone: 'pos' },
  'wallet.created': { label: 'act.walletCreated', icon: 'account-balance-wallet', tone: 'pos' },
  'wallet.edited': { label: 'act.walletEdited', icon: 'edit', tone: 'info' },
  'wallet.deleted': { label: 'act.walletDeleted', icon: 'delete-outline', tone: 'neg' },
  'wallet.transfer': { label: 'act.transfer', icon: 'swap-horiz', tone: 'info' },
  'budget.set': { label: 'act.budgetSet', icon: 'savings', tone: 'info' },
  'debt.created': { label: 'act.debtCreated', icon: 'handshake', tone: 'pos' },
  'debt.payment': { label: 'act.debtPayment', icon: 'payments', tone: 'pos' },
  'debt.payment_removed': { label: 'act.debtPaymentRemoved', icon: 'remove-circle-outline', tone: 'neg' },
  'debt.written_off': { label: 'act.debtWrittenOff', icon: 'money-off', tone: 'info' },
  'debt.reopened': { label: 'act.debtReopened', icon: 'restore', tone: 'info' },
  'debt.archived': { label: 'act.debtArchived', icon: 'archive', tone: 'info' },
  'debt.restored': { label: 'act.debtRestored', icon: 'unarchive', tone: 'pos' },
  'debt.deleted': { label: 'act.debtDeleted', icon: 'delete-outline', tone: 'neg' },
  'schedule.created': { label: 'act.schedCreated', icon: 'event-repeat', tone: 'pos' },
  'schedule.edited': { label: 'act.schedEdited', icon: 'edit-calendar', tone: 'info' },
  'schedule.paused': { label: 'act.schedPaused', icon: 'pause-circle-outline', tone: 'info' },
  'schedule.resumed': { label: 'act.schedResumed', icon: 'play-circle-outline', tone: 'pos' },
  'schedule.ended': { label: 'act.schedEnded', icon: 'event-busy', tone: 'neg' },
};

/** The timeline: what was added, changed, deleted or moved, newest first, edits shown as before → after. */
export default function ActivityScreen() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { prefs } = usePreferences();
  const params = useLocalSearchParams<{ entity?: string; entityId?: string }>();
  const entityId = params.entityId || undefined;
  const [tab, setTab] = useState<Tab>((entityId && (params.entity as Tab)) || 'all');
  const [week, setWeek] = useState<ActivityWeek | null>(null);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (which: Tab, cursor: string | null = null) => {
    try {
      const r = await getActivity({ cursor, entityId, entity: which === 'all' ? undefined : which });
      setWeek(r.week ?? null);
      setItems(x => (cursor ? [...x, ...r.items] : r.items)); setNext(r.next); setSince(r.since); setState('ready');
    } catch { setState(x => (x === 'loading' ? 'error' : x)); }
    finally { setRefreshing(false); setMore(false); }
  }, [entityId]);
  useFocusEffect(useCallback(() => { load(tab); }, [load, tab]));

  const pick = (x: Tab) => { setTab(x); setState('loading'); setItems([]); };
  const back = () => { if (router.canGoBack()) router.back(); else router.navigate('/(dashboard)/history' as any); };
  const restore = async (it: ActivityItem) => {
    if (!it.trashId) return;
    setBusy(it.id);
    try { await restoreTrash(it.trashId); await load(tab); }
    catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('select.error')); }
    finally { setBusy(null); }
  };
  const label = (f: string) => { const k = `act.f.${f}` as StringKey; const v = t(k); return v === k ? f : v; };
  const value = (c: ActivityChange, v: string | number | null) => {
    if (v === null) return '—';
    if (c.field === 'date') return formatDate(String(v), { day: 'numeric', month: 'short', year: 'numeric' });
    if (typeof v === 'number') return prefs.hideBalances ? '•••••' : shortAmount(v);
    return String(v);
  };
  const tone = (k: 'pos' | 'neg' | 'info') => (k === 'pos' ? theme.positive : k === 'neg' ? theme.negative : theme.primary);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={s.head}>
        <TouchableOpacity onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={s.iconBtn}><MaterialIcons name="arrow-back" size={24} color={theme.text} /></TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>{t('act.title')}</Text>
      </View>
      {week && !entityId && week.total > 0 ? <Text testID="act-week" style={{ color: theme.textSecondary, fontSize: 12.5, paddingHorizontal: 16, paddingBottom: 8 }}>{t('act.week', { added: week.added, changed: week.changed, deleted: week.deleted })}</Text> : null}
      <View style={s.tabs}>
        {(entityId ? [] : TABS).map(({ id: x, label: lab }) => (
          <TouchableOpacity key={x} testID={`act-tab-${x}`} onPress={() => pick(x)} accessibilityRole="tab" accessibilityState={{ selected: tab === x }}
                            style={[s.tab, { backgroundColor: tab === x ? theme.primaryBg : theme.surface, borderColor: tab === x ? theme.primary : theme.border }]}>
            <Text style={{ color: tab === x ? theme.primary : theme.text, fontSize: 13, fontWeight: tab === x ? '700' : '500' }}>{t(lab)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(tab); }} tintColor={theme.primary} />}>
        {state === 'loading' ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
        {state === 'error' ? <StateBlock testID="act-error" icon="cloud-off" title={t('act.error')} body="" primary={{ label: t('history.retry'), icon: 'refresh', onPress: () => { setState('loading'); load(tab); } }} /> : null}
        {state === 'ready' && items.length === 0 ? <StateBlock testID="act-empty" icon="history" title={t('act.emptyTitle')} body={t('act.emptyBody')} /> : null}
        {state === 'ready' && items.length ? (
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            {items.map((it, i) => {
              const k = KIND[it.kind] ?? { label: (it.kind.startsWith('family.') ? 'act.familyEvent' : 'act.edited') as StringKey, icon: 'history', tone: 'info' as const };
              const c = tone(k.tone);
              return (
                <View key={it.id} testID="act-row" style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                  <View style={[s.icon, { backgroundColor: `${c}22` }]}><MaterialIcons name={k.icon as any} size={20} color={c} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={2}>{t(k.label)} · {it.title}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12.5 }} numberOfLines={1}>
                      {formatDate(it.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {it.amount !== null ? ` · ${prefs.hideBalances ? '•••••' : shortAmount(it.amount)}${it.currency ? ` ${it.currency}` : ''}` : ''}
                      {it.actor ? ` · ${t('act.by', { name: it.actor.isYou ? t('act.you') : it.actor.name })}` : ''}
                    </Text>
                    {(it.changes ?? []).map(ch => (
                      <Text key={ch.field} testID="act-change" style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 2 }}>
                        {label(ch.field)}: {value(ch, ch.from)} → {value(ch, ch.to)}
                      </Text>
                    ))}
                  </View>
                  {it.trashId ? (
                    <TouchableOpacity testID="act-restore" disabled={busy === it.id} onPress={() => restore(it)} accessibilityRole="button" style={[s.btn, { backgroundColor: theme.primaryBg }]}>
                      <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>{t('act.restore')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
        {state === 'ready' && next ? (
          <TouchableOpacity testID="act-more" disabled={more} onPress={() => { setMore(true); load(tab, next); }} accessibilityRole="button" style={[s.moreBtn, { borderColor: theme.border }]}>
            <Text style={{ color: theme.primary, fontWeight: '600' }}>{t('act.more')}</Text>
          </TouchableOpacity>
        ) : null}
        {state === 'ready' && since ? <Text testID="act-since" style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 14 }}>{t('act.since', { date: formatDate(since, { day: 'numeric', month: 'long', year: 'numeric' }) })}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  tab: { paddingHorizontal: 14, minHeight: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  btn: { paddingHorizontal: 12, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  moreBtn: { marginTop: 12, minHeight: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
