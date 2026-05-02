import React, { useCallback, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { getWallets, getWalletSummary, deleteWallet, Wallet } from '@/services/wallet.service';
import { useCurrency } from '@/context/currency-context';
import { WalletFormModal } from '@/components/wallet-form-modal';

export default function WalletsScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;

  const [wallets,    setWallets]    = useState<Wallet[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [removing,   setRemoving]   = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [list, summary] = await Promise.all([getWallets(), getWalletSummary()]);
      setWallets(list);
      setTotal(summary.totalBalance);
    } catch {
      // silent — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCreated = () => {
    setShowModal(false);
    load(true);
  };

  const handleDelete = (wallet: Wallet) => {
    Alert.alert(
      'Delete Account',
      `Remove "${wallet.name}"? All transactions linked to this wallet will be unlinked but not deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setRemoving(wallet.id);
            try {
              await deleteWallet(wallet.id);
              setWallets(prev => prev.filter(w => w.id !== wallet.id));
              setTotal(prev => prev - wallet.balance);
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not delete account.');
            } finally {
              setRemoving(null);
            }
          },
        },
      ],
    );
  };

  const fmtBalance = (n: number) => {
    const neg = n < 0;
    return `${neg ? '-' : ''}${sym}${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <WalletFormModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={theme.primary}
          />
        }
      >

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Wallets</Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            activeOpacity={0.8}
            onPress={() => setShowModal(true)}
          >
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Total */}
        <View style={[styles.totalCard, { backgroundColor: theme.primary }]}>
          <View style={styles.totalDecor} />
          <Text style={styles.totalLabel}>TOTAL BALANCE</Text>
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} />
          ) : (
            <Text style={styles.totalAmount}>
              {fmtBalance(total).replace(/(\.\d{2})$/, '')}
              <Text style={{ fontSize: 22 }}>{`.${Math.abs(total).toFixed(2).split('.')[1]}`}</Text>
            </Text>
          )}
          <Text style={styles.totalSub}>Across {wallets.length} account{wallets.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Wallet cards */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>My Accounts</Text>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 20 }} />
        ) : wallets.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
            <MaterialIcons name="account-balance-wallet" size={32} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No accounts yet. Add one below.</Text>
          </View>
        ) : (
          wallets.map(w => (
            <TouchableOpacity
              key={w.id}
              style={[styles.walletCard, { backgroundColor: theme.surface }]}
              activeOpacity={0.8}
              onPress={() => router.push(`/(dashboard)/wallet-detail?walletId=${w.id}&walletName=${encodeURIComponent(w.name)}&walletBank=${encodeURIComponent(w.bank)}&walletBalance=${w.balance}&walletColor=${encodeURIComponent(w.color)}`)}
              onLongPress={() => handleDelete(w)}
              disabled={removing === w.id}
            >
              <View style={[styles.walletIcon, { backgroundColor: w.color }]}>
                {removing === w.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <MaterialIcons name="account-balance-wallet" size={22} color="#FFFFFF" />
                )}
              </View>
              <View style={styles.walletInfo}>
                <Text style={[styles.walletName, { color: theme.text }]}>{w.name}</Text>
                <Text style={[styles.walletBank, { color: theme.textSecondary }]}>
                  {w.bank}{w.last4 ? ` ···${w.last4}` : ''}
                  {w.isDefault ? '  ·  Default' : ''}
                </Text>
              </View>
              <View style={styles.walletRight}>
                <Text style={[styles.walletBalance, { color: w.balance < 0 ? theme.expense : theme.text }]}>
                  {fmtBalance(w.balance)}
                </Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity
          style={[styles.addWalletRow, { borderColor: theme.border }]}
          activeOpacity={0.7}
          onPress={() => setShowModal(true)}
        >
          <MaterialIcons name="add-circle-outline" size={20} color={theme.primary} />
          <Text style={[styles.addWalletText, { color: theme.primary }]}>Add New Account</Text>
        </TouchableOpacity>

        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Long-press an account to delete it
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:      { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  addButton:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  totalCard:   { marginHorizontal: 20, borderRadius: 22, padding: 22, overflow: 'hidden', marginBottom: 24 },
  totalDecor:  { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)', top: -50, right: -30 },
  totalLabel:  { fontSize: 11, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, fontWeight: '600', marginBottom: 8 },
  totalAmount: { fontSize: 40, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  totalSub:    { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  sectionTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },

  walletCard:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 10, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  walletIcon:    { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  walletInfo:    { flex: 1 },
  walletName:    { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  walletBank:    { fontSize: 12 },
  walletRight:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  walletBalance: { fontSize: 15, fontWeight: '700' },

  addWalletRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginTop: 4, borderRadius: 14, paddingVertical: 14, gap: 8, borderWidth: 1.5, borderStyle: 'dashed' },
  addWalletText: { fontSize: 14, fontWeight: '600' },

  emptyCard: { marginHorizontal: 20, borderRadius: 16, padding: 28, alignItems: 'center', gap: 8, marginBottom: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },

  hint: { fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 4 },
});
