// Ported from expo_app/components/schedule/confirm-sheet.tsx
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { WalletChips } from '@/components/wallet/wallet-chips';
import { getWallets, Wallet } from '@/services/wallet.service';
import { confirmOccurrence } from '@/services/scheduled.service';

export interface ConfirmItem {
  occurrenceId: string;
  title: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  /** '' when the schedule has no wallet (so the currency is unknown). */
  currency: string;
  walletId: string | null;
}

/**
 * Creates the transaction for one scheduled date. The amount and wallet may differ from the schedule
 * for this one date only. Rendered as an overlay: put it inside a Modal.
 */
export function ConfirmSheet({ item, onClose, onDone }: { item: ConfirmItem; onClose: () => void; onDone: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const income = item.type === 'INCOME';
  const [amount, setAmount] = useState(String(item.amount));
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState<string | null>(item.walletId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getWallets()
      .then(w => setWallets(w.filter(x => !x.archived && (!item.currency || x.currency === item.currency))))
      .catch(() => {});
  }, [item.currency]);

  const save = async () => {
    const value = parseFloat(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return Alert.alert(t(income ? 'sched.confirmIncomeTitle' : 'sched.confirmPayTitle'), t('add.errAmount'));
    setSaving(true);
    try {
      await confirmOccurrence(item.occurrenceId, {
        ...(value !== item.amount ? { amount: value } : {}),
        ...(walletId !== item.walletId ? { walletId } : {}),
      });
      onDone();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: theme.surface }]}>
        <View style={[s.grabber, { backgroundColor: theme.border }]} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[s.title, { color: theme.text }]}>{t(income ? 'sched.confirmIncomeTitle' : 'sched.confirmPayTitle')}</Text>
          <Text style={[s.sub, { color: theme.textMuted }]}>{item.title} · {formatMoney(item.amount, item.currency || 'RWF')}</Text>

          <Text style={[s.label, { color: theme.textSecondary }]}>{t('add.amount')}</Text>
          <View style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            {!!item.currency && <Text style={[s.cur, { color: theme.textMuted }]}>{item.currency}</Text>}
            <TextInput value={amount} onChangeText={v => setAmount(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad"
                       style={[s.input, { color: theme.text }]} accessibilityLabel={t('add.amount')} />
          </View>

          <Text style={[s.label, { color: theme.textSecondary }]}>
            {t(income ? 'debts.intoWallet' : 'debts.fromWallet')} ({t('add.optional')})
          </Text>
          <WalletChips wallets={wallets} value={walletId} onChange={setWalletId} noneLabel={t('add.noWallet')} />
          <Text style={[s.hint, { color: theme.textMuted }]}>{t('sched.confirmHint')}</Text>

          <View style={s.pair}>
            <TouchableOpacity style={[s.btn, { backgroundColor: theme.primaryBg }]} onPress={onClose} accessibilityRole="button">
              <Text style={[s.btnText, { color: theme.primary }]}>{t('rem.back')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: theme.buttonBg }]} onPress={save} disabled={saving} accessibilityRole="button">
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[s.btnText, { color: '#FFFFFF' }]}>{t('sched.confirmBtn')}</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:    { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet:   { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 26, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 10 },
  title:   { fontSize: 16, fontWeight: '800' },
  sub:     { fontSize: 11, marginTop: 1 },
  label:   { fontSize: 11, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  field:   { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12 },
  cur:     { fontSize: 12, fontWeight: '700' },
  input:   { flex: 1, fontSize: 18, fontWeight: '700', fontFamily: 'Poppins_700Bold', paddingVertical: 0 },
  hint:    { fontSize: 11, lineHeight: 15, marginTop: 10 },
  pair:    { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn:     { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '700' },
});
