// Ported from expo_app/app/(dashboard)/debt-ledger.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect, useLocalSearchParams } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { usePreferences } from '@/context/preferences-context';
import { LedgerHero } from '@/components/debt/ledger-cards';
import { DebtProgressCard } from '@/components/debt/debt-progress-card';
import { Debt, DebtKind, getDebts, getLedger, Ledger } from '@/services/debt.service';
import { sortForLedger } from '@/utils/debt';

type Filter = 'ALL' | 'OPEN' | 'CLOSED';

/**
 * The Debt wallet (what I owe) or Credit wallet (owed to me): the totals, then one card for each debt or
 * credit that was created, with how much is paid and how much is left. Tapping a card opens its details.
 */
function DebtLedgerScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { prefs } = usePreferences();
  const hidden = prefs.hideBalances;
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: DebtKind = kindParam === 'LENT' ? 'LENT' : 'BORROWED';
  const lent = kind === 'LENT';

  const [ledger, setLedger]   = useState<Ledger | null>(null);
  const [debts, setDebts]     = useState<Debt[]>([]);
  const [filter, setFilter]   = useState<Filter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, all] = await Promise.all([getLedger(kind), getDebts()]);
      setLedger(l);
      setDebts(all.filter(d => d.kind === kind));
    } catch { /* keep what we have */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [kind]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => sortForLedger(debts.filter(d => (filter === 'ALL' ? true : filter === 'OPEN' ? d.status === 'OPEN' : d.status !== 'OPEN'))), [debts, filter]);

  const tabs: { id: Filter; label: string }[] = [
    { id: 'ALL', label: t('debt2.all') },
    { id: 'OPEN', label: t('debt2.openTab') },
    { id: 'CLOSED', label: t('debt2.closedTab') },
  ];

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={[s.round, { backgroundColor: theme.surface, borderColor: theme.border }]}
                          accessibilityRole="button" accessibilityLabel={t('rem.back')}>
          <MaterialIcons name="arrow-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.text }]}>{t(lent ? 'debt2.creditWallet' : 'debt2.debtWallet')}</Text>
          <Text style={[s.sub, { color: theme.textMuted }]}>{t(lent ? 'debt2.creditWalletSub' : 'debt2.debtWalletSub')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}>
        <LedgerHero kind={kind} ledger={ledger} hidden={hidden} />
        <Text style={[s.note, { color: theme.textMuted }]}>{t('debts.flowHint')}</Text>

        <View style={[s.tabs, { backgroundColor: theme.inputBg }]}>
          {tabs.map(x => {
            const on = filter === x.id;
            return (
              <TouchableOpacity key={x.id} onPress={() => setFilter(x.id)} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: on }}
                                style={[s.tab, on && { backgroundColor: theme.surface }]}>
                <Text style={[s.tabText, { color: on ? theme.primary : theme.textMuted }]} numberOfLines={1}>{x.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ marginTop: 14 }}>
          {loading ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : shown.length === 0 ? (
            <Text style={[s.empty, { color: theme.textMuted }]}>{t('debt2.noDebts')}</Text>
          ) : shown.map(d => (
            <DebtProgressCard key={d.id} debt={d} hidden={hidden}
                              onPress={() => router.push({ pathname: '/(dashboard)/debts' as any, params: { openId: d.id } })} />
          ))}
        </View>
      </ScrollView>
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
  note:   { fontSize: 10.5, lineHeight: 15, marginTop: 8 },

  tabs:    { flexDirection: 'row', borderRadius: 14, padding: 3, marginTop: 14 },
  tab:     { flex: 1, alignItems: 'center', justifyContent: 'center', height: 34, borderRadius: 11 },
  tabText: { fontSize: 12, fontWeight: '700' },
  empty:   { fontSize: 12, textAlign: 'center', paddingVertical: 24 },
});

export default DebtLedgerScreen;
