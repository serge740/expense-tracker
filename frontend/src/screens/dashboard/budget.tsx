// Ported from expo_app/app/(dashboard)/budget.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, RefreshControl, Animated, Easing } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { useFocusEffect } from '@/router/router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { FadeInView } from '@/components/fade-in-view';
import { BudgetModal } from '@/components/budget-modal';
import { useCurrency } from '@/context/currency-context';
import { getCurrentBudget, BudgetStatus } from '@/services/budget.service';
import {
  getCategoryBreakdown, getReportSummary, getAiAdvice, getMonthlyReport,
  CategoryBreakdown, ReportSummary, AiAdvice, MonthlyData, CATEGORY_COLOR,
} from '@/services/reports.service';
import { CATEGORY_ICON, CATEGORY_LABEL } from '@/services/transaction.service';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtMoney(n: number, sym: string) {
  return `${sym}${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const VERDICT_CONFIG = {
  good: { color: '#4ADE80', bg: 'rgba(74,222,128,0.15)', icon: 'trending-up'  as const, label: 'On Track'     },
  fair: { color: '#FBBF24', bg: 'rgba(251,191,36,0.15)', icon: 'remove'       as const, label: 'Moderate'     },
  poor: { color: '#F87171', bg: 'rgba(248,113,113,0.15)', icon: 'trending-down' as const, label: 'Needs Attention' },
};

// ─── AnimatedBar ─────────────────────────────────────────────────────────────

function AnimatedBar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(pct, 100),
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: 'rgba(150,150,150,0.15)', overflow: 'hidden' }}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: color,
          width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

// ─── MiniBarChart ────────────────────────────────────────────────────────────

function MiniBarChart({ data, theme }: { data: MonthlyData[]; theme: any }) {
  const maxH = 60;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: maxH + 24 }}>
      {data.map((d, i) => {
        const barH = Math.max(4, Math.round((d.heightPct / 100) * maxH));
        const isLast = i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: '100%',
                height: barH,
                borderRadius: 4,
                backgroundColor: isLast ? theme.primary : theme.primary + '55',
              }}
            />
            <Text style={{ fontSize: 9, color: theme.textMuted, textAlign: 'center' }}>{d.month}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BudgetScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;

  const now   = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const [budget,     setBudget]     = useState<BudgetStatus | null>(null);
  const [summary,    setSummary]    = useState<ReportSummary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [trend,      setTrend]      = useState<MonthlyData[]>([]);
  const [insights,   setInsights]   = useState<AiAdvice | null>(null);
  const [insightsErr,setInsightsErr]= useState(false);

  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [loadingInsights,setLoadingInsights]= useState(false);
  const [showBudget,     setShowBudget]     = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [bud, sum, cats, tr] = await Promise.all([
        isCurrentMonth ? getCurrentBudget() : Promise.resolve(null),
        getReportSummary({ month, year }),
        getCategoryBreakdown({ month, year }),
        getMonthlyReport(6),
      ]);
      if (bud) setBudget(bud);
      setSummary(sum);
      setCategories(cats);
      setTrend(tr);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, year, isCurrentMonth]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const fetchInsights = async () => {
    setLoadingInsights(true);
    setInsightsErr(false);
    try {
      const advice = await getAiAdvice({ month, year, currency: currency.code });
      setInsights(advice);
    } catch {
      setInsightsErr(true);
    } finally {
      setLoadingInsights(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setInsights(null);
  };

  const nextMonth = () => {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth() + 1)) return;
    setMonth(nm);
    if (month === 12) setYear(y => y + 1);
    setInsights(null);
  };

  const canGoForward = !(
    year === now.getFullYear() && month === now.getMonth() + 1
  );

  const pct      = budget?.percentage ?? 0;
  const pctColor = pct >= 100 ? '#F87171' : pct >= 80 ? '#FBBF24' : theme.primary;

  const totalSpent = summary?.totalExpense ?? 0;
  const maxCatAmt  = categories.length ? Math.max(...categories.map(c => c.amount)) : 1;

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
        {/* ── Header ── */}
        <View style={[s.headerWrap, { backgroundColor: theme.headerBg }]}>
          <View style={s.decA} />
          <View style={s.decB} />
          <View style={s.headerRow}>
            <View>
              <Text style={s.headerSub}>MONTHLY</Text>
              <Text style={s.headerTitle}>Budget</Text>
            </View>
            {isCurrentMonth && (
              <TouchableOpacity
                style={[s.editBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
                onPress={() => setShowBudget(true)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="tune" size={18} color="#fff" />
                <Text style={s.editBtnText}>Set Limit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Month navigator */}
          <View style={s.monthNav}>
            <TouchableOpacity style={s.navBtn} onPress={prevMonth} activeOpacity={0.7}>
              <MaterialIcons name="chevron-left" size={22} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <Text style={s.monthLabel}>{monthLabel(month, year)}</Text>
            <TouchableOpacity
              style={[s.navBtn, { opacity: canGoForward ? 1 : 0.3 }]}
              onPress={nextMonth}
              disabled={!canGoForward}
              activeOpacity={0.7}
            >
              <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* ── Budget Progress Card ── */}
            {isCurrentMonth && (
              <FadeInView delay={0} slideFrom="bottom" distance={16}>
                <View style={[s.card, { backgroundColor: theme.surface }]}>
                  {budget && budget.limit > 0 ? (
                    <>
                      <View style={s.cardRow}>
                        <Text style={[s.cardTitle, { color: theme.text }]}>Spending Limit</Text>
                        <View style={[s.badge, { backgroundColor: pctColor + '22' }]}>
                          <Text style={[s.badgeText, { color: pctColor }]}>
                            {Math.min(pct, 100)}% used
                          </Text>
                        </View>
                      </View>

                      <AnimatedBar pct={pct} color={pctColor} height={10} />

                      <View style={[s.cardRow, { marginTop: 12 }]}>
                        <View>
                          <Text style={[s.statLabel, { color: theme.textMuted }]}>SPENT</Text>
                          <Text style={[s.statVal, { color: pct >= 100 ? '#F87171' : theme.text }]}>
                            {fmtMoney(budget.spent, sym)}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.statLabel, { color: theme.textMuted }]}>REMAINING</Text>
                          <Text style={[s.statVal, { color: theme.text }]}>
                            {fmtMoney(Math.max(0, budget.remaining), sym)}
                          </Text>
                        </View>
                      </View>

                      <View style={[s.sep, { backgroundColor: theme.border }]} />

                      <View style={s.cardRow}>
                        <Text style={[s.footNote, { color: theme.textMuted }]}>
                          Monthly limit: {fmtMoney(budget.limit, sym)}
                        </Text>
                        <TouchableOpacity onPress={() => setShowBudget(true)} activeOpacity={0.7}>
                          <Text style={[s.footNote, { color: theme.primary }]}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <TouchableOpacity style={s.setBudgetRow} onPress={() => setShowBudget(true)} activeOpacity={0.8}>
                      <View style={[s.setBudgetIcon, { backgroundColor: theme.primaryBg }]}>
                        <MaterialIcons name="add-circle-outline" size={22} color={theme.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: theme.text }]}>Set a Budget Limit</Text>
                        <Text style={[s.footNote, { color: theme.textMuted, marginTop: 2 }]}>
                          Track how much you spend this month
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </FadeInView>
            )}

            {/* ── Monthly Summary ── */}
            <FadeInView delay={60} slideFrom="bottom" distance={14}>
              <View style={[s.card, { backgroundColor: theme.surface }]}>
                <Text style={[s.cardTitle, { color: theme.text }]}>Month Summary</Text>
                <View style={[s.summaryRow, { marginTop: 14 }]}>
                  <View style={[s.summaryBox, { backgroundColor: 'rgba(74,222,128,0.12)' }]}>
                    <MaterialIcons name="arrow-downward" size={18} color="#4ADE80" />
                    <Text style={[s.summaryLabel, { color: theme.textMuted }]}>INCOME</Text>
                    <Text style={[s.summaryAmt, { color: '#4ADE80' }]}>
                      {fmtMoney(summary?.totalIncome ?? 0, sym)}
                    </Text>
                  </View>
                  <View style={[s.summaryBox, { backgroundColor: 'rgba(248,113,113,0.12)' }]}>
                    <MaterialIcons name="arrow-upward" size={18} color="#F87171" />
                    <Text style={[s.summaryLabel, { color: theme.textMuted }]}>EXPENSES</Text>
                    <Text style={[s.summaryAmt, { color: '#F87171' }]}>
                      {fmtMoney(summary?.totalExpense ?? 0, sym)}
                    </Text>
                  </View>
                  <View style={[s.summaryBox, {
                    backgroundColor: (summary?.net ?? 0) >= 0
                      ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
                  }]}>
                    <MaterialIcons
                      name={(summary?.net ?? 0) >= 0 ? 'savings' : 'money-off'}
                      size={18}
                      color={(summary?.net ?? 0) >= 0 ? '#4ADE80' : '#F87171'}
                    />
                    <Text style={[s.summaryLabel, { color: theme.textMuted }]}>NET</Text>
                    <Text style={[s.summaryAmt, { color: (summary?.net ?? 0) >= 0 ? '#4ADE80' : '#F87171' }]}>
                      {(summary?.net ?? 0) >= 0 ? '+' : '-'}{fmtMoney(summary?.net ?? 0, sym)}
                    </Text>
                  </View>
                </View>
              </View>
            </FadeInView>

            {/* ── Category Breakdown ── */}
            {categories.length > 0 && (
              <FadeInView delay={120} slideFrom="bottom" distance={14}>
                <View style={[s.card, { backgroundColor: theme.surface }]}>
                  <Text style={[s.cardTitle, { color: theme.text }]}>Spending by Category</Text>
                  <View style={{ marginTop: 14, gap: 14 }}>
                    {categories.map((cat, i) => {
                      const color = (CATEGORY_COLOR as Record<string, string>)[cat.category] ?? '#94A3B8';
                      const icon  = (CATEGORY_ICON as Record<string, string>)[cat.category]  ?? 'receipt';
                      const label = (CATEGORY_LABEL as Record<string, string>)[cat.category] ?? cat.label;
                      const barPct = maxCatAmt > 0 ? (cat.amount / maxCatAmt) * 100 : 0;
                      return (
                        <View key={cat.category}>
                          <View style={s.catRow}>
                            <View style={[s.catIcon, { backgroundColor: color + '22' }]}>
                              <MaterialIcons name={icon} size={16} color={color} />
                            </View>
                            <Text style={[s.catName, { color: theme.text }]}>{label}</Text>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[s.catAmt, { color: theme.text }]}>
                                {fmtMoney(cat.amount, sym)}
                              </Text>
                              <Text style={[s.catPct, { color: theme.textMuted }]}>
                                {cat.percentage}%
                              </Text>
                            </View>
                          </View>
                          <View style={{ marginLeft: 44, marginTop: 6 }}>
                            <AnimatedBar pct={barPct} color={color} height={5} />
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {totalSpent > 0 && (
                    <>
                      <View style={[s.sep, { backgroundColor: theme.border, marginTop: 16 }]} />
                      <View style={[s.cardRow, { marginTop: 12 }]}>
                        <Text style={[s.footNote, { color: theme.textMuted }]}>Total expenses</Text>
                        <Text style={[s.footNote, { color: theme.text, fontWeight: '700' }]}>
                          {fmtMoney(totalSpent, sym)}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </FadeInView>
            )}

            {categories.length === 0 && (
              <FadeInView delay={120} slideFrom="bottom" distance={14}>
                <View style={[s.card, s.emptyCard, { backgroundColor: theme.surface }]}>
                  <MaterialIcons name="receipt-long" size={32} color={theme.textMuted} />
                  <Text style={[s.emptyText, { color: theme.textMuted }]}>
                    No expenses recorded for this period
                  </Text>
                </View>
              </FadeInView>
            )}

            {/* ── Spending Trend ── */}
            {trend.length > 0 && (
              <FadeInView delay={180} slideFrom="bottom" distance={14}>
                <View style={[s.card, { backgroundColor: theme.surface }]}>
                  <Text style={[s.cardTitle, { color: theme.text }]}>6-Month Spending Trend</Text>
                  <View style={{ marginTop: 16 }}>
                    <MiniBarChart data={trend} theme={theme} />
                  </View>
                  <Text style={[s.footNote, { color: theme.textMuted, marginTop: 4 }]}>
                    Expenses only · current month highlighted
                  </Text>
                </View>
              </FadeInView>
            )}

            {/* ── Smart Insights ── */}
            <FadeInView delay={240} slideFrom="bottom" distance={14}>
              <View style={[s.card, { backgroundColor: theme.surface }]}>
                <View style={s.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { color: theme.text }]}>Smart Insights</Text>
                    <Text style={[s.footNote, { color: theme.textMuted, marginTop: 2 }]}>
                      Personalised analysis of your spending
                    </Text>
                  </View>
                  <View style={[s.insightsBadge, { backgroundColor: theme.primaryBg }]}>
                    <MaterialIcons name="auto-awesome" size={14} color={theme.primary} />
                    <Text style={[s.insightsBadgeText, { color: theme.primary }]}>Smart</Text>
                  </View>
                </View>

                {loadingInsights ? (
                  <View style={s.insightsLoading}>
                    <ActivityIndicator color={theme.primary} />
                    <Text style={[s.loadingText, { color: theme.textMuted }]}>
                      Analysing your spending patterns…
                    </Text>
                  </View>
                ) : insights ? (
                  <>
                    {/* Verdict badge */}
                    {(() => {
                      const cfg = VERDICT_CONFIG[insights.verdict];
                      return (
                        <View style={[s.verdictRow, { backgroundColor: cfg.bg, marginTop: 14 }]}>
                          <MaterialIcons name={cfg.icon} size={18} color={cfg.color} />
                          <Text style={[s.verdictLabel, { color: cfg.color }]}>{cfg.label}</Text>
                          <Text style={[s.verdictSummary, { color: theme.textSecondary, flex: 1 }]}>
                            {insights.summary}
                          </Text>
                        </View>
                      );
                    })()}

                    {/* Main advice */}
                    <View style={[s.adviceBox, { backgroundColor: theme.background, marginTop: 12 }]}>
                      <Text style={[s.adviceText, { color: theme.text }]}>{insights.advice}</Text>
                    </View>

                    {/* Tips */}
                    {insights.tips.length > 0 && (
                      <View style={{ marginTop: 14, gap: 10 }}>
                        <Text style={[s.tipsTitle, { color: theme.textMuted }]}>ACTION STEPS</Text>
                        {insights.tips.map((tip, i) => (
                          <View key={i} style={s.tipRow}>
                            <View style={[s.tipNum, { backgroundColor: theme.primaryBg }]}>
                              <Text style={[s.tipNumText, { color: theme.primary }]}>{i + 1}</Text>
                            </View>
                            <Text style={[s.tipText, { color: theme.text }]}>{tip}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <TouchableOpacity
                      style={[s.refreshBtn, { borderColor: theme.border }]}
                      onPress={fetchInsights}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="refresh" size={16} color={theme.textMuted} />
                      <Text style={[s.refreshBtnText, { color: theme.textMuted }]}>Refresh Analysis</Text>
                    </TouchableOpacity>
                  </>
                ) : insightsErr ? (
                  <View style={s.insightsLoading}>
                    <MaterialIcons name="error-outline" size={28} color={theme.textMuted} />
                    <Text style={[s.loadingText, { color: theme.textMuted }]}>
                      Could not load insights. Tap to try again.
                    </Text>
                    <TouchableOpacity
                      style={[s.generateBtn, { backgroundColor: theme.primaryBg }]}
                      onPress={fetchInsights}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.generateBtnText, { color: theme.primary }]}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={s.insightsLoading}>
                    <MaterialIcons name="lightbulb-outline" size={32} color={theme.textMuted} />
                    <Text style={[s.loadingText, { color: theme.textMuted }]}>
                      {categories.length === 0
                        ? 'Add some expenses this month to unlock personalised insights.'
                        : 'Get a personalised spending analysis for this period.'}
                    </Text>
                    {categories.length > 0 && (
                      <TouchableOpacity
                        style={[s.generateBtn, { backgroundColor: theme.primary }]}
                        onPress={fetchInsights}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="auto-awesome" size={16} color="#fff" />
                        <Text style={s.generateBtnText}>Analyse My Spending</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </FadeInView>

            <View style={{ height: 32 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flexGrow: 1 },

  headerWrap: { paddingBottom: 20, overflow: 'hidden' },
  decA: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.05)', top: -80, right: -50 },
  decB: { position: 'absolute', width: 160, height: 160, borderRadius: 80,  backgroundColor: 'rgba(255,255,255,0.04)', bottom: -30, left: -20 },

  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 16 },
  headerSub:    { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2, marginBottom: 2 },
  headerTitle:  { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  editBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  editBtnText:  { fontSize: 13, fontWeight: '600', color: '#fff' },

  monthNav:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 4 },
  navBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  monthLabel: { fontSize: 15, fontWeight: '700', color: '#fff', minWidth: 160, textAlign: 'center' },

  card: { marginHorizontal: 20, borderRadius: 20, padding: 18, marginTop: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700' },

  badge:     { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  statVal:   { fontSize: 20, fontWeight: '800' },

  sep: { height: 1, marginVertical: 12 },
  footNote: { fontSize: 12 },

  setBudgetRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  setBudgetIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryBox: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 6 },
  summaryLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  summaryAmt: { fontSize: 14, fontWeight: '800' },

  catRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catName: { flex: 1, fontSize: 14, fontWeight: '500' },
  catAmt:  { fontSize: 14, fontWeight: '700' },
  catPct:  { fontSize: 11 },

  emptyCard: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  emptyText: { fontSize: 14, textAlign: 'center' },

  insightsBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  insightsBadgeText: { fontSize: 11, fontWeight: '700' },

  insightsLoading: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  loadingText:     { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  verdictRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, padding: 12 },
  verdictLabel:  { fontSize: 13, fontWeight: '700' },
  verdictSummary:{ fontSize: 13, lineHeight: 18 },

  adviceBox:  { borderRadius: 14, padding: 14 },
  adviceText: { fontSize: 14, lineHeight: 21 },

  tipsTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  tipRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tipNum:    { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  tipNumText:{ fontSize: 12, fontWeight: '800' },
  tipText:   { flex: 1, fontSize: 14, lineHeight: 20 },

  generateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 22, marginTop: 4 },
  generateBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  refreshBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, borderRadius: 12, paddingVertical: 10, borderWidth: 1 },
  refreshBtnText: { fontSize: 13, fontWeight: '500' },
});
