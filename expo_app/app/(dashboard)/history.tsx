import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface Transaction { id: string; icon: IconName; title: string; subtitle: string; amount: number; }
interface Group { date: string; items: Transaction[]; }

const CATEGORIES = ['All', 'Food', 'Shopping', 'Transport', 'Health', 'Entertainment'];

const GROUPS: Group[] = [
  {
    date: 'TODAY',
    items: [
      { id: '1', icon: 'receipt', title: 'Netflix',     subtitle: 'Entertainment · Today', amount: -15.99 },
      { id: '2', icon: 'receipt', title: 'Whole Foods', subtitle: 'Groceries · Today',      amount: -84.30 },
    ],
  },
  {
    date: 'YESTERDAY, APR 29',
    items: [
      { id: '3', icon: 'trending-up', title: 'Salary — April', subtitle: 'Income · Apr 29', amount: 4200.00 },
    ],
  },
  {
    date: 'MONDAY, APR 28',
    items: [
      { id: '4', icon: 'receipt', title: 'Uber Eats', subtitle: 'Food · Apr 28',     amount: -32.50 },
      { id: '5', icon: 'receipt', title: 'Zara',      subtitle: 'Shopping · Apr 28', amount: -89.95 },
    ],
  },
  {
    date: 'SUNDAY, APR 27',
    items: [
      { id: '6', icon: 'receipt', title: 'Spotify',       subtitle: 'Entertainment · Apr 27', amount:  -9.99  },
      { id: '7', icon: 'receipt', title: 'Metro Monthly', subtitle: 'Transport · Apr 26',      amount: -110.00 },
    ],
  },
];

function fmt(n: number) {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n >= 0 ? '+$' : '-$') + abs;
}

export default function HistoryScreen() {
  const theme = useAppTheme();
  const [activeFilter, setActiveFilter] = useState('All');

  const totalSpent  = GROUPS.flatMap(g => g.items).filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = GROUPS.flatMap(g => g.items).filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const net         = totalIncome - totalSpent;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>History</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.surface }]} activeOpacity={0.7}>
              <MaterialIcons name="search" size={20} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.surface }]} activeOpacity={0.7}>
              <MaterialIcons name="filter-list" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Category filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.filterChip,
                { backgroundColor: activeFilter === cat ? theme.primary : theme.surface, borderColor: activeFilter === cat ? theme.primary : theme.border },
              ]}
              onPress={() => setActiveFilter(cat)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterLabel, { color: activeFilter === cat ? '#FFFFFF' : theme.textSecondary }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryBox, { backgroundColor: theme.surface }]}>
            <Text style={[styles.summaryKey, { color: theme.textMuted }]}>SPENT</Text>
            <Text style={[styles.summaryVal, { color: theme.expense }]}>${totalSpent.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</Text>
          </View>
          <View style={[styles.summaryBox, { backgroundColor: theme.surface }]}>
            <Text style={[styles.summaryKey, { color: theme.textMuted }]}>INCOME</Text>
            <Text style={[styles.summaryVal, { color: theme.income }]}>${totalIncome.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</Text>
          </View>
          <View style={[styles.summaryBox, { backgroundColor: theme.surface }]}>
            <Text style={[styles.summaryKey, { color: theme.textMuted }]}>NET</Text>
            <Text style={[styles.summaryVal, { color: theme.text }]}>+${net.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</Text>
          </View>
        </View>

        {/* Grouped transactions */}
        {GROUPS.map(group => (
          <View key={group.date} style={{ marginBottom: 4 }}>
            <Text style={[styles.groupDate, { color: theme.textMuted }]}>{group.date}</Text>
            {group.items.map(t => (
              <TouchableOpacity key={t.id} style={[styles.txRow, { backgroundColor: theme.surface }]} activeOpacity={0.75}>
                <View style={[styles.txIcon, { backgroundColor: theme.primaryBg }]}>
                  <MaterialIcons name={t.icon} size={18} color={theme.primary} />
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
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  filterScroll: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterLabel: { fontSize: 14, fontWeight: '600' },

  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  summaryBox: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  summaryKey: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, marginBottom: 4 },
  summaryVal: { fontSize: 16, fontWeight: '700' },

  groupDate: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 20, marginTop: 12, marginBottom: 8 },
  txRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 2, borderRadius: 0, paddingHorizontal: 16, paddingVertical: 14 },
  txIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txText: { flex: 1 },
  txTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  txSub: { fontSize: 12 },
  txAmount: { fontSize: 15, fontWeight: '700' },
});
