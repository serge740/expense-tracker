import React, { useCallback, useEffect, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, RefreshControl, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { FadeInView } from '@/components/fade-in-view';
import {
  getMonthlyReport, getCategoryBreakdown, getReportSummary, getAiAdvice,
  MonthlyData, CategoryBreakdown, CATEGORY_COLOR, DateRangeParams, AiAdvice,
} from '@/services/reports.service';
import { useCurrency } from '@/context/currency-context';
import { DatePickerModal } from '@/components/date-picker-modal';

const DATE_FILTERS = ['Today', 'Week', 'Month', 'Year', 'Custom'] as const;
type DateFilter = typeof DATE_FILTERS[number];

function getDateRange(filter: DateFilter, customStart?: Date, customEnd?: Date): DateRangeParams {
  const now = new Date();
  if (filter === 'Today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (filter === 'Week') {
    const dayOfWeek = now.getDay();
    const start = new Date(now); start.setDate(now.getDate() - dayOfWeek); start.setHours(0, 0, 0, 0);
    const end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (filter === 'Month') {
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }
  if (filter === 'Year') {
    const start = new Date(now.getFullYear(), 0, 1);
    const end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (filter === 'Custom' && customStart && customEnd) {
    const s = new Date(customStart); s.setHours(0, 0, 0, 0);
    const e = new Date(customEnd);   e.setHours(23, 59, 59, 999);
    return { startDate: s.toISOString(), endDate: e.toISOString() };
  }
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export default function ReportsScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;

  const [dateFilter,  setDateFilter]  = useState<DateFilter>('Month');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd,   setCustomEnd]   = useState<Date | undefined>();
  const [customPhase, setCustomPhase] = useState<null | 'start' | 'end'>(null);

  const [monthly,    setMonthly]    = useState<MonthlyData[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [summary,    setSummary]    = useState({ totalIncome: 0, totalExpense: 0, net: 0 });
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showAdvice,    setShowAdvice]    = useState(false);
  const [advice,        setAdvice]        = useState<AiAdvice | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const load = useCallback(async (df: DateFilter, cStart?: Date, cEnd?: Date, silent = false) => {
    if (!silent) setLoading(true);
    const range = getDateRange(df, cStart, cEnd);
    try {
      const [mon, cats, sum] = await Promise.all([
        getMonthlyReport(6),
        getCategoryBreakdown(range),
        getReportSummary(range),
      ]);
      setMonthly(mon);
      setCategories(cats);
      setSummary(sum);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(dateFilter, customStart, customEnd); }, [dateFilter, customStart, customEnd]);

  useFocusEffect(useCallback(() => { load(dateFilter, customStart, customEnd, true); }, [dateFilter, customStart, customEnd, load]));

  const handleDateFilter = (df: DateFilter) => {
    if (df === 'Custom') {
      setCustomPhase('start');
    } else {
      setDateFilter(df);
      setCustomStart(undefined);
      setCustomEnd(undefined);
    }
  };

  const handleCustomDatePick = (date: Date) => {
    if (customPhase === 'start') {
      setCustomStart(date);
      setCustomPhase('end');
    } else {
      setCustomEnd(date);
      setCustomPhase(null);
      setDateFilter('Custom');
    }
  };

  const customLabel = customStart && customEnd
    ? `${customStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${customEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Custom';

  const handleGetAdvice = async () => {
    setAdvice(null);
    setShowAdvice(true);
    setLoadingAdvice(true);
    const range = getDateRange(dateFilter, customStart, customEnd);
    try {
      const result = await getAiAdvice({ ...range, currency: currency.code });
      setAdvice(result);
    } catch {
      setShowAdvice(false);
      Alert.alert('Error', 'Could not get AI advice. Please try again.');
    } finally {
      setLoadingAdvice(false);
    }
  };

  const verdictColor = advice?.verdict === 'good' ? '#4ADE80' : advice?.verdict === 'poor' ? '#F87171' : '#FBBF24';
  const verdictLabel = advice?.verdict === 'good' ? 'Good' : advice?.verdict === 'poor' ? 'Poor' : 'Fair';

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />

      <DatePickerModal
        visible={customPhase !== null}
        value={customPhase === 'end' ? (customStart ?? new Date()) : new Date()}
        showTime={false}
        title={customPhase === 'start' ? 'Select Start Date' : 'Select End Date'}
        onConfirm={handleCustomDatePick}
        onClose={() => setCustomPhase(null)}
      />

      <ScrollView
        contentContainerStyle={[s.scroll, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(dateFilter, customStart, customEnd, true); }}
            tintColor="#fff"
          />
        }
      >
        {/* Header */}
        <View style={[s.header, { backgroundColor: theme.headerBg }]}>
          <View style={s.decA} />
          <View style={s.decB} />

          <FadeInView delay={0} slideFrom="top" distance={14}>
            <View style={s.topBar}>
              <Text style={s.title}>Reports</Text>
            </View>
          </FadeInView>

          {/* Date filter chips */}
          <FadeInView delay={40} slideFrom="none">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              {DATE_FILTERS.map(df => {
                const isActive = dateFilter === df;
                const label    = df === 'Custom' ? customLabel : df;
                return (
                  <TouchableOpacity
                    key={df}
                    style={[s.chip, isActive
                      ? { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.5)' }
                      : { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
                    ]}
                    onPress={() => handleDateFilter(df)}
                    activeOpacity={0.75}
                  >
                    {df === 'Custom' && <MaterialIcons name="date-range" size={13} color={isActive ? '#fff' : 'rgba(255,255,255,0.6)'} style={{ marginRight: 4 }} />}
                    <Text style={[s.chipText, { color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.7)' }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </FadeInView>

          {/* Donut chart */}
          <FadeInView delay={80} slideFrom="bottom" distance={20}>
            <View style={s.donutWrap}>
              <View style={s.donutOuter}>
                <View style={s.donutMid}>
                  <View style={[s.donutHole, { backgroundColor: theme.headerBg }]}>
                    <Text style={s.donutLabel}>SPENT</Text>
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.donutTotal}>{sym}{Math.round(summary.totalExpense)}</Text>
                    )}
                  </View>
                </View>
              </View>
              {!loading && (
                <View style={s.donutStats}>
                  <View style={s.donutStat}>
                    <MaterialIcons name="arrow-downward" size={12} color="#4ADE80" />
                    <Text style={s.donutStatLabel}>Income</Text>
                    <Text style={s.donutStatVal}>{sym}{Math.round(summary.totalIncome).toLocaleString()}</Text>
                  </View>
                  <View style={[s.donutStatDiv, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                  <View style={s.donutStat}>
                    <MaterialIcons name="trending-up" size={12} color={summary.net >= 0 ? '#4ADE80' : '#F87171'} />
                    <Text style={s.donutStatLabel}>Net</Text>
                    <Text style={[s.donutStatVal, { color: summary.net >= 0 ? '#4ADE80' : '#F87171' }]}>
                      {summary.net >= 0 ? '+' : '-'}{sym}{Math.abs(Math.round(summary.net)).toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </FadeInView>
        </View>

        {/* Monthly Overview */}
        <FadeInView delay={160} slideFrom="bottom" distance={16}>
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            <Text style={[s.cardTitle, { color: theme.text }]}>Monthly Overview</Text>
            {loading ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <View style={s.barChart}>
                {monthly.map((m, i) => {
                  const isActive = i === monthly.length - 1;
                  return (
                    <View key={`${m.month}${m.year}`} style={s.barCol}>
                      <View style={s.barTrack}>
                        <View
                          style={[
                            s.barFill,
                            {
                              height: `${Math.max(m.heightPct, 4)}%`,
                              backgroundColor: isActive
                                ? theme.primary
                                : theme.isDark ? '#2E3560' : '#E8EAF6',
                              borderRadius: 6,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[s.barLabel, {
                        color: isActive ? theme.primary : theme.textMuted,
                        fontWeight: isActive ? '700' : '400',
                      }]}>
                        {m.month[0]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </FadeInView>

        {/* By Category */}
        <FadeInView delay={220} slideFrom="bottom" distance={14}>
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            <Text style={[s.cardTitle, { color: theme.text }]}>By Category</Text>
            {loading ? (
              <ActivityIndicator color={theme.primary} />
            ) : categories.length === 0 ? (
              <Text style={[s.emptyText, { color: theme.textMuted }]}>No expenses for this period</Text>
            ) : (
              categories.map((cat, i) => (
                <View key={cat.category} style={[s.catRow, i < categories.length - 1 && { marginBottom: 14 }]}>
                  <Text style={[s.catName, { color: theme.text }]}>{cat.label}</Text>
                  <View style={s.catBarWrap}>
                    <View style={[s.catTrack, { backgroundColor: theme.isDark ? '#2E3560' : '#E8EAF6' }]}>
                      <View style={[s.catFill, { width: `${cat.percentage}%`, backgroundColor: CATEGORY_COLOR[cat.category] ?? '#94A3B8' }]} />
                    </View>
                  </View>
                  <Text style={[s.catPct, { color: theme.textMuted }]}>{cat.percentage}%</Text>
                  <Text style={[s.catAmt, { color: theme.text }]}>{sym}{Math.round(cat.amount)}</Text>
                </View>
              ))
            )}
          </View>
        </FadeInView>

        {/* AI Advisor button */}
        <FadeInView delay={280} slideFrom="bottom" distance={14}>
          <TouchableOpacity
            style={[s.aiBtn, { backgroundColor: theme.primary }]}
            onPress={handleGetAdvice}
            activeOpacity={0.85}
          >
            <MaterialIcons name="auto-awesome" size={18} color="#fff" />
            <Text style={s.aiBtnText}>Get AI Financial Advice</Text>
          </TouchableOpacity>
        </FadeInView>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* AI Advice Modal */}
      <Modal visible={showAdvice} animationType="slide" transparent onRequestClose={() => setShowAdvice(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: theme.surface }]}>
            {/* Header */}
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <MaterialIcons name="auto-awesome" size={20} color={theme.primary} />
                <Text style={[s.modalTitle, { color: theme.text }]}>AI Financial Advisor</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAdvice(false)} activeOpacity={0.7}>
                <MaterialIcons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {loadingAdvice ? (
              <View style={s.modalLoading}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[s.modalLoadingText, { color: theme.textMuted }]}>Analyzing your finances…</Text>
              </View>
            ) : advice ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalBody}>
                {/* Verdict badge */}
                <View style={[s.verdictBadge, { backgroundColor: verdictColor + '22', borderColor: verdictColor + '55' }]}>
                  <Text style={[s.verdictText, { color: verdictColor }]}>{verdictLabel} Spending Health</Text>
                </View>

                {/* Summary */}
                <Text style={[s.modalSection, { color: theme.textMuted }]}>SUMMARY</Text>
                <Text style={[s.modalPara, { color: theme.text }]}>{advice.summary}</Text>

                {/* Advice */}
                <Text style={[s.modalSection, { color: theme.textMuted }]}>RECOMMENDATION</Text>
                <Text style={[s.modalPara, { color: theme.text }]}>{advice.advice}</Text>

                {/* Tips */}
                {advice.tips.length > 0 && (
                  <>
                    <Text style={[s.modalSection, { color: theme.textMuted }]}>ACTION TIPS</Text>
                    {advice.tips.map((tip, i) => (
                      <View key={i} style={s.tipRow}>
                        <View style={[s.tipNum, { backgroundColor: theme.primary }]}>
                          <Text style={s.tipNumText}>{i + 1}</Text>
                        </View>
                        <Text style={[s.tipText, { color: theme.text }]}>{tip}</Text>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flexGrow: 1 },

  header: { paddingBottom: 24, overflow: 'hidden' },
  decA:   { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(255,255,255,0.05)', top: -100, right: -60 },
  decB:   { position: 'absolute', width: 180, height: 180, borderRadius: 90,  backgroundColor: 'rgba(255,255,255,0.04)', bottom: -40, left: -30 },

  topBar:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 12 },
  title:   { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },

  filterRow: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  chip:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22, borderWidth: 1.5 },
  chipText:  { fontSize: 13, fontWeight: '600' },

  donutWrap:     { alignItems: 'center', paddingBottom: 8 },
  donutOuter:    { width: 150, height: 150, borderRadius: 75, borderWidth: 20, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  donutMid:      { width: 110, height: 110, borderRadius: 55, borderWidth: 13, borderColor: 'rgba(255,255,255,0.30)', alignItems: 'center', justifyContent: 'center' },
  donutHole:     { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  donutLabel:    { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.55)', letterSpacing: 1, marginBottom: 3 },
  donutTotal:    { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  donutStats:    { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 0 },
  donutStat:     { flex: 1, alignItems: 'center', gap: 3 },
  donutStatDiv:  { width: 1, height: 32 },
  donutStatLabel:{ fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  donutStatVal:  { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },

  card:      { marginHorizontal: 20, borderRadius: 20, padding: 20, marginTop: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 18 },

  barChart:  { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 6 },
  barCol:    { flex: 1, alignItems: 'center', gap: 6 },
  barTrack:  { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barFill:   { width: '100%' },
  barLabel:  { fontSize: 11 },

  catRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 0 },
  catName:   { fontSize: 13, fontWeight: '500', width: 100 },
  catBarWrap:{ flex: 1 },
  catTrack:  { height: 5, borderRadius: 3 },
  catFill:   { height: 5, borderRadius: 3 },
  catPct:    { fontSize: 12, fontWeight: '500', width: 34, textAlign: 'right' },
  catAmt:    { fontSize: 13, fontWeight: '700', width: 44, textAlign: 'right' },

  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },

  aiBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 20, marginTop: 16, borderRadius: 16, paddingVertical: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  aiBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', paddingBottom: 32 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  modalTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle:   { fontSize: 18, fontWeight: '700' },
  modalLoading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 16 },
  modalLoadingText: { fontSize: 14 },
  modalBody:    { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },

  verdictBadge: { alignSelf: 'flex-start', borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 20 },
  verdictText:  { fontSize: 14, fontWeight: '700' },

  modalSection: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  modalPara:    { fontSize: 14, lineHeight: 22, marginBottom: 20 },

  tipRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  tipNum:     { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tipNumText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  tipText:    { flex: 1, fontSize: 14, lineHeight: 20 },
});
