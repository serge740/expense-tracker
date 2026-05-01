import React, { ComponentProps } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface Transaction {
  id: string; icon: IconName; title: string; subtitle: string; amount: number;
}

const TRANSACTIONS: Transaction[] = [
  { id: '1', icon: 'receipt',     title: 'Netflix',        subtitle: 'Entertainment · Today', amount: -15.99  },
  { id: '2', icon: 'receipt',     title: 'Whole Foods',    subtitle: 'Groceries · Today',      amount: -84.30  },
  { id: '3', icon: 'trending-up', title: 'Salary — April', subtitle: 'Income · Apr 29',        amount: 4200.00 },
];

function fmt(n: number) {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n >= 0 ? '+$' : '-$') + abs;
}

export default function HomeScreen() {
  const theme = useAppTheme();

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.textMuted }]}>GOOD MORNING</Text>
            <Text style={[styles.userName, { color: theme.text }]}>Abigail Young</Text>
          </View>
          <TouchableOpacity style={[styles.bellButton, { backgroundColor: theme.surface }]} activeOpacity={0.7}>
            <MaterialIcons name="notifications-none" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: theme.buttonBg }]}>
          <View style={styles.balanceDecor1} />
          <View style={styles.balanceDecor2} />
          <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
          <Text style={styles.balanceAmount}>$8,420<Text style={styles.balanceCents}>.50</Text></Text>
          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balanceStatLabel}>INCOME</Text>
              <Text style={styles.balanceStatValue}>$4,200</Text>
            </View>
            <View style={styles.balanceSeparator} />
            <View>
              <Text style={styles.balanceStatLabel}>SPENT</Text>
              <Text style={styles.balanceStatValue}>$1,779</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {[
            { icon: 'document-scanner' as IconName, label: 'Scan Receipt', onPress: () => router.push('/(dashboard)/scan')    },
            { icon: 'add-circle-outline' as IconName, label: 'Add Expense', onPress: () => router.push('/(dashboard)/add')    },
            { icon: 'bar-chart' as IconName,          label: 'Analytics',   onPress: () => router.push('/(dashboard)/reports') },
          ].map(action => (
            <TouchableOpacity
              key={action.label}
              style={[styles.quickActionCard, { backgroundColor: theme.surface }]}
              activeOpacity={0.75}
              onPress={action.onPress}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: theme.primaryBg }]}>
                <MaterialIcons name={action.icon} size={22} color={theme.primary} />
              </View>
              <Text style={[styles.quickActionLabel, { color: theme.text }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Budget */}
        <View style={[styles.budgetCard, { backgroundColor: theme.surface }]}>
          <View style={styles.budgetHeader}>
            <Text style={[styles.budgetTitle, { color: theme.text }]}>April Budget</Text>
            <Text style={[styles.budgetUsed, { color: theme.buttonBg }]}>71% used</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.buttonBg, width: '71%' }]} />
          </View>
          <View style={styles.budgetFooter}>
            <Text style={[styles.budgetSub, { color: theme.textSecondary }]}>$1,779 spent</Text>
            <Text style={[styles.budgetSub, { color: theme.textMuted }]}>$2,500 limit</Text>
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => router.push('/(dashboard)/history')} activeOpacity={0.7}>
            <Text style={[styles.seeAll, { color: theme.buttonBg }]}>See all</Text>
          </TouchableOpacity>
        </View>

        {TRANSACTIONS.map(t => (
          <TouchableOpacity key={t.id} style={[styles.txRow, { backgroundColor: theme.surface }]} activeOpacity={0.75}>
            <View style={[styles.txIcon, { backgroundColor: theme.primaryBg }]}>
              <MaterialIcons name={t.icon} size={20} color={theme.primary} />
            </View>
            <View style={styles.txText}>
              <Text style={[styles.txTitle, { color: theme.text }]}>{t.title}</Text>
              <Text style={[styles.txSub, { color: theme.textSecondary }]}>{t.subtitle}</Text>
            </View>
            <Text style={[styles.txAmount, { color: t.amount >= 0 ? theme.income : theme.expense }]}>
              {fmt(t.amount)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  greeting: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 2 },
  userName: { fontSize: 22, fontWeight: '800' },
  bellButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  balanceCard: { marginHorizontal: 20, borderRadius: 22, padding: 22, overflow: 'hidden', marginBottom: 16, shadowColor: '#7B5CF0', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
  balanceDecor1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)', top: -60, right: -40 },
  balanceDecor2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -30, left: 20 },
  balanceLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, fontWeight: '600', marginBottom: 8 },
  balanceAmount: { fontSize: 44, fontWeight: '800', color: '#FFFFFF', marginBottom: 18 },
  balanceCents: { fontSize: 26, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  balanceStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.8, marginBottom: 4 },
  balanceStatValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  balanceSeparator: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.25)' },

  quickActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 16 },
  quickActionCard: { flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  quickActionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  budgetCard: { marginHorizontal: 20, borderRadius: 16, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  budgetTitle: { fontSize: 15, fontWeight: '700' },
  budgetUsed: { fontSize: 13, fontWeight: '600' },
  progressTrack: { height: 8, borderRadius: 4, marginBottom: 8 },
  progressFill: { height: 8, borderRadius: 4 },
  budgetFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetSub: { fontSize: 12 },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  seeAll: { fontSize: 13, fontWeight: '600' },

  txRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 8, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  txIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txText: { flex: 1 },
  txTitle: { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  txSub: { fontSize: 12 },
  txAmount: { fontSize: 15, fontWeight: '700' },
});
