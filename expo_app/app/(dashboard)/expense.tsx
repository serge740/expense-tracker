import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  getTransactions, deleteTransaction, Transaction,
  CATEGORY_ICON, CATEGORY_LABEL, CategorySlug,
} from '@/services/transaction.service';
import { useCurrency } from '@/context/currency-context';

type FilterType = 'all' | 'income' | 'expense';

const CATEGORY_COLOR: Record<CategorySlug, { color: string; bg: string }> = {
  salary:        { color: '#4ADE80', bg: 'rgba(74,222,128,0.15)'   },
  food:          { color: '#FF8C42', bg: 'rgba(255,140,66,0.15)'   },
  transport:     { color: '#60A5FA', bg: 'rgba(96,165,250,0.15)'   },
  shopping:      { color: '#A78BFA', bg: 'rgba(167,139,250,0.15)'  },
  health:        { color: '#F472B6', bg: 'rgba(244,114,182,0.15)'  },
  entertainment: { color: '#FBBF24', bg: 'rgba(251,191,36,0.15)'   },
  travel:        { color: '#7B7FD4', bg: 'rgba(123,127,212,0.15)'  },
  groceries:     { color: '#4ADE80', bg: 'rgba(74,222,128,0.15)'   },
  other:         { color: '#94A3B8', bg: 'rgba(148,163,184,0.15)'  },
};

function fmtSigned(n: number, sym: string) {
  return (n > 0 ? `+${sym}` : `-${sym}`) + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'income', label: 'Income' }, { key: 'expense', label: 'Expense' },
];

export default function ExpenseScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;

  const [filter,       setFilter]       = useState<FilterType>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const now        = new Date();
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const load = useCallback(async (f: FilterType, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await getTransactions({
        type:  f === 'all' ? undefined : f,
        month: now.getMonth() + 1,
        year:  now.getFullYear(),
        limit: 50,
      });
      setTransactions(result.data);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter]);

  useFocusEffect(useCallback(() => { load(filter, true); }, [filter, load]));

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
              setTransactions(prev => prev.filter(tx => tx.id !== t.id));
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not delete transaction.');
            }
          },
        },
      ],
    );
  };

  const totalIncome  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(filter, true); }}
            tintColor={theme.primary}
          />
        }
      >

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Expenses</Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            activeOpacity={0.7}
            onPress={() => router.push('/(dashboard)/add')}
          >
            <MaterialIcons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: theme.primary }]}>
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
          <Text style={styles.summaryMonth}>{monthLabel}</Text>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.summaryIconRow}>
                <View style={styles.summaryIconBg}><MaterialIcons name="arrow-downward" size={14} color="#4ADE80" /></View>
                <Text style={styles.summaryLabel}>Income</Text>
              </View>
              <Text style={styles.summaryAmount}>{sym}{totalIncome.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</Text>
            </View>
            <View style={styles.summarySeparator} />
            <View style={{ flex: 1 }}>
              <View style={styles.summaryIconRow}>
                <View style={styles.summaryIconBg}><MaterialIcons name="arrow-upward" size={14} color="#F87171" /></View>
                <Text style={styles.summaryLabel}>Spent</Text>
              </View>
              <Text style={styles.summaryAmount}>{sym}{totalExpense.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</Text>
            </View>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={[styles.filterRow, { backgroundColor: theme.surface }]}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterTab, filter === f.key && { backgroundColor: theme.primary }]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterLabel, { color: filter === f.key ? '#FFFFFF' : theme.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Long-press hint */}
        <Text style={[styles.hintText, { color: theme.textMuted }]}>Long-press to delete a transaction</Text>

        {/* List */}
        <View style={{ marginTop: 4 }}>
          {loading ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: 20 }} />
          ) : transactions.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
              <MaterialIcons name="receipt-long" size={32} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>No transactions found</Text>
            </View>
          ) : (
            transactions.map(t => {
              const cfg  = CATEGORY_COLOR[t.category] ?? { color: '#94A3B8', bg: 'rgba(148,163,184,0.15)' };
              const icon = CATEGORY_ICON[t.category] ?? 'more-horiz';
              const dateStr = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.transactionCard, { backgroundColor: theme.surface }]}
                  activeOpacity={0.75}
                  onLongPress={() => handleDelete(t)}
                >
                  <View style={[styles.transactionIconContainer, { backgroundColor: cfg.bg }]}>
                    <MaterialIcons name={icon} size={22} color={cfg.color} />
                  </View>
                  <View style={styles.transactionTextBlock}>
                    <Text style={[styles.transactionTitle, { color: theme.text }]}>{t.title}</Text>
                    <Text style={[styles.transactionDescription, { color: theme.textSecondary }]}>
                      {t.description || `${CATEGORY_LABEL[t.category] ?? t.category} · ${dateStr}`}
                    </Text>
                  </View>
                  <Text style={[styles.transactionAmount, { color: t.amount > 0 ? theme.income : theme.expense }]}>
                    {fmtSigned(t.amount, sym)}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:      { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle:   { fontSize: 24, fontWeight: '700' },
  addButton:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  summaryCard:    { marginHorizontal: 20, marginTop: 12, borderRadius: 24, padding: 22, overflow: 'hidden' },
  decorCircle1:   { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.05)', top: -50, right: -40 },
  decorCircle2:   { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -25, left: 20 },
  summaryMonth:   { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500', marginBottom: 16 },
  summaryRow:     { flexDirection: 'row', alignItems: 'center' },
  summaryIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  summaryIconBg:  { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  summaryLabel:   { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginLeft: 8 },
  summaryAmount:  { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  summarySeparator: { width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginHorizontal: 16 },

  filterRow:   { flexDirection: 'row', marginHorizontal: 20, marginTop: 24, marginBottom: 0, borderRadius: 14, padding: 4 },
  filterTab:   { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  filterLabel: { fontSize: 14, fontWeight: '600' },

  hintText: { fontSize: 11, textAlign: 'center', marginTop: 10, marginBottom: 4 },

  transactionCard:          { marginHorizontal: 20, marginBottom: 10, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center' },
  transactionIconContainer: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  transactionTextBlock:     { flex: 1 },
  transactionTitle:         { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  transactionDescription:   { fontSize: 13 },
  transactionAmount:        { fontSize: 16, fontWeight: '700' },

  emptyCard: { marginHorizontal: 20, borderRadius: 16, padding: 28, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14 },
});
