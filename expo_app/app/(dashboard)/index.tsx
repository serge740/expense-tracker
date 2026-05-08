import React, { ComponentProps, useCallback, useEffect, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { FadeInView } from '@/components/fade-in-view';
import { getMe } from '@/services/client-auth.service';
import { getWalletSummary } from '@/services/wallet.service';
import { getRecentTransactions, CATEGORY_ICON, formatSubtitle, Transaction } from '@/services/transaction.service';
import { getCurrentBudget, BudgetStatus } from '@/services/budget.service';
import { getReportSummary, ReportSummary } from '@/services/reports.service';
import { BudgetModal } from '@/components/budget-modal';
import { useCurrency } from '@/context/currency-context';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

function fmt(n: number, symbol: string) {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n >= 0 ? `+${symbol}` : `-${symbol}`) + abs;
}

function fmtBalance(n: number, symbol: string) {
  return `${symbol}${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;

  const [firstName,      setFirstName]      = useState('');
  const [summary,        setSummary]        = useState<{ totalBalance: number; walletCount: number } | null>(null);
  const [budget,         setBudget]         = useState<BudgetStatus | null>(null);
  const [recent,         setRecent]         = useState<Transaction[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<ReportSummary | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [showBudget,     setShowBudget]     = useState(false);

  const now       = new Date();
  const month     = now.getMonth() + 1;
  const year      = now.getFullYear();
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [profile, sum, bud, txns, monthly] = await Promise.all([
        getMe(),
        getWalletSummary(),
        getCurrentBudget(),
        getRecentTransactions(3),
        getReportSummary({ month, year }),
      ]);
      setFirstName(profile.firstName);
      setSummary(sum);
      setBudget(bud);
      setRecent(txns);
      setMonthlySummary(monthly);
    } catch {
      // fall through — show empty states
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, year]);

  // Reload whenever the screen comes into focus (e.g. after adding a transaction)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pct      = budget?.percentage ?? 0;
  const pctLabel = `${Math.min(pct, 100)}% used`;
  const pctWidth = `${Math.min(pct, 100)}%` as any;

  const handleBudgetSaved = () => {
    setShowBudget(false);
    load(true);
  };

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />

      <BudgetModal
        visible={showBudget}
        currentLimit={budget?.limit ?? 0}
        onClose={() => setShowBudget(false)}
        onSaved={handleBudgetSaved}
      />

      <ScrollView
        contentContainerStyle={[s.scroll, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor="#fff"
          />
        }
      >

        {/* ── Header (deep koamaru) ── */}
        <View style={[s.headerWrap, { backgroundColor: theme.headerBg }]}>
          <View style={s.headerDecorA} />
          <View style={s.headerDecorB} />

          <FadeInView delay={0} slideFrom="top" distance={14}>
            <View style={s.headerRow}>
              <View>
                <Text style={s.greeting}>GOOD MORNING</Text>
                <Text style={s.userName}>{firstName || 'Welcome'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[s.bellBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
                  activeOpacity={0.7}
                  onPress={() => router.push({ pathname: '/(dashboard)/history', params: { openSearch: 'true' } } as any)}
                >
                  <MaterialIcons name="search" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.bellBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
                  activeOpacity={0.7}
                  onPress={() => router.push('/(dashboard)/(settings)/notifications')}
                >
                  <MaterialIcons name="notifications-none" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </FadeInView>

          {/* Balance card */}
          <FadeInView delay={60} slideFrom="bottom" distance={20}>
            <View style={s.balanceCard}>
              <Text style={s.balLabel}>TOTAL BALANCE</Text>
              {loading ? (
                <ActivityIndicator color="#fff" style={{ marginVertical: 12 }} />
              ) : (
                <Text style={s.balAmount}>
                  {fmtBalance(summary?.totalBalance ?? 0, sym).replace(/(\.\d{2})$/, '')}
                  <Text style={s.balCents}>{`.${((summary?.totalBalance ?? 0).toFixed(2).split('.')[1])}`}</Text>
                </Text>
              )}
              <View style={s.balStats}>
                <View>
                  <Text style={s.balStatLabel}>INCOME</Text>
                  <Text style={s.balStatVal}>
                    {sym}{Math.round(monthlySummary?.totalIncome ?? 0).toLocaleString()}
                  </Text>
                </View>
                <View style={s.balDivider} />
                <View>
                  <Text style={s.balStatLabel}>SPENT</Text>
                  <Text style={s.balStatVal}>
                    {sym}{Math.round(monthlySummary?.totalExpense ?? budget?.spent ?? 0).toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          </FadeInView>
        </View>

        {/* ── Quick actions ── */}
        <FadeInView delay={120} slideFrom="bottom" distance={18}>
          <View style={s.quickWrap}>
            {([
              { icon: 'document-scanner' as IconName, label: 'Scan',    route: '/(dashboard)/scan'    },
              { icon: 'add'              as IconName, label: 'Add',     route: '/(dashboard)/add'     },
              { icon: 'bar-chart'        as IconName, label: 'Reports', route: '/(dashboard)/reports' },
            ] as const).map(a => (
              <TouchableOpacity
                key={a.label}
                style={[s.quickCard, { backgroundColor: theme.surface }]}
                activeOpacity={0.75}
                onPress={() => router.push(a.route as any)}
              >
                <View style={[s.quickIcon, { backgroundColor: theme.primaryBg }]}>
                  <MaterialIcons name={a.icon} size={22} color={theme.primary} />
                </View>
                <Text style={[s.quickLabel, { color: theme.text }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </FadeInView>

        {/* ── Budget ── */}
        {budget && budget.limit > 0 ? (
          <FadeInView delay={180} slideFrom="bottom" distance={16}>
            <View style={[s.budgetCard, { backgroundColor: theme.surface }]}>
              <View style={s.budgetTop}>
                <Text style={[s.budgetTitle, { color: theme.text }]}>{monthName} Budget</Text>
                <View style={s.budgetTopRight}>
                  <Text style={[s.budgetPct, { color: pct >= 100 ? '#F87171' : theme.primary }]}>{pctLabel}</Text>
                  <TouchableOpacity onPress={() => setShowBudget(true)} style={s.editBudgetBtn} activeOpacity={0.7}>
                    <MaterialIcons name="edit" size={14} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[s.track, { backgroundColor: theme.border }]}>
                <View style={[s.fill, { backgroundColor: pct >= 100 ? '#F87171' : theme.primary, width: pctWidth }]} />
              </View>
              <View style={s.budgetFoot}>
                <Text style={[s.budgetSub, { color: theme.textSecondary }]}>{sym}{budget.spent.toFixed(2)} spent</Text>
                <Text style={[s.budgetSub, { color: theme.textMuted }]}>{sym}{budget.limit.toFixed(2)} limit</Text>
              </View>
            </View>
          </FadeInView>
        ) : !loading ? (
          <FadeInView delay={180} slideFrom="bottom" distance={16}>
            <TouchableOpacity
              style={[s.setBudgetRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => setShowBudget(true)}
              activeOpacity={0.75}
            >
              <MaterialIcons name="tune" size={18} color={theme.primary} />
              <Text style={[s.setBudgetText, { color: theme.primary }]}>Set a monthly budget to track spending</Text>
              <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </FadeInView>
        ) : null}

        {/* ── Recent transactions ── */}
        <FadeInView delay={240} slideFrom="bottom" distance={14}>
          <View style={s.sectionRow}>
            <Text style={[s.sectionTitle, { color: theme.text }]}>Recent</Text>
            <TouchableOpacity onPress={() => router.push('/(dashboard)/history')} activeOpacity={0.7}>
              <Text style={[s.seeAll, { color: theme.primary }]}>See all</Text>
            </TouchableOpacity>
          </View>
        </FadeInView>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 20 }} />
        ) : recent.length === 0 ? (
          <FadeInView delay={280} slideFrom="bottom" distance={12}>
            <View style={[s.emptyCard, { backgroundColor: theme.surface }]}>
              <MaterialIcons name="receipt-long" size={32} color={theme.textMuted} />
              <Text style={[s.emptyText, { color: theme.textMuted }]}>No transactions yet</Text>
            </View>
          </FadeInView>
        ) : (
          recent.map((t, i) => (
            <FadeInView key={t.id} delay={280 + i * 50} slideFrom="bottom" distance={12}>
              <TouchableOpacity
                style={[s.txRow, { backgroundColor: theme.surface }]}
                activeOpacity={0.75}
                onPress={() => router.push({
                  pathname: '/(dashboard)/transaction-detail',
                  params: {
                    id: t.id, type: t.type, category: t.category,
                    title: t.title, description: t.description ?? '',
                    amount: String(t.amount), date: String(t.date),
                    walletId: t.walletId ?? '', receiptUrl: t.receiptUrl ?? '',
                  },
                } as any)}
              >
                <View style={[s.txIcon, { backgroundColor: theme.primaryBg }]}>
                  <MaterialIcons name={CATEGORY_ICON[t.category] ?? 'receipt'} size={20} color={theme.primary} />
                </View>
                <View style={s.txText}>
                  <Text style={[s.txTitle, { color: theme.text }]}>{t.title}</Text>
                  <Text style={[s.txSub, { color: theme.textSecondary }]}>{formatSubtitle(t)}</Text>
                </View>
                <Text style={[s.txAmount, { color: t.amount >= 0 ? theme.income : theme.expense }]}>
                  {fmt(t.amount, sym)}
                </Text>
              </TouchableOpacity>
            </FadeInView>
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flexGrow: 1 },

  headerWrap:   { paddingBottom: 24, overflow: 'hidden' },
  headerDecorA: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(255,255,255,0.06)', top: -100, right: -60 },
  headerDecorB: { position: 'absolute', width: 180, height: 180, borderRadius: 90,  backgroundColor: 'rgba(255,255,255,0.04)', bottom: -40, left: -30 },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 20 },
  greeting:     { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2, marginBottom: 3 },
  userName:     { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  bellBtn:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  balanceCard:  { marginHorizontal: 22, borderRadius: 20, padding: 0 },
  balLabel:     { fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, fontWeight: '600', marginBottom: 6 },
  balAmount:    { fontSize: 48, fontWeight: '800', color: '#FFFFFF', marginBottom: 20 },
  balCents:     { fontSize: 28, fontWeight: '600' },
  balStats:     { flexDirection: 'row', alignItems: 'center', gap: 20 },
  balStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, marginBottom: 4 },
  balStatVal:   { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  balDivider:   { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.22)' },

  quickWrap:  { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 20, marginBottom: 14 },
  quickCard:  { flex: 1, borderRadius: 18, paddingVertical: 16, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  quickIcon:  { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },

  budgetCard:     { marginHorizontal: 20, borderRadius: 18, padding: 16, marginBottom: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  budgetTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  budgetTopRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  budgetTitle:    { fontSize: 15, fontWeight: '700' },
  budgetPct:      { fontSize: 13, fontWeight: '700' },
  editBudgetBtn:  { padding: 4 },
  track:          { height: 8, borderRadius: 4, marginBottom: 8 },
  fill:           { height: 8, borderRadius: 4 },
  budgetFoot:     { flexDirection: 'row', justifyContent: 'space-between' },
  budgetSub:      { fontSize: 12 },

  setBudgetRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 18, borderRadius: 14, padding: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  setBudgetText: { flex: 1, fontSize: 13, fontWeight: '500' },

  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  seeAll:       { fontSize: 13, fontWeight: '700' },

  txRow:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 8, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  txIcon:  { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txText:  { flex: 1 },
  txTitle: { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  txSub:   { fontSize: 12 },
  txAmount:{ fontSize: 15, fontWeight: '700' },

  emptyCard: { marginHorizontal: 20, borderRadius: 16, padding: 28, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
});
