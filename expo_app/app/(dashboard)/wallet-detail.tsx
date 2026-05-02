import React, { useCallback, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { getTransactions, deleteTransaction, Transaction, CATEGORY_ICON } from '@/services/transaction.service';
import { useCurrency } from '@/context/currency-context';
import { TransactionDetailModal } from '@/components/transaction-detail-modal';

function fmt(n: number, sym: string) {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n >= 0 ? `+${sym}` : `-${sym}`) + abs;
}

const CAT_COLOR: Record<string, string> = {
  food: '#FF8C42', transport: '#60A5FA', shopping: '#A78BFA', health: '#F472B6',
  entertainment: '#FBBF24', travel: '#7B7FD4', groceries: '#4ADE80', salary: '#34D399', other: '#94A3B8',
};

export default function WalletDetailScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;

  const params = useLocalSearchParams<{
    walletId: string; walletName: string; walletBank: string;
    walletBalance: string; walletColor: string;
  }>();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [detailTx,     setDetailTx]     = useState<Transaction | null>(null);

  const balance = parseFloat(params.walletBalance ?? '0');
  const color   = params.walletColor ?? '#2D336B';

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await getTransactions({ walletId: params.walletId, limit: 100 });
      setTransactions(result.data);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [params.walletId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalIncome  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />

      <TransactionDetailModal
        visible={!!detailTx}
        transaction={detailTx}
        onClose={() => setDetailTx(null)}
        onDeleted={(id) => setTransactions(prev => prev.filter(t => t.id !== id))}
      />

      <ScrollView
        contentContainerStyle={[s.scroll, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#fff" />
        }
      >
        {/* Header */}
        <View style={[s.header, { backgroundColor: theme.headerBg }]}>
          <View style={s.decCircle} />

          <View style={s.topBar}>
            <TouchableOpacity style={[s.backBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]} onPress={() => router.back()} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={s.screenTitle}>Wallet Details</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Wallet card in header */}
          <View style={[s.walletCard, { backgroundColor: color }]}>
            <View style={s.walletCardDecor} />
            <View style={s.walletRow}>
              <View style={s.walletIconBg}>
                <MaterialIcons name="account-balance-wallet" size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.walletName}>{params.walletName}</Text>
                <Text style={s.walletBank}>{params.walletBank}</Text>
              </View>
            </View>
            <Text style={s.balanceLabel}>BALANCE</Text>
            <Text style={s.balanceAmt}>
              {`${balance < 0 ? '-' : ''}${sym}${Math.abs(balance).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`}
            </Text>

            {/* Mini stats */}
            <View style={s.miniStats}>
              <View style={s.miniStat}>
                <MaterialIcons name="arrow-downward" size={12} color="#4ADE80" />
                <Text style={s.miniStatLabel}>Income</Text>
                <Text style={s.miniStatVal}>{sym}{Math.round(totalIncome).toLocaleString()}</Text>
              </View>
              <View style={[s.miniStatDivider]} />
              <View style={s.miniStat}>
                <MaterialIcons name="arrow-upward" size={12} color="#F87171" />
                <Text style={s.miniStatLabel}>Spent</Text>
                <Text style={s.miniStatVal}>{sym}{Math.round(totalExpense).toLocaleString()}</Text>
              </View>
              <View style={[s.miniStatDivider]} />
              <View style={s.miniStat}>
                <MaterialIcons name="receipt-long" size={12} color="rgba(255,255,255,0.7)" />
                <Text style={s.miniStatLabel}>Txns</Text>
                <Text style={s.miniStatVal}>{transactions.length}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Transactions */}
        <Text style={[s.sectionTitle, { color: theme.text }]}>Transactions</Text>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
        ) : transactions.length === 0 ? (
          <View style={[s.emptyCard, { backgroundColor: theme.surface }]}>
            <MaterialIcons name="receipt-long" size={32} color={theme.textMuted} />
            <Text style={[s.emptyText, { color: theme.textMuted }]}>No transactions for this wallet yet</Text>
          </View>
        ) : (
          transactions.map(t => {
            const catColor = CAT_COLOR[t.category] ?? '#94A3B8';
            const icon     = CATEGORY_ICON[t.category] ?? 'receipt';
            const dateStr  = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <TouchableOpacity
                key={t.id}
                style={[s.txCard, { backgroundColor: theme.surface }]}
                onPress={() => setDetailTx(t)}
                activeOpacity={0.75}
              >
                <View style={[s.txIcon, { backgroundColor: catColor + '22' }]}>
                  <MaterialIcons name={icon} size={18} color={catColor} />
                </View>
                <View style={s.txMid}>
                  <Text style={[s.txTitle, { color: theme.text }]}>{t.title}</Text>
                  <Text style={[s.txDate, { color: theme.textSecondary }]}>{dateStr}</Text>
                </View>
                <Text style={[s.txAmt, { color: t.amount >= 0 ? theme.income : theme.expense }]}>
                  {fmt(t.amount, sym)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flexGrow: 1 },

  header:    { paddingBottom: 24, overflow: 'hidden' },
  decCircle: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -40 },

  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  walletCard:      { marginHorizontal: 20, borderRadius: 20, padding: 20, overflow: 'hidden' },
  walletCardDecor: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -30 },
  walletRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  walletIconBg:    { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  walletName:      { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  walletBank:      { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  balanceLabel:    { fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: 1.5, fontWeight: '600', marginBottom: 4 },
  balanceAmt:      { fontSize: 36, fontWeight: '800', color: '#FFFFFF', marginBottom: 16 },

  miniStats:      { flexDirection: 'row', alignItems: 'center' },
  miniStat:       { flex: 1, alignItems: 'center', gap: 2 },
  miniStatDivider:{ width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' },
  miniStatLabel:  { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  miniStatVal:    { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  sectionTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingTop: 20, marginBottom: 12 },

  txCard:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 10, borderRadius: 16, padding: 14 },
  txIcon:  { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txMid:   { flex: 1 },
  txTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  txDate:  { fontSize: 12 },
  txAmt:   { fontSize: 15, fontWeight: '700' },

  emptyCard: { marginHorizontal: 20, borderRadius: 16, padding: 32, alignItems: 'center', gap: 8, marginTop: 8 },
  emptyText: { fontSize: 14 },
});
