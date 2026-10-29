// Ported from expo_app/app/(dashboard)/index.tsx
import { ScopePill } from '@/components/family/scope-switcher';
import { FamilyBalanceCard } from '@/components/family/family-balance-card';
import { MemberAvatar } from '@/components/family/member-avatar';
import { useScope } from '@/context/scope-context';
import { detailParams } from '@/utils/tx-nav';
import React, { ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, RefreshControl, useWindowDimensions } from '@/rn';
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
import { currencyEntries, needsLoansHint, type FeedView } from '@/utils/home';
import { ROLE_TAG } from '@/utils/debt';
import { BudgetModal } from '@/components/budget-modal';
import { useCurrency } from '@/context/currency-context';
import { LinearGradient } from '@/rn/gradient';
import Svg, { Circle } from '@/rn/svg';

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
  const scope = useScope();
  const isFamily = scope.isFamily;
  // Small phones (320-360 wide): the big numbers shrink to fit their box and the quick actions stack.
  const { width: screenW } = useWindowDimensions();
  const compact = screenW < 380;
  const fitSize = (text: string, boxW: number, max: number, min = 14) => Math.max(min, Math.min(max, Math.floor(boxW / (Math.max(text.length, 1) * 0.6))));
  // A family has no loans, debts or schedules: loans are always "included" (there are none) and only three chips make sense.
  const [familyView, setFamilyView] = useState<FeedView>('all');
  const includeLoans = isFamily ? true : prefs.includeLoans;
  const view = isFamily ? familyView : prefs.homeView;

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
  const showDebtSection = !isFamily && !!summary && (currencyEntries(summary.owe).length > 0 || currencyEntries(summary.owed).length > 0 || summary.scheduled.waiting > 0 || !!summary.scheduled.next);

  const pct      = budget?.percentage ?? 0;
  const pctLabel = `${Math.min(pct, 100)}% used`;
  const pctWidth = `${Math.min(pct, 100)}%` as any;

  const handleBudgetSaved = () => {
    setShowBudget(false);
    load(true);
  };

  // The hero is always a deep card (like the design), in the brand teal or, inside a family, the family purple.
  const heroColors: [string, string, string] = isFamily
    ? (theme.isDark ? ['#2A1D5C', '#1F1547', '#170F36'] : ['#6D52E0', '#5B3FD0', '#46309F'])
    : (theme.isDark ? ['#1D3B47', '#112730', '#0D1E25'] : ['#0A7799', '#00627F', '#064A5F']);
  const net = summary?.totals.net ?? 0;
  const status = !summary ? null
    : budget && budget.limit > 0 && pct >= 100 ? { label: `▼ ${tr('home.overBudget')}`, color: '#FF9D9A' }
    : net < 0 ? { label: `▼ ${tr('home.overBudget')}`, color: '#FF9D9A' }
    : { label: `▲ ${tr('home.onTrack')}`, color: '#4ADE80' };
  const netColor = net >= 0 ? '#FFFFFF' : '#FF9D9A';
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString()}`;
  const dim = 'rgba(255,255,255,0.62)';
  const incomeText = money(summary?.totals.income ?? 0);
  const spentText = money(summary?.totals.expense ?? budget?.spent ?? 0);
  // both tiles share one size (the smaller of what each needs) so they look alike
  const tileFont = Math.min(fitSize(incomeText, (screenW - 36 - 40 - 10) / 2 - 28, 20, 13), fitSize(spentText, (screenW - 36 - 40 - 10) / 2 - 28, 20, 13));
  // each tile is half the card, less the card's and the tile's padding

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <BudgetModal
        visible={showBudget}
        currentLimit={budget?.limit ?? 0}
        onClose={() => setShowBudget(false)}
        onSaved={handleBudgetSaved}
      />

      <ScrollView
        contentContainerStyle={[s.scroll, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={theme.primary}
          />
        }
      >

        {/* ── Top row: who you are, search, notifications ── */}
        <FadeInView delay={0} slideFrom="top" distance={14}>
          <View style={s.headerRow}>
            <View style={[s.avatar, { backgroundColor: theme.primaryBg, borderColor: theme.primary }]}>
              <Text style={[s.avatarText, { color: theme.primary }]}>{(firstName || 'A').slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.greeting, { color: theme.textSecondary }]}>{tr('home.greeting')}</Text>
              <Text style={[s.userName, { color: theme.text }]} numberOfLines={1}>{firstName || 'Welcome'}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Search" style={[s.roundBtn, { backgroundColor: theme.surface }]} activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/(dashboard)/history', params: { openSearch: 'true' } } as any)}
            >
              <MaterialIcons name="search" size={20} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Notifications" style={[s.roundBtn, { backgroundColor: theme.surface }]} activeOpacity={0.7}
              onPress={() => router.push('/(dashboard)/(settings)/notifications')}
            >
              <MaterialIcons name="notifications-none" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
          <View style={s.pillRow}><ScopePill /></View>
        </FadeInView>

        {/* ── Hero: this month at a glance ── */}
        <FadeInView delay={60} slideFrom="bottom" distance={20}>
          <LinearGradient colors={heroColors} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[s.hero, compact && { padding: 16, paddingBottom: 14, borderRadius: 26 }]}>
            <View style={s.heroTop}>
              <Text numberOfLines={2} style={[s.heroLabel, { color: dim, fontSize: compact ? 10 : 11 }]}>{tr('home.netLabel', { month: monthName }).toUpperCase()}</Text>
              {status && !loading ? (
                <View style={[s.statusChip, { backgroundColor: `${status.color}22` }]}>
                  <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              ) : null}
            </View>
            {loading ? (
              <ActivityIndicator color="#fff" style={{ marginVertical: 18 }} />
            ) : (() => {
              const netAbs  = Math.abs(net).toFixed(2);
              const intPart = netAbs.split('.')[0];
              const decPart = netAbs.split('.')[1];
              const sign    = net >= 0 ? `+${sym}` : `-${sym}`;
              const whole   = `${sign}${parseInt(intPart, 10).toLocaleString()}`;
              const size    = fitSize(`${whole}.${decPart}`, screenW - 36 - 40, 44, 22);
              return (
                <Text numberOfLines={1} style={[s.heroAmount, { color: netColor, fontSize: size, lineHeight: Math.round(size * 1.15) }]}>
                  {whole}
                  <Text style={[s.heroCents, { fontSize: Math.round(size * 0.55) }]}>.{decPart}</Text>
                </Text>
              );
            })()}
            <View style={s.tiles}>
              <View style={[s.tile, compact && s.tileCompact]}>
                <View style={s.tileHead}>
                  <View style={[s.tileIcon, { backgroundColor: 'rgba(74,222,128,0.16)' }]}><MaterialIcons name="south-west" size={12} color="#4ADE80" /></View>
                  <Text style={[s.tileLabel, { color: dim }]}>INCOME</Text>
                </View>
                <Text numberOfLines={1} style={[s.tileVal, { fontSize: tileFont }]}>{money(summary?.totals.income ?? 0)}</Text>
              </View>
              <View style={[s.tile, compact && s.tileCompact]}>
                <View style={s.tileHead}>
                  <View style={[s.tileIcon, { backgroundColor: 'rgba(255,157,154,0.16)' }]}><MaterialIcons name="north-east" size={12} color="#FF9D9A" /></View>
                  <Text style={[s.tileLabel, { color: dim }]}>SPENT</Text>
                </View>
                <Text numberOfLines={1} style={[s.tileVal, { fontSize: tileFont }]}>{money(summary?.totals.expense ?? budget?.spent ?? 0)}</Text>
              </View>
            </View>
            {summary && !isFamily && <LoansBar loans={summary.loans} includeLoans={includeLoans} onToggle={v => setPref('includeLoans', v)} />}
          </LinearGradient>
        </FadeInView>

        {/* ── Quick actions ── */}
        <FadeInView delay={120} slideFrom="bottom" distance={18}>
          <PushBanner />
          <View style={s.quickWrap}>
            {([
              // Receipt scanning is hidden for now; attach receipt photos from Add instead.
              { icon: 'currency-exchange' as IconName, label: 'Exchange', route: '/(dashboard)/transfer?mode=exchange', bg: theme.primary,  fg: theme.isDark ? '#08222B' : '#FFFFFF' },
              { icon: 'add'              as IconName, label: 'Add',      route: '/(dashboard)/add',                     bg: theme.income,   fg: '#08222B' },
              { icon: 'bar-chart'        as IconName, label: 'Reports',  route: '/(dashboard)/reports',                 bg: theme.primaryBg, fg: theme.primary },
            ] as const).map(a => (
              <TouchableOpacity
                key={a.label}
                style={[s.quickPill, compact && s.quickPillCompact, { backgroundColor: theme.surface }]}
                activeOpacity={0.75}
                onPress={() => router.push(a.route as any)}
              >
                <View style={[s.quickIcon, { backgroundColor: a.bg }]}>
                  <MaterialIcons name={a.icon} size={18} color={a.fg} />
                </View>
                <Text numberOfLines={1} style={[s.quickLabel, compact && { fontSize: 12 }, { color: theme.text }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </FadeInView>

        {isFamily ? <FamilyBalanceCard hidden={prefs.hideBalances} /> : null}

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
                  <Text style={[s.budgetPct, { color: pct >= 100 ? theme.expense : theme.primary }]}>{pctLabel}</Text>
                  {scope.can('budget.set') ? (
                    <TouchableOpacity testID="edit-budget" onPress={() => setShowBudget(true)} style={s.editBudgetBtn} activeOpacity={0.7}>
                      <MaterialIcons name="edit" size={14} color={theme.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              <View style={[s.track, { backgroundColor: theme.border }]}>
                <View style={[s.fill, { backgroundColor: pct >= 100 ? theme.expense : theme.primary, width: pctWidth }]} />
              </View>
              <View style={s.budgetFoot}>
                <Text style={[s.budgetSub, { color: theme.textSecondary }]}>{sym}{budget.spent.toFixed(2)} spent</Text>
                <Text style={[s.budgetSub, { color: theme.textMuted }]}>{sym}{budget.limit.toFixed(2)} limit</Text>
              </View>
              <Text style={[s.budgetSub, { color: theme.textMuted, marginTop: 6 }]}>{tr('home.budgetNoLoans')}</Text>
            </View>
          </FadeInView>
        ) : !loading && scope.can('budget.set') ? (
          <FadeInView delay={180} slideFrom="bottom" distance={16}>
            <TouchableOpacity
              testID="set-budget"
              style={[s.setBudgetRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => setShowBudget(true)}
              activeOpacity={0.75}
            >
              <Svg width={40} height={40} viewBox="0 0 40 40">
                <Circle cx={20} cy={20} r={16} fill="none" stroke={theme.border} strokeWidth={5} />
                <Circle cx={20} cy={20} r={16} fill="none" stroke={theme.primary} strokeWidth={5} strokeDasharray="100.5" strokeDashoffset={75} strokeLinecap="round" transform="rotate(-90 20 20)" />
              </Svg>
              <View style={{ flex: 1 }}>
                <Text style={[s.setBudgetText, { color: theme.primary }]}>{tr('home.setBudget')}</Text>
                <Text style={[s.setBudgetSub, { color: theme.textSecondary }]}>{tr('home.setBudgetSub')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
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
          <FeedChips value={view} only={isFamily ? FAMILY_FEED : undefined} onChange={v => (isFamily ? setFamilyView(v) : setPref('homeView', v))} />
          {!isFamily && needsLoansHint(view, includeLoans) && (
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
          <FadeInView delay={280} slideFrom="bottom" distance={12}>
            <View style={[s.txGroup, { backgroundColor: theme.surface }]}>
              {recent.map((t, i) => (
                <TouchableOpacity
                  key={t.id}
                  style={[s.txRow, i < recent.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
                  activeOpacity={0.75}
                  onPress={() => router.push({ pathname: '/(dashboard)/transaction-detail', params: detailParams(t) } as any)}
                >
                  {t.author ? (
                    <MemberAvatar id={t.author.clientId} name={t.author.name} size={44} />
                  ) : (
                    <View style={[s.txIcon, { backgroundColor: theme.primaryBg }]}>
                      <MaterialIcons name={CATEGORY_ICON[t.category] ?? 'receipt'} size={20} color={theme.primary} />
                    </View>
                  )}
                  <View style={s.txText}>
                    <Text style={[s.txTitle, { color: theme.text }]} numberOfLines={1}>{t.title}</Text>
                    <Text style={[s.txSub, { color: theme.textSecondary }]} numberOfLines={1}>{formatSubtitle(t)}{t.author ? ` · ${t.author.isYou ? tr('family.tx.you') : t.author.name}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={[s.txAmount, { color: t.debtRole === 'BORROW_IN' ? theme.textSecondary : t.amount >= 0 ? theme.income : theme.expense }]}>
                      {fmt(t.amount, sym)}
                    </Text>
                    {t.debtRole ? <ToneChip label={tr(ROLE_TAG[t.debtRole].label)} tone={ROLE_TAG[t.debtRole].tone} /> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </FadeInView>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const FAMILY_FEED: FeedView[] = ['all', 'income', 'expense'];

const s = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flexGrow: 1 },

  headerRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 18 },
  avatar:     { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700' },
  greeting:   { fontSize: 11, fontWeight: '500', letterSpacing: 0.8 },
  userName:   { fontSize: 19, fontWeight: '700', lineHeight: 23 },
  roundBtn:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  pillRow:    { paddingHorizontal: 18, marginTop: 12, alignItems: 'flex-start' },

  hero:       { marginHorizontal: 18, marginTop: 16, borderRadius: 30, padding: 20, paddingBottom: 16, overflow: 'hidden' },
  heroTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel:  { flex: 1, paddingRight: 8, fontSize: 11, letterSpacing: 0.8, fontWeight: '600' },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, flexShrink: 0 },
  statusText: { fontSize: 11, fontWeight: '600' },
  heroAmount: { fontSize: 44, fontWeight: '800', marginTop: 6, marginBottom: 14 },
  heroCents:  { fontSize: 24, fontWeight: '500', opacity: 0.8 },
  tiles:      { flexDirection: 'row', gap: 10 },
  tile:       { flex: 1, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 14, paddingVertical: 12 },
  tileCompact:{ paddingHorizontal: 12, paddingVertical: 10 },
  tileHead:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileIcon:   { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tileLabel:  { fontSize: 11, letterSpacing: 0.5 },
  tileVal:    { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginTop: 4 },

  quickWrap:  { flexDirection: 'row', gap: 10, paddingHorizontal: 18, marginTop: 14, marginBottom: 14 },
  quickPill:  { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, paddingRight: 10, borderRadius: 99 },
  quickPillCompact: { flexDirection: 'column', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 22 },
  quickIcon:  { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 13, fontWeight: '600' },

  budgetCard:     { marginHorizontal: 18, borderRadius: 24, padding: 16, marginBottom: 12 },
  budgetTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  budgetTopRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  budgetTitle:    { fontSize: 15, fontWeight: '700' },
  budgetPct:      { fontSize: 13, fontWeight: '700' },
  editBudgetBtn:  { padding: 4 },
  track:          { height: 8, borderRadius: 4, marginBottom: 8 },
  fill:           { height: 8, borderRadius: 4 },
  budgetFoot:     { flexDirection: 'row', justifyContent: 'space-between' },
  budgetSub:      { fontSize: 12 },

  setBudgetRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 18, marginTop: 4, marginBottom: 6, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  setBudgetText: { fontSize: 14, fontWeight: '600' },
  setBudgetSub:  { fontSize: 11, marginTop: 1 },

  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, marginTop: 22, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  seeAll:       { fontSize: 13, fontWeight: '600' },

  txGroup: { marginHorizontal: 18, marginTop: 6, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 4 },
  txRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  txIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  txText:  { flex: 1 },
  txTitle: { fontSize: 15, fontWeight: '600' },
  txSub:   { fontSize: 12, marginTop: 1 },
  txAmount:{ fontSize: 15, fontWeight: '700' },

  hint:      { fontSize: 11, lineHeight: 15, marginHorizontal: 20, marginBottom: 8 },
  emptyCard: { marginHorizontal: 18, borderRadius: 24, padding: 28, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
});
