import React, { useState } from 'react';
import {
  Modal, View, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, ScrollView, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { createWallet } from '@/services/wallet.service';

type WalletType = 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'CASH';

const WALLET_TYPES: { key: WalletType; label: string; icon: string }[] = [
  { key: 'CHECKING', label: 'Checking', icon: 'account-balance' },
  { key: 'SAVINGS',  label: 'Savings',  icon: 'savings' },
  { key: 'CREDIT',   label: 'Credit',   icon: 'credit-card' },
  { key: 'CASH',     label: 'Cash',     icon: 'payments' },
];

const COLORS = ['#2D336B', '#60A5FA', '#4ADE80', '#F472B6', '#FBBF24', '#A78BFA', '#F87171', '#34D399'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function WalletFormModal({ visible, onClose, onCreated }: Props) {
  const theme  = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const [name,       setName]       = useState('');
  const [bank,       setBank]       = useState('');
  const [balance,    setBalance]    = useState('');
  const [walletType, setWalletType] = useState<WalletType>('CHECKING');
  const [color,      setColor]      = useState('#2D336B');
  const [saving,     setSaving]     = useState(false);

  const reset      = () => { setName(''); setBank(''); setBalance(''); setWalletType('CHECKING'); setColor('#2D336B'); };
  const handleClose = () => { reset(); onClose(); };

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Please enter an account name.'); return; }
    setSaving(true);
    try {
      await createWallet({ name: name.trim(), bank: bank.trim() || 'My Bank', balance: balance ? parseFloat(balance) : 0, walletType, color });
      reset(); onCreated();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not create wallet.');
    } finally { setSaving(false); }
  };

  // Fixed sheet height — never grows when keyboard opens.
  // ScrollView inside allows reaching all fields; button is pinned outside scroll.
  const SHEET_HEIGHT = Math.min(screenHeight * 0.68, 520);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={s.container}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={handleClose} />

        <View style={[s.sheet, { backgroundColor: theme.surface, height: SHEET_HEIGHT }]}>
          <View style={[s.handle, { backgroundColor: theme.border }]} />

          {/* Fixed header */}
          <View style={s.header}>
            <Text style={[s.title, { color: theme.text }]}>Add Account</Text>
            <TouchableOpacity onPress={handleClose} style={s.closeBtn} activeOpacity={0.7}>
              <MaterialIcons name="close" size={22} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Scrollable form fields */}
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={[s.label, { color: theme.textMuted }]}>Account Name *</Text>
            <View style={[s.inputRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <MaterialIcons name="account-balance-wallet" size={18} color={theme.textMuted} style={s.inputIcon} />
              <TextInput style={[s.input, { color: theme.text }]} value={name} onChangeText={setName}
                placeholder="e.g. Main Account" placeholderTextColor={theme.textMuted}
                autoCapitalize="words" returnKeyType="next" />
            </View>

            <Text style={[s.label, { color: theme.textMuted }]}>Bank / Institution</Text>
            <View style={[s.inputRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <MaterialIcons name="business" size={18} color={theme.textMuted} style={s.inputIcon} />
              <TextInput style={[s.input, { color: theme.text }]} value={bank} onChangeText={setBank}
                placeholder="e.g. Chase, GTBank" placeholderTextColor={theme.textMuted}
                autoCapitalize="words" returnKeyType="next" />
            </View>

            <Text style={[s.label, { color: theme.textMuted }]}>Opening Balance</Text>
            <View style={[s.inputRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <MaterialIcons name="attach-money" size={18} color={theme.textMuted} style={s.inputIcon} />
              <TextInput style={[s.input, { color: theme.text }]} value={balance} onChangeText={setBalance}
                placeholder="0.00" placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad" returnKeyType="done" />
            </View>

            <Text style={[s.label, { color: theme.textMuted }]}>Account Type</Text>
            <View style={s.typeRow}>
              {WALLET_TYPES.map(t => {
                const active = walletType === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[s.typeChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primaryBg : theme.background }]}
                    onPress={() => setWalletType(t.key)} activeOpacity={0.75}
                  >
                    <MaterialIcons name={t.icon as any} size={14} color={active ? theme.primary : theme.textMuted} />
                    <Text style={[s.typeLabel, { color: active ? theme.primary : theme.textSecondary }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[s.label, { color: theme.textMuted }]}>Color</Text>
            <View style={s.colorRow}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotActive]}
                  onPress={() => setColor(c)} activeOpacity={0.8}>
                  {color === c && <MaterialIcons name="check" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Button pinned outside scroll — always visible */}
          <View style={[s.btnWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={[s.createBtn, { backgroundColor: theme.buttonBg, opacity: saving ? 0.7 : 1 }]}
              onPress={handleCreate} activeOpacity={0.85} disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <><MaterialIcons name="add" size={20} color="#fff" /><Text style={s.createText}>Add Account</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  overlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },

  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden' },
  handle:{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },

  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 4 },
  title:   { fontSize: 18, fontWeight: '700' },
  closeBtn:{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  scroll:      { flex: 1 },
  formContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },

  label:    { fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 50, marginBottom: 14 },
  inputIcon:{ marginRight: 10 },
  input:    { flex: 1, fontSize: 15 },

  typeRow:  { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5 },
  typeLabel:{ fontSize: 12, fontWeight: '600' },

  colorRow:       { flexDirection: 'row', gap: 10, marginBottom: 12 },
  colorDot:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 2.5, borderColor: '#fff', elevation: 4 },

  btnWrap:    { paddingHorizontal: 20, paddingTop: 10 },
  createBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  createText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
