import React, { useState } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar, ScrollView,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { deleteTransaction, CATEGORY_ICON, CATEGORY_LABEL, CategorySlug } from '@/services/transaction.service';
import { useCurrency } from '@/context/currency-context';

const CATEGORY_COLOR: Record<string, { color: string; bg: string }> = {
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

export default function TransactionDetailScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;
  const [deleting, setDeleting] = useState(false);

  const params = useLocalSearchParams<{
    id: string; type: string; category: string; title: string;
    description: string; amount: string; date: string;
    walletId: string; receiptUrl: string;
  }>();

  const { id, type, category, title, description, walletId, receiptUrl } = params;
  const amount   = parseFloat(params.amount ?? '0');
  const date     = new Date(params.date ?? Date.now());
  const isIncome = type === 'INCOME';

  const cat     = (category ?? 'other') as CategorySlug;
  const cfg     = CATEGORY_COLOR[cat] ?? { color: '#94A3B8', bg: 'rgba(148,163,184,0.15)' };
  const icon    = CATEGORY_ICON[cat] ?? 'receipt';
  const catName = CATEGORY_LABEL[cat] ?? cat;

  const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const amtStr  = (amount >= 0 ? `+${sym}` : `-${sym}`) +
    Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      `Remove "${title}"?\nThis will also update your wallet balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteTransaction(id);
              router.back();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not delete transaction.');
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[s.root, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.headerBg }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Transaction Details</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Hero: icon + amount */}
        <View style={s.hero}>
          <View style={[s.iconCircle, { backgroundColor: cfg.bg }]}>
            <MaterialIcons name={icon} size={36} color={cfg.color} />
          </View>
          <Text style={[s.amountText, { color: isIncome ? '#4ADE80' : '#F87171' }]}>{amtStr}</Text>
          <Text style={s.titleText}>{title}</Text>
          <View style={[s.typeBadge, { backgroundColor: isIncome ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)' }]}>
            <Text style={[s.typeBadgeText, { color: isIncome ? '#4ADE80' : '#F87171' }]}>
              {isIncome ? 'INCOME' : 'EXPENSE'}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.body, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Receipt image */}
        {!!receiptUrl && (
          <View style={[s.receiptCard, { backgroundColor: theme.surface }]}>
            <Text style={[s.sectionLabel, { color: theme.textMuted }]}>RECEIPT</Text>
            <Image source={{ uri: receiptUrl }} style={s.receiptImg} resizeMode="contain" />
          </View>
        )}

        {/* Details card */}
        <View style={[s.detailCard, { backgroundColor: theme.surface }]}>
          <DetailRow icon="category" label="Category" value={catName} color={cfg.color} theme={theme} />
          <View style={[s.sep, { backgroundColor: theme.border }]} />
          <DetailRow icon="calendar-today" label="Date" value={dateStr} color={theme.primary} theme={theme} />
          <View style={[s.sep, { backgroundColor: theme.border }]} />
          <DetailRow icon="access-time" label="Time" value={timeStr} color={theme.primary} theme={theme} />
          {!!description && (
            <>
              <View style={[s.sep, { backgroundColor: theme.border }]} />
              <DetailRow icon="notes" label="Note" value={description} color={theme.primary} theme={theme} />
            </>
          )}
          {!!walletId && (
            <>
              <View style={[s.sep, { backgroundColor: theme.border }]} />
              <DetailRow icon="credit-card" label="Wallet" value="Linked wallet" color={theme.primary} theme={theme} />
            </>
          )}
        </View>

        {/* Delete button */}
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={handleDelete}
          disabled={deleting}
          activeOpacity={0.8}
        >
          {deleting
            ? <ActivityIndicator color="#F87171" />
            : <>
                <MaterialIcons name="delete-outline" size={20} color="#F87171" />
                <Text style={s.deleteBtnText}>Delete Transaction</Text>
              </>
          }
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function DetailRow({ icon, label, value, color, theme }: any) {
  return (
    <View style={s.detailRow}>
      <View style={[s.detailIcon, { backgroundColor: color + '20' }]}>
        <MaterialIcons name={icon} size={16} color={color} />
      </View>
      <Text style={[s.detailLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[s.detailValue, { color: theme.text }]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  backBtn:     { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  hero:       { alignItems: 'center', paddingVertical: 24, gap: 8 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  amountText: { fontSize: 42, fontWeight: '800', color: '#fff' },
  titleText:  { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.85)', textAlign: 'center', paddingHorizontal: 32 },
  typeBadge:     { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  body: { paddingHorizontal: 20, paddingTop: 20, flexGrow: 1 },

  receiptCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  sectionLabel:{ fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  receiptImg:  { width: '100%', height: 220, borderRadius: 12 },

  detailCard: { borderRadius: 18, paddingVertical: 4, paddingHorizontal: 16, marginBottom: 20 },
  detailRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  detailIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailLabel:{ fontSize: 13, width: 68 },
  detailValue:{ flex: 1, fontSize: 14, fontWeight: '600' },
  sep:        { height: 1, marginLeft: 46 },

  deleteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 15, borderWidth: 1.5, borderColor: 'rgba(248,113,113,0.35)', backgroundColor: 'rgba(248,113,113,0.08)' },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: '#F87171' },
});
