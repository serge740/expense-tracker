import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useCurrency } from '@/context/currency-context';
import { usePreferences } from '@/context/preferences-context';
import { StateBlock } from '@/components/history/history-parts';
import { Snackbar } from '@/components/history/history-select';
import { categoryLabelKey, categoryOf } from '@/constants/categories';
import { getTrash, purgeTrash, restoreTrash, type TrashItem } from '@/services/transaction.service';
import { shortAmount } from '@/utils/history';

/** Transactions deleted in the last 30 days: bring one back (balances are put right) or delete it for good. */
export default function TrashScreen() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { prefs } = usePreferences();
  const { currency } = useCurrency();
  const baseCurrency = currency.code;
  const [items, setItems] = useState<TrashItem[]>([]);
  const [days, setDays] = useState(30);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await getTrash(); setItems(r.items); setDays(r.days); setState('ready'); } catch { setState(x => (x === 'loading' ? 'error' : x)); }
    finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => { if (router.canGoBack()) router.back(); else router.navigate('/(dashboard)/history' as any); };
  const fail = (e: any) => Alert.alert(t('common.error'), e?.response?.data?.message || t('select.error'));
  const restore = async (it: TrashItem) => {
    setBusy(it.id);
    try { await restoreTrash(it.id); setItems(x => x.filter(y => y.id !== it.id)); setNote(t('select.undone')); } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const purge = (it: TrashItem) => Alert.alert(t('trash.purge'), t('trash.purgeMsg', { title: it.title }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('trash.purge'), style: 'destructive', onPress: async () => { try { await purgeTrash(it.id); setItems(x => x.filter(y => y.id !== it.id)); } catch (e) { fail(e); } } },
  ]);
  const left = (it: TrashItem) => Math.max(0, Math.ceil((new Date(it.expiresAt).getTime() - Date.now()) / 86_400_000));

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={s.head}>
        <TouchableOpacity onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={s.iconBtn}><MaterialIcons name="arrow-back" size={24} color={theme.text} /></TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>{t('trash.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}>
        {state === 'loading' ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
        {state === 'error' ? <StateBlock testID="trash-error" icon="cloud-off" title={t('history.errorTitle')} body={t('history.errorBody')} primary={{ label: t('history.retry'), icon: 'refresh', onPress: () => { setState('loading'); load(); } }} /> : null}
        {state === 'ready' && items.length === 0 ? <StateBlock testID="trash-empty" icon="delete-outline" title={t('trash.emptyTitle')} body={t('trash.emptyBody', { days })} /> : null}
        {state === 'ready' && items.length ? (
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            {items.map((it, i) => {
              const cat = categoryOf(it.category as never);
              const cur = it.currency ?? baseCurrency;
              return (
                <View key={it.id} testID="trash-row" style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                  <View style={[s.icon, { backgroundColor: `${cat.color}26` }]}><MaterialIcons name={it.type === 'TRANSFER' ? 'swap-horiz' : cat.icon} size={21} color={cat.color} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{it.title}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12.5 }} numberOfLines={1}>
                      {prefs.hideBalances ? '•••••' : `${shortAmount(it.amount)} ${cur}`} · {formatDate(it.date, { day: 'numeric', month: 'short' })}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11.5 }}>{t('trash.expires', { n: left(it) })}</Text>
                  </View>
                  <TouchableOpacity testID="trash-restore" disabled={busy === it.id} onPress={() => restore(it)} accessibilityRole="button" style={[s.btn, { backgroundColor: theme.primaryBg }]}>
                    <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>{t('trash.restore')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="trash-purge" onPress={() => purge(it)} accessibilityRole="button" accessibilityLabel={t('trash.purge')} style={s.iconBtn}><MaterialIcons name="delete-forever" size={22} color={theme.negative} /></TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
      {note ? <Snackbar message={note} onDone={() => setNote(null)} ms={3000} /> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  btn: { paddingHorizontal: 12, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
