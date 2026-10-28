// Ported from expo_app/app/(dashboard)/index.tsx
import React, { ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, RefreshControl } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { FadeInView } from '@/components/fade-in-view';
import { getMe } from '@/services/client-auth.service';
import { getRecentTransactions, CATEGORY_ICON, formatSubtitle, Transaction } from '@/services/transaction.service';
import { getCurrentBudget, BudgetStatus } from '@/services/budget.service';
import { getHomeSummary, AttentionItem, HomeSummary } from '@/services/home.service';
import { ToneChip } from '@/components/debt/tone-chip';
import { PushBanner } from '@/components/push/prompts';
import { DebtCreditCards, FeedChips, LoansBar, NeedsAttention, NetWorthRows } from '@/components/home/home-sections';
import { useI18n } from '@/context/language-context';
import { usePreferences } from '@/context/preferences-context';
import { currencyEntries, needsLoansHint } from '@/utils/home';
import { ROLE_TAG } from '@/utils/debt';
import { BudgetModal } from '@/components/budget-modal';
import { useCurrency } from '@/context/currency-context';

type IconName = string;

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
  const { t: tr } = useI18n();
  const { prefs, setPref } = usePreferences();
  const includeLoans = prefs.includeLoans;
  const view = prefs.homeView;

  const [firstName,      setFirstName]      = useState('');
  const [budget,         setBudget]         = useState<BudgetStatus | null>(null);
  const [recent,         setRecent]         = useState<Transaction[]>([]);
  const [summary,        setSummary]        = useState<HomeSummary | null>(null);
  const ready = useRef(false);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [showBudget,     setShowBudget]     = useState(false);

  const now       = new Date();
  const month     = now.getMonth() + 1;
  const year      = now.getFullYear();
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });

  // The month figures and the feed follow the "Include loans" switch; the feed also follows the chip.
  const loadSummary = useCallback(async () => {
    try { setSummary(await getHomeSummary({ month, year, includeLoans })); } catch { /* keep the last one */ }
  }, [month, year, includeLoans]);
  const loadFeed = useCallback(async () => {
    try { setRecent(await getRecentTransactions(5, view, includeLoans)); } catch { /* keep the last one */ }
  }, [view, includeLoans]);

  // The full load is kept stable (through refs) so changing a chip or the switch refreshes only what it affects.
  const summaryRef = useRef(loadSummary);
  const feedRef = useRef(loadFeed);
  summaryRef.current = loadSummary;
  feedRef.current = loadFeed;
  useEffect(() => { if (ready.current) loadSummary(); }, [loadSummary]);
  useEffect(() => { if (ready.current) loadFeed(); }, [loadFeed]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [profile, bud] = await Promise.all([getMe(), getCurrentBudget(), summaryRef.current(), feedRef.current()]);
      setFirstName(profile.firstName);
      setBudget(bud);
    } catch {
      // fall through — show empty states
    } finally {
      ready.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the screen comes into focus (e.g. after adding a transaction)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAttention = (it: AttentionItem) => {
    if (it.source === 'SCHEDULED') router.push({ pathname: '/(dashboard)/scheduled', params: { id: it.scheduleId } } as any);
    else router.push({ pathname: '/(dashboard)/debts', params: { openId: it.debtId } } as any);
  };
  const showDebtSection = !!summary && (currencyEntries(summary.owe).length > 0 || currencyEntries(summary.owed).length > 0 || summary.scheduled.waiting > 0 || !!summary.scheduled.next);

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
              <Text style={s.balLabel}>{monthName.toUpperCase()} NET</Text>
              {loading ? (
                <ActivityIndicator color="#fff" style={{ marginVertical: 12 }} />
              ) : (() => {
                const net     = summary?.totals.net ?? 0;
                const netAbs  = Math.abs(net).toFixed(2);
                const intPart = netAbs.split('.')[0];
                const decPart = netAbs.split('.')[1];
                const sign    = net >= 0 ? `+${sym}` : `-${sym}`;
                return (
                  <Text numberOfLines={1} adjustsFontSizeToFit style={[s.balAmount, { color: net >= 0 ? '#fff' : '#FDA4A4' }]}>
                    {sign}{parseInt(intPart, 10).toLocaleString()}
                    <Text style={s.balCents}>.{decPart}</Text>
                  </Text>
                );
              })()}
              <View style={s.balStats}>
                <View>
                  <Text style={s.balStatLabel}>INCOME</Text>
                  <Text style={s.balStatVal}>
                    {sym}{Math.round(summary?.totals.income ?? 0).toLocaleString()}
                  </Text>
                </View>
                <View style={s.balDivider} />
                <View>
                  <Text style={s.balStatLabel}>SPENT</Text>
                  <Text style={s.balStatVal}>
                    {sym}{Math.round(summary?.totals.expense ?? budget?.spent ?? 0).toLocaleString()}
                  </Text>
                </View>
              </View>
              {summary && <LoansBar loans={summary.loans} includeLoans={includeLoans} onToggle={v => setPref('includeLoans', v)} />}
            </View>
          </FadeInView>
        </View>

        {/* ── Quick actions ── */}
        <FadeInView delay={120} slideFrom="bottom" distance={18}>
          <PushBanner />
          <View style={s.quickWrap}>
            {([
              // Receipt scanning is hidden for now; attach receipt photos from Add instead.
              { icon: 'currency-exchange' as IconName, label: 'Exchange', route: '/(dashboard)/transfer?mode=exchange' },
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

        {/* ── Debts, credits, scheduled, what needs you, net worth ── */}
        {showDebtSection && summary && (
          <FadeInView delay={150} slideFrom="bottom" distance={16}>
            <View style={s.sectionRow}>
              <Text style={[s.sectionTitle, { color: theme.text }]}>{tr('home.debtsCredits')}</Text>
              <TouchableOpacity onPress={() => router.push('/(dashboard)/debts' as any)} activeOpacity={0.7}>
                <Text style={[s.seeAll, { color: theme.primary }]}>{tr('home.manage')}</Text>
              </TouchableOpacity>
            </View>
            <DebtCreditCards owe={summary.owe} owed={summary.owed} scheduled={summary.scheduled} hidden={prefs.hideBalances}
                             onOwe={() => router.push('/(dashboard)/debts' as any)} onOwed={() => router.push('/(dashboard)/debts' as any)}
                             onScheduled={() => router.push('/(dashboard)/scheduled' as any)} />
            <NeedsAttention items={summary.attention} total={summary.attentionTotal} hidden={prefs.hideBalances} fallbackCurrency={currency.code} onOpen={openAttention} />
            <View style={{ height: 10 }} />
            <NetWorthRows netWorth={summary.netWorth} hidden={prefs.hideBalances} />
            <View style={{ height: 14 }} />
          </FadeInView>
        )}

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
              <Text style={[s.budgetSub, { color: theme.textMuted, marginTop: 6 }]}>{tr('home.budgetNoLoans')}</Text>
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
            <Text style={[s.sectionTitle, { color: theme.text }]}>{tr('home.recent')}</Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/(dashboard)/history', params: { view, includeLoans: String(includeLoans) } } as any)}
              activeOpacity={0.7}
            >
              <Text style={[s.seeAll, { color: theme.primary }]}>{tr('home.seeAll')}</Text>
            </TouchableOpacity>
          </View>
          <FeedChips value={view} onChange={v => setPref('homeView', v)} />
          {needsLoansHint(view, includeLoans) && (
            <Text style={[s.hint, { color: theme.textMuted }]}>{tr('home.loansHint')}</Text>
          )}
        </FadeInView>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 20 }} />
        ) : recent.length === 0 ? (
          <FadeInView delay={280} slideFrom="bottom" distance={12}>
            <View style={[s.emptyCard, { backgroundColor: theme.surface }]}>
              <MaterialIcons name="receipt-long" size={32} color={theme.textMuted} />
              <Text style={[s.emptyText, { color: theme.textMuted }]}>{view === 'all' ? 'No transactions yet' : tr(view === 'scheduled' ? 'home.emptyScheduled' : 'home.emptyView')}</Text>
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
                    title: t.title, subCategory: t.subCategory ?? '',
                    description: t.description ?? '',
                    amount: String(t.amount), date: String(t.date),
                    walletId: t.walletId ?? '', receiptUrl: t.receiptUrl ?? '',
                    receiptReportUrl: t.receiptReportUrl ?? '',
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
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={[s.txAmount, { color: t.debtRole === 'BORROW_IN' ? theme.textSecondary : t.amount >= 0 ? theme.income : theme.expense }]}>
                    {fmt(t.amount, sym)}
                  </Text>
                  {t.debtRole ? <ToneChip label={tr(ROLE_TAG[t.debtRole].label)} tone={ROLE_TAG[t.debtRole].tone} /> : null}
                </View>
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

  hint:      { fontSize: 11, lineHeight: 15, marginHorizontal: 20, marginBottom: 8 },
  emptyCard: { marginHorizontal: 20, borderRadius: 16, padding: 28, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
});
