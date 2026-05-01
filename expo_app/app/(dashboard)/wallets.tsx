import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';

const WALLETS = [
  { id: '1', name: 'Main Account',  bank: 'Chase Bank',    balance: 5240.00, last4: '4821', color: '#2D336B' },
  { id: '2', name: 'Savings',       bank: 'Bank of America', balance: 7180.50, last4: '0092', color: '#3D4580' },
  { id: '3', name: 'Credit Card',   bank: 'Amex',          balance: -342.20, last4: '3301', color: '#60A5FA' },
];

export default function WalletsScreen() {
  const theme = useAppTheme();

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Wallets</Text>
          <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.primary }]} activeOpacity={0.8}>
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Total */}
        <View style={[styles.totalCard, { backgroundColor: theme.primary }]}>
          <View style={styles.totalDecor} />
          <Text style={styles.totalLabel}>TOTAL BALANCE</Text>
          <Text style={styles.totalAmount}>$12,078<Text style={{ fontSize: 22 }}>.30</Text></Text>
          <Text style={styles.totalSub}>Across {WALLETS.length} accounts</Text>
        </View>

        {/* Wallet cards */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>My Accounts</Text>
        {WALLETS.map(w => (
          <TouchableOpacity key={w.id} style={[styles.walletCard, { backgroundColor: theme.surface }]} activeOpacity={0.8}>
            <View style={[styles.walletIcon, { backgroundColor: w.color }]}>
              <MaterialIcons name="account-balance-wallet" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.walletInfo}>
              <Text style={[styles.walletName, { color: theme.text }]}>{w.name}</Text>
              <Text style={[styles.walletBank, { color: theme.textSecondary }]}>{w.bank} ···{w.last4}</Text>
            </View>
            <View style={styles.walletRight}>
              <Text style={[styles.walletBalance, { color: w.balance < 0 ? theme.expense : theme.text }]}>
                {w.balance < 0 ? '-' : ''}${Math.abs(w.balance).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={[styles.addWalletRow, { borderColor: theme.border }]} activeOpacity={0.7}>
          <MaterialIcons name="add-circle-outline" size={20} color={theme.primary} />
          <Text style={[styles.addWalletText, { color: theme.primary }]}>Add New Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  addButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  totalCard: { marginHorizontal: 20, borderRadius: 22, padding: 22, overflow: 'hidden', marginBottom: 24 },
  totalDecor: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)', top: -50, right: -30 },
  totalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, fontWeight: '600', marginBottom: 8 },
  totalAmount: { fontSize: 40, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  totalSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },

  sectionTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },

  walletCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 10, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  walletIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  walletInfo: { flex: 1 },
  walletName: { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  walletBank: { fontSize: 12 },
  walletRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  walletBalance: { fontSize: 15, fontWeight: '700' },

  addWalletRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginTop: 4, borderRadius: 14, paddingVertical: 14, gap: 8, borderWidth: 1.5, borderStyle: 'dashed' },
  addWalletText: { fontSize: 14, fontWeight: '600' },
});
