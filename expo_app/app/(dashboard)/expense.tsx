import React, { useState, ComponentProps } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];
type TransactionCategory = 'food' | 'transport' | 'shopping' | 'health' | 'salary' | 'entertainment' | 'other';
type FilterType = 'all' | 'income' | 'expense';

interface Transaction {
  id: string; category: TransactionCategory; title: string; description: string; amount: number;
}

const CATEGORY_CONFIG: Record<TransactionCategory, { icon: IconName; color: string; bg: string }> = {
  salary:        { icon: 'account-balance', color: '#4ADE80', bg: 'rgba(74,222,128,0.15)'   },
  food:          { icon: 'restaurant',       color: '#FF8C42', bg: 'rgba(255,140,66,0.15)'   },
  transport:     { icon: 'directions-car',   color: '#60A5FA', bg: 'rgba(96,165,250,0.15)'   },
  shopping:      { icon: 'shopping-bag',     color: '#A78BFA', bg: 'rgba(167,139,250,0.15)'  },
  health:        { icon: 'local-hospital',   color: '#F472B6', bg: 'rgba(244,114,182,0.15)'  },
  entertainment: { icon: 'movie',            color: '#FBBF24', bg: 'rgba(251,191,36,0.15)'   },
  other:         { icon: 'more-horiz',       color: '#94A3B8', bg: 'rgba(148,163,184,0.15)'  },
};

const ALL_TRANSACTIONS: Transaction[] = [
  { id: '1',  category: 'salary',        title: 'Monthly Salary',    description: 'Apr 28, 2026', amount:  4500.00 },
  { id: '2',  category: 'food',          title: 'Grocery Store',     description: 'Apr 27, 2026', amount:   -82.50 },
  { id: '3',  category: 'transport',     title: 'Uber Ride',         description: 'Apr 26, 2026', amount:   -14.75 },
  { id: '4',  category: 'shopping',      title: 'Amazon Purchase',   description: 'Apr 25, 2026', amount:  -134.99 },
  { id: '5',  category: 'health',        title: 'Pharmacy',          description: 'Apr 24, 2026', amount:   -29.00 },
  { id: '6',  category: 'entertainment', title: 'Netflix',           description: 'Apr 23, 2026', amount:   -15.99 },
  { id: '7',  category: 'food',          title: 'Restaurant Dinner', description: 'Apr 22, 2026', amount:   -67.20 },
  { id: '8',  category: 'salary',        title: 'Freelance Payment', description: 'Apr 20, 2026', amount:   850.00 },
  { id: '9',  category: 'transport',     title: 'Monthly Bus Pass',  description: 'Apr 18, 2026', amount:   -45.00 },
  { id: '10', category: 'shopping',      title: 'Clothing Store',    description: 'Apr 15, 2026', amount:   -89.99 },
  { id: '11', category: 'food',          title: 'Coffee Shop',       description: 'Apr 14, 2026', amount:    -8.50 },
  { id: '12', category: 'health',        title: 'Gym Membership',    description: 'Apr 10, 2026', amount:   -39.99 },
];

function fmt(n: number) { return '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtSigned(n: number) { return (n > 0 ? '+$' : '-$') + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'income', label: 'Income' }, { key: 'expense', label: 'Expense' },
];

export default function ExpenseScreen() {
  const theme = useAppTheme();
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = ALL_TRANSACTIONS.filter(t => {
    if (filter === 'income')  return t.amount > 0;
    if (filter === 'expense') return t.amount < 0;
    return true;
  });

  const totalIncome  = ALL_TRANSACTIONS.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpense = ALL_TRANSACTIONS.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Expenses</Text>
          <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.primary }]} activeOpacity={0.7}>
            <MaterialIcons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: theme.primary }]}>
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
          <Text style={styles.summaryMonth}>April 2026</Text>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.summaryIconRow}>
                <View style={styles.summaryIconBg}><MaterialIcons name="arrow-downward" size={14} color="#4ADE80" /></View>
                <Text style={styles.summaryLabel}>Income</Text>
              </View>
              <Text style={styles.summaryAmount}>{fmt(totalIncome)}</Text>
            </View>
            <View style={styles.summarySeparator} />
            <View style={{ flex: 1 }}>
              <View style={styles.summaryIconRow}>
                <View style={styles.summaryIconBg}><MaterialIcons name="arrow-upward" size={14} color="#F87171" /></View>
                <Text style={styles.summaryLabel}>Spent</Text>
              </View>
              <Text style={styles.summaryAmount}>{fmt(totalExpense)}</Text>
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

        {/* List */}
        <View style={{ marginTop: 12 }}>
          {filtered.map(t => {
            const cfg = CATEGORY_CONFIG[t.category];
            return (
              <TouchableOpacity key={t.id} style={[styles.transactionCard, { backgroundColor: theme.surface }]} activeOpacity={0.75}>
                <View style={[styles.transactionIconContainer, { backgroundColor: cfg.bg }]}>
                  <MaterialIcons name={cfg.icon} size={22} color={cfg.color} />
                </View>
                <View style={styles.transactionTextBlock}>
                  <Text style={[styles.transactionTitle, { color: theme.text }]}>{t.title}</Text>
                  <Text style={[styles.transactionDescription, { color: theme.textSecondary }]}>{t.description}</Text>
                </View>
                <Text style={[styles.transactionAmount, { color: t.amount > 0 ? theme.income : theme.expense }]}>
                  {fmtSigned(t.amount)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  summaryCard: { marginHorizontal: 20, marginTop: 12, borderRadius: 24, padding: 22, overflow: 'hidden' },
  decorCircle1: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.05)', top: -50, right: -40 },
  decorCircle2: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -25, left: 20 },
  summaryMonth: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  summaryIconBg: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginLeft: 8 },
  summaryAmount: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  summarySeparator: { width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginHorizontal: 16 },
  filterRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: 24, marginBottom: 4, borderRadius: 14, padding: 4 },
  filterTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
  filterLabel: { fontSize: 14, fontWeight: '600' },
  transactionCard: { marginHorizontal: 20, marginBottom: 10, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center' },
  transactionIconContainer: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  transactionTextBlock: { flex: 1 },
  transactionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  transactionDescription: { fontSize: 13 },
  transactionAmount: { fontSize: 16, fontWeight: '700' },
});
