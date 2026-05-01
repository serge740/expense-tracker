import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';

const MONTHS  = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
const HEIGHTS = [45, 30, 60, 50, 70, 90];

const CATEGORIES = [
  { label: 'Travel',        amount: 318, color: '#7B5CF0' },
  { label: 'Shopping',      amount: 239, color: '#60A5FA' },
  { label: 'Transport',     amount: 122, color: '#4ADE80' },
  { label: 'Groceries',     amount:  84, color: '#FBBF24' },
  { label: 'Health',        amount:  75, color: '#F472B6' },
  { label: 'Entertainment', amount:  26, color: '#A78BFA' },
];
const TOTAL = CATEGORIES.reduce((s, c) => s + c.amount, 0);

export default function ReportsScreen() {
  const theme = useAppTheme();
  const [period, setPeriod] = useState('April 2026');

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Reports</Text>
          <TouchableOpacity style={[styles.periodButton, { backgroundColor: theme.surface, borderColor: theme.border }]} activeOpacity={0.8}>
            <Text style={[styles.periodText, { color: theme.text }]}>{period}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Monthly Spending Card */}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>MONTHLY SPENDING</Text>
          <View style={styles.barChart}>
            {MONTHS.map((m, i) => {
              const isActive = m === 'Apr';
              return (
                <View key={m} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${HEIGHTS[i]}%`,
                          backgroundColor: isActive ? theme.primary : theme.isDark ? '#3D4580' : '#E4E6F4',
                          borderRadius: 4,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barLabel, { color: isActive ? theme.primary : theme.textMuted, fontWeight: isActive ? '700' : '500' }]}>
                    {m}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* By Category Card */}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>BY CATEGORY</Text>
          <View style={styles.donutRow}>
            {/* Donut chart (visual simulation) */}
            <View style={styles.donutWrapper}>
              <View style={[styles.donutOuter, { borderColor: theme.primary }]}>
                <View style={[styles.donutMiddle, { borderColor: '#A78BFA' }]}>
                  <View style={[styles.donutInner, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.donutTotal, { color: theme.text }]}>${TOTAL}</Text>
                    <Text style={[styles.donutTotalLabel, { color: theme.textMuted }]}>total</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              {CATEGORIES.map(cat => (
                <View key={cat.label} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                  <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>{cat.label}</Text>
                  <Text style={[styles.legendAmount, { color: theme.text }]}>${cat.amount}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Top Expenses */}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardLabel, { color: theme.textMuted }]}>TOP EXPENSES</Text>
          {CATEGORIES.slice(0, 4).map((cat, i) => (
            <View key={cat.label} style={styles.topRow}>
              <View style={styles.topLeft}>
                <Text style={[styles.topRank, { color: theme.textMuted }]}>#{i + 1}</Text>
                <View style={[styles.topDot, { backgroundColor: cat.color }]} />
                <Text style={[styles.topLabel, { color: theme.text }]}>{cat.label}</Text>
              </View>
              <View style={styles.topRight}>
                <View style={[styles.topTrack, { backgroundColor: theme.border }]}>
                  <View style={[styles.topFill, { width: `${(cat.amount / CATEGORIES[0].amount) * 100}%`, backgroundColor: cat.color }]} />
                </View>
                <Text style={[styles.topAmount, { color: theme.text }]}>${cat.amount}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  periodButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  periodText: { fontSize: 13, fontWeight: '600' },

  card: { marginHorizontal: 20, borderRadius: 18, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 16 },

  // Bar chart
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%' },
  barLabel: { fontSize: 11 },

  // Donut
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  donutWrapper: { alignItems: 'center', justifyContent: 'center' },
  donutOuter: { width: 110, height: 110, borderRadius: 55, borderWidth: 18, alignItems: 'center', justifyContent: 'center' },
  donutMiddle: { width: 74, height: 74, borderRadius: 37, borderWidth: 14, alignItems: 'center', justifyContent: 'center' },
  donutInner: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  donutTotal: { fontSize: 12, fontWeight: '800' },
  donutTotalLabel: { fontSize: 9 },

  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 12 },
  legendAmount: { fontSize: 12, fontWeight: '700' },

  // Top expenses
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 120 },
  topRank: { fontSize: 12, fontWeight: '600', width: 20 },
  topDot: { width: 8, height: 8, borderRadius: 4 },
  topLabel: { fontSize: 13, fontWeight: '500' },
  topRight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  topTrack: { flex: 1, height: 6, borderRadius: 3 },
  topFill: { height: 6, borderRadius: 3 },
  topAmount: { fontSize: 13, fontWeight: '700', width: 36, textAlign: 'right' },
});
