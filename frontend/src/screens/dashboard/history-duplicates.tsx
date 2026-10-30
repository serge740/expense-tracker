import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { usePreferences } from '@/context/preferences-context';
import { StateBlock } from '@/components/history/history-parts';
import { Snackbar } from '@/components/history/history-select';
import { categoryLabelKey } from '@/constants/categories';
import { getDuplicateGroups, keepDuplicates } from '@/services/history.service';
import { deleteTransaction } from '@/services/transaction.service';
import { ZERO_DECIMAL, shortAmount, type FeedRow } from '@/utils/history';

type Group = { id: string; rows: FeedRow[] };

/** Rows that look like the same payment entered twice, side by side: delete the extra one, or keep them all. */
export default function HistoryDuplicatesScreen() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { prefs } = usePreferences();
  const [groups, setGroups] = useState<Group[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await getDuplicateGroups(); setGroups(r.groups); setTruncated(r.truncated); setState('ready'); } catch { setState(x => (x === 'loading' ? 'error' : x)); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => { if (router.canGoBack()) router.back(); else router.navigate('/(dashboard)/history' as any); };
  const fail = (e: any) => Alert.alert(t('common.error'), e?.response?.data?.message || t('select.error'));
  const del = async (g: Group, row: FeedRow) => {
    setBusy(row.id);
    try {
      await deleteTransaction(row.id);
      setNote(t('hx.dup.deleted'));
      // A group with one row left is no longer a duplicate.
      setGroups(list => list.map(x => (x.id === g.id ? { ...x, rows: x.rows.filter(r => r.id !== row.id) } : x)).filter(x => x.rows.length > 1));
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const keep = async (g: Group) => {
    setBusy(g.id);
    try { await keepDuplicates(g.rows.map(r => r.id)); setNote(t('hx.dup.kept')); setGroups(list => list.filter(x => x.id !== g.id)); } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const money = (r: FeedRow) => `${r.amount < 0 ? '−' : '+'}${prefs.hideBalances ? '•••••' : shortAmount(Math.abs(r.amount), ZERO_DECIMAL.has(r.currency ?? ''))} ${r.currency ?? ''}`.trim();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={s.head}>
        <TouchableOpacity testID="dup-back" onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={s.iconBtn}><MaterialIcons name="arrow-back" size={24} color={theme.text} /></TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>{t('hx.dup.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        {state === 'loading' ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
        {state === 'error' ? <StateBlock testID="dup-error" icon="cloud-off" title={t('history.errorTitle')} body={t('history.errorBody')} primary={{ label: t('history.tryAgain'), icon: 'refresh', onPress: () => { setState('loading'); load(); } }} /> : null}
        {state === 'ready' && groups.length === 0 ? <StateBlock testID="dup-empty" icon="done-all" title={t('hx.dup.none')} body="" /> : null}
        {state === 'ready' && groups.length ? <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginHorizontal: 16, marginBottom: 8 }}>{t('hx.dup.hint')}</Text> : null}
        {state === 'ready' ? groups.map(g => (
          <View key={g.id} testID="dup-group" style={[s.card, { backgroundColor: theme.surface }]}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {g.rows.map(r => (
                <View key={r.id} testID="dup-row" style={[s.col, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>{r.title}</Text>
                  <Text style={{ color: r.amount < 0 ? theme.negative : theme.positive, fontSize: 15, fontWeight: '700', marginTop: 4 }}>{money(r)}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>{formatDate(r.date, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>{r.wallet?.name ?? '—'}{r.type === 'TRANSFER' ? '' : ` · ${t(categoryLabelKey(r.category, r.type === 'INCOME' ? 'INCOME' : 'EXPENSE') as any)}`}</Text>
                  {r.author ? <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>{r.author.isYou ? t('family.tx.you') : r.author.name}</Text> : null}
                  <TouchableOpacity testID="dup-delete" disabled={busy !== null} onPress={() => del(g, r)} accessibilityRole="button" style={[s.delete, { borderColor: theme.negative, opacity: busy ? 0.5 : 1 }]}>
                    <MaterialIcons name="delete-outline" size={16} color={theme.negative} /><Text style={{ color: theme.negative, fontSize: 12.5, fontWeight: '600' }}>{t('hx.dup.delete')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity testID="dup-keep" disabled={busy !== null} onPress={() => keep(g)} accessibilityRole="button" style={[s.keep, { backgroundColor: theme.primaryBg, opacity: busy ? 0.5 : 1 }]}>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('hx.dup.keepAll')}</Text>
            </TouchableOpacity>
          </View>
        )) : null}
        {truncated ? <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 }}>{t('hx.dup.truncated')}</Text> : null}
        <View style={{ height: 80 }} />
      </ScrollView>
      {note ? <Snackbar message={note} onDone={() => setNote(null)} /> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', flex: 1 },
  scroll: { paddingTop: 4 },
  card: { marginHorizontal: 12, marginBottom: 12, borderRadius: 18, padding: 12 },
  col: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 14, padding: 10 },
  delete: { marginTop: 10, minHeight: 40, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  keep: { marginTop: 10, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
