import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, Alert, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { FadeInView } from '@/components/fade-in-view';
import {
  getTransactionHistory, deleteTransaction, CATEGORY_ICON,
  TransactionGroup, Transaction, CategorySlug,
} from '@/services/transaction.service';
import { useCurrency } from '@/context/currency-context';
import { DatePickerModal } from '@/components/date-picker-modal';

const CATS = ['All', 'Food', 'Shopping', 'Transport', 'Health', 'Entertainment', 'Travel', 'Groceries', 'Salary', 'Other'];

const CAT_SLUG: Record<string, CategorySlug | undefined> = {
  Food: 'food', Shopping: 'shopping', Transport: 'transport',
  Health: 'health', Entertainment: 'entertainment', Travel: 'travel',
  Groceries: 'groceries', Salary: 'salary', Other: 'other',
};

const DATE_FILTERS = ['All', 'Today', 'Week', 'Month', 'Year', 'Custom'] as const;
type DateFilter = typeof DATE_FILTERS[number];

function getDateRange(filter: DateFilter, customStart?: Date, customEnd?: Date) {
  const now = new Date();
  if (filter === 'All') {
    return {};
  }
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

function fmt(n: number, sym: string) {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n >= 0 ? `+${sym}` : `-${sym}`) + abs;
}

