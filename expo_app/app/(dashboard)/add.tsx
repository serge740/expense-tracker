import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface Category { id: string; label: string; icon: IconName; }

const CATEGORIES: Category[] = [
  { id: 'food',          label: 'Food',          icon: 'restaurant'           },
  { id: 'transport',     label: 'Transport',      icon: 'directions-car'       },
  { id: 'shopping',      label: 'Shopping',       icon: 'shopping-bag'         },
  { id: 'health',        label: 'Health',         icon: 'local-hospital'       },
  { id: 'entertainment', label: 'Entertainment',  icon: 'movie'                },
  { id: 'travel',        label: 'Travel',         icon: 'flight'               },
  { id: 'groceries',     label: 'Groceries',      icon: 'local-grocery-store'  },
  { id: 'other',         label: 'Other',          icon: 'more-horiz'           },
];

export default function AddExpenseScreen() {
  const theme = useAppTheme();
  const [amount, setAmount]           = useState('84.00');
  const [selectedCat, setSelectedCat] = useState('food');
  const [merchant, setMerchant]       = useState('Café Cortado — Monogram');
  const [date]                        = useState('Apr 30, 2026');
  const [card]                        = useState('Visa ···4821');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.surface} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.inputBg }]} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Add Expense</Text>
          <TouchableOpacity
            style={[styles.scanChip, { backgroundColor: theme.primaryBg, borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(45,51,107,0.15)' }]}
            activeOpacity={0.8}
            onPress={() => router.push('/(dashboard)/scan')}
          >
            <MaterialIcons name="document-scanner" size={14} color={theme.primary} />
            <Text style={[styles.scanChipText, { color: theme.primary }]}>Scan</Text>
          </TouchableOpacity>
        </View>

        {/* Amount */}
        <View style={styles.amountSection}>
          <Text style={[styles.amountLabel, { color: theme.textMuted }]}>AMOUNT (USD)</Text>
          <View style={styles.amountRow}>
            <Text style={[styles.amountDollar, { color: theme.textMuted }]}>$</Text>
            <TextInput
              style={[styles.amountInput, { color: theme.text }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              selectionColor={theme.primary}
            />
          </View>
        </View>

        {/* Category */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>CATEGORY</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map(cat => {
            const active = selectedCat === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: active ? theme.primary : theme.inputBg,
                    borderColor: active ? theme.primary : theme.border,
                  },
                ]}
                activeOpacity={0.75}
                onPress={() => setSelectedCat(cat.id)}
              >
                <MaterialIcons name={cat.icon} size={18} color={active ? '#FFFFFF' : theme.textSecondary} />
                <Text style={[styles.categoryLabel, { color: active ? '#FFFFFF' : theme.textSecondary }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Merchant */}
        <View style={[styles.fieldRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
          <MaterialIcons name="receipt" size={18} color={theme.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={[styles.fieldInput, { color: theme.text }]}
            value={merchant}
            onChangeText={setMerchant}
            placeholder="Merchant or description"
            placeholderTextColor={theme.textMuted}
          />
        </View>

        {/* Date + Card row */}
        <View style={styles.twoCol}>
          <View style={[styles.fieldRow, { flex: 1, backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="calendar-today" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
            <Text style={[styles.fieldText, { color: theme.text }]}>{date}</Text>
          </View>
          <View style={{ width: 10 }} />
          <View style={[styles.fieldRow, { flex: 1, backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="credit-card" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
            <Text style={[styles.fieldText, { color: theme.text }]}>{card}</Text>
          </View>
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: theme.primary }]}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <MaterialIcons name="check" size={20} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>Save Expense</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginBottom: 28 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scanChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  scanChipText: { fontSize: 13, fontWeight: '600' },

  amountSection: { alignItems: 'center', marginBottom: 32 },
  amountLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 12 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end' },
  amountDollar: { fontSize: 32, fontWeight: '600', marginBottom: 6, marginRight: 2 },
  amountInput: { fontSize: 60, fontWeight: '800', minWidth: 120 },

  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  categoryChip: { width: '22%', aspectRatio: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1 },
  categoryLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  fieldRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 52, marginBottom: 12 },
  fieldInput: { flex: 1, fontSize: 15 },
  fieldText: { fontSize: 14, flex: 1 },
  twoCol: { flexDirection: 'row', marginBottom: 12 },

  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, paddingVertical: 16, gap: 8, marginTop: 12,
    shadowColor: '#2D336B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