export default function HistoryScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;
  const params = useLocalSearchParams<{ openSearch?: string }>();

  const [active,       setActive]       = useState('All');
  const [dateFilter,   setDateFilter]   = useState<DateFilter>('Month');
  const [groups,       setGroups]       = useState<TransactionGroup[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [customStart,  setCustomStart]  = useState<Date | undefined>();
  const [customEnd,    setCustomEnd]    = useState<Date | undefined>();
  const [customPhase,  setCustomPhase]  = useState<null | 'start' | 'end'>(null);
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const searchRef = useRef<TextInput>(null);

  // Auto-open search when navigated here with openSearch param
  useEffect(() => {
    if (params.openSearch === 'true') {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 200);
    }
  }, [params.openSearch]);

  const load = useCallback(async (cat: string, df: DateFilter, cStart?: Date, cEnd?: Date, search?: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const slug = cat === 'All' ? undefined : CAT_SLUG[cat];
      const range = getDateRange(df, cStart, cEnd);
      const data = await getTransactionHistory({ category: slug, ...range, search: search || undefined });
      setGroups(data);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(active, dateFilter, customStart, customEnd, searchQuery); }, [active, dateFilter, customStart, customEnd]);

  // Debounce search query changes
  useEffect(() => {
    const t = setTimeout(() => { load(active, dateFilter, customStart, customEnd, searchQuery); }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useFocusEffect(useCallback(() => { load(active, dateFilter, customStart, customEnd, searchQuery, true); }, [active, dateFilter, customStart, customEnd, load]));

  const handleDateFilter = (df: DateFilter) => {
    if (df === 'Custom') {
      setCustomPhase('start');
    } else {
      setDateFilter(df);
      if (df !== 'Custom') {
        setCustomStart(undefined);
        setCustomEnd(undefined);
      }
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

  const handleDelete = (t: Transaction) => {
    Alert.alert(
      'Delete Transaction',
      `Remove "${t.title}"? This will also update your wallet balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(t.id);
              setGroups(prev =>
                prev
                  .map(g => ({ ...g, items: g.items.filter(i => i.id !== t.id) }))
                  .filter(g => g.items.length > 0),
              );
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not delete transaction.');
            }
          },
        },
      ],
    );
  };

  const allTx      = groups.flatMap(g => g.items);
  const totalSpent = allTx.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalInc   = allTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const net        = totalInc - totalSpent;

  const customLabel = customStart && customEnd
    ? `${customStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${customEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Custom';

  const goToDetail = (t: Transaction) => {
    router.push({
      pathname: '/(dashboard)/transaction-detail',
      params: {
        id: t.id, type: t.type, category: t.category,
        title: t.title, description: t.description ?? '',
        amount: String(t.amount), date: String(t.date),
        walletId: t.walletId ?? '', receiptUrl: t.receiptUrl ?? '',
      },
    });
  };

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
            onRefresh={() => { setRefreshing(true); load(active, dateFilter, customStart, customEnd, true); }}
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
              <Text style={s.title}>History</Text>
              <TouchableOpacity
                style={s.searchBtn}
                activeOpacity={0.7}
                onPress={() => { setSearchOpen(o => !o); if (!searchOpen) setTimeout(() => searchRef.current?.focus(), 150); }}
              >
                <MaterialIcons name={searchOpen ? 'close' : 'search'} size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </FadeInView>

          {/* Search bar */}
          {searchOpen && (
            <FadeInView delay={0} slideFrom="top" distance={8}>
              <View style={[s.searchRow, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
                <MaterialIcons name="search" size={18} color="rgba(255,255,255,0.6)" />
                <TextInput
                  ref={searchRef}
                  style={s.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search transactions…"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  selectionColor="#fff"
                  returnKeyType="search"
                  autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                    <MaterialIcons name="cancel" size={18} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                )}
              </View>
            </FadeInView>
          )}

          {/* Stats strip */}
          <FadeInView delay={50} slideFrom="bottom" distance={16}>
            <View style={s.statsRow}>
              {[
                { label: 'SPENT',  value: `${sym}${Math.round(totalSpent).toLocaleString()}`,   color: '#F87171' },
                { label: 'INCOME', value: `${sym}${Math.round(totalInc).toLocaleString()}`,     color: '#4ADE80' },
                { label: 'NET',    value: `${net >= 0 ? '+' : '-'}${sym}${Math.abs(Math.round(net)).toLocaleString()}`, color: '#FFFFFF' },
              ].map(stat => (
                <View key={stat.label} style={[s.statCard, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                  <Text style={s.statLabel}>{stat.label}</Text>
                  <Text style={[s.statVal, { color: stat.color }]}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </FadeInView>
        </View>

        {/* Date filter chips */}
        <FadeInView delay={80} slideFrom="none">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
            {DATE_FILTERS.map(df => {
              const isActive = dateFilter === df;
              const label    = df === 'Custom' ? customLabel : df;
              return (
                <TouchableOpacity
                  key={df}
                  style={[s.chip, isActive
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                  onPress={() => handleDateFilter(df)}
                  activeOpacity={0.75}
                >
                  {df === 'Custom' && <MaterialIcons name="date-range" size={13} color={isActive ? '#fff' : theme.textMuted} style={{ marginRight: 4 }} />}
                  <Text style={[s.chipText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </FadeInView>

        {/* Category filter chips */}
        <FadeInView delay={100} slideFrom="none">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.filterRow, { paddingTop: 0 }]}>
            {CATS.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[s.chip, active === cat
                  ? { backgroundColor: theme.buttonBg, borderColor: theme.buttonBg }
                  : { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                onPress={() => setActive(cat)}
                activeOpacity={0.75}
              >
                <Text style={[s.chipText, { color: active === cat ? '#FFFFFF' : theme.textSecondary }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </FadeInView>

        <Text style={[s.hint, { color: theme.textMuted }]}>Tap to view details · Long-press to delete</Text>

        {/* Grouped transactions */}
        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
        ) : groups.length === 0 ? (
          <FadeInView delay={140} slideFrom="bottom" distance={12}>
            <View style={[s.emptyCard, { backgroundColor: theme.surface }]}>
              <MaterialIcons name="receipt-long" size={32} color={theme.textMuted} />
              <Text style={[s.emptyText, { color: theme.textMuted }]}>No transactions found</Text>
            </View>
          </FadeInView>
        ) : (
          groups.map((group, gi) => (
            <FadeInView key={group.date} delay={140 + gi * 50} slideFrom="bottom" distance={12}>
              <Text style={[s.dateLabel, { color: theme.textMuted }]}>{group.date}</Text>
              <View style={[s.groupCard, { backgroundColor: theme.surface }]}>
                {group.items.map((t: Transaction, i: number) => (
                  <React.Fragment key={t.id}>
                    <TouchableOpacity
                      style={s.txRow}
                      activeOpacity={0.75}
                      onPress={() => goToDetail(t)}
                      onLongPress={() => handleDelete(t)}
                    >
                      <View style={[s.txIcon, { backgroundColor: theme.primaryBg }]}>
                        <MaterialIcons name={CATEGORY_ICON[t.category] ?? 'receipt'} size={18} color={theme.primary} />
                      </View>
                      <View style={s.txMid}>
                        <Text style={[s.txTitle, { color: theme.text }]}>{t.title}</Text>
                        <Text style={[s.txSub, { color: theme.textSecondary }]}>
                          {t.description ?? `${t.category} · ${new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </Text>
                      </View>
                      <Text style={[s.txAmount, { color: t.amount >= 0 ? theme.income : theme.expense }]}>
                        {fmt(t.amount, sym)}
                      </Text>
                    </TouchableOpacity>
                    {i < group.items.length - 1 && (
                      <View style={[s.sep, { backgroundColor: theme.border }]} />
                    )}
                  </React.Fragment>
                ))}
              </View>
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

  header: { paddingBottom: 20, overflow: 'hidden' },
  decA:   { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.05)', top: -80, right: -50 },
  decB:   { position: 'absolute', width: 160, height: 160, borderRadius: 80,  backgroundColor: 'rgba(255,255,255,0.04)', bottom: -40, left: -30 },

  topBar:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14 },
  title:     { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 12, borderRadius: 14, paddingHorizontal: 14, height: 44 },
  searchInput:{ flex: 1, fontSize: 15, color: '#fff', paddingVertical: 0 },

  statsRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  statCard:  { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  statLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 4 },
  statVal:   { fontSize: 16, fontWeight: '800' },

  filterRow: { paddingHorizontal: 20, paddingVertical: 14, gap: 8 },
  chip:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22, borderWidth: 1.5 },
  chipText:  { fontSize: 13, fontWeight: '600' },

  hint: { fontSize: 11, textAlign: 'center', marginBottom: 4, marginTop: 2 },

  dateLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, paddingHorizontal: 20, marginTop: 4, marginBottom: 8 },
  groupCard:  { marginHorizontal: 20, borderRadius: 18, overflow: 'hidden', marginBottom: 4 },
  txRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  txIcon:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txMid:      { flex: 1 },
  txTitle:    { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  txSub:      { fontSize: 12 },
  txAmount:   { fontSize: 15, fontWeight: '700' },
  sep:        { height: 1, marginHorizontal: 16 },

  emptyCard: { marginHorizontal: 20, borderRadius: 16, padding: 28, alignItems: 'center', gap: 8, marginTop: 8 },
  emptyText: { fontSize: 14 },
});
