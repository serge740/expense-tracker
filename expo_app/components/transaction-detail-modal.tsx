import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Text } from '@/components/text';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Transaction, CATEGORY_ICON, deleteTransaction } from '@/services/transaction.service';
import { errorMessage } from '@/utils/family-errors';
import { useI18n } from '@/context/language-context';
import { categoryOf, categoryLabelKey } from '@/constants/categories';
import { useCurrency } from '@/context/currency-context';
import { router } from 'expo-router';


interface Props {
  visible: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function TransactionDetailModal({ visible, transaction, onClose, onDeleted }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { currency } = useCurrency();
  const sym = currency.symbol;
  const [deleting, setDeleting] = useState(false);

  if (!transaction) return null;

  const catDef = categoryOf(transaction.category);
  const cfg   = { color: catDef.color, bg: `${catDef.color}26` };
  // Entries created by Debts & loans are changed from the Debts tab only.
  const locked = transaction.category === 'loan';
  const icon  = CATEGORY_ICON[transaction.category] ?? 'receipt';
  const label = t(categoryLabelKey(transaction.category, transaction.type) as any);
  const isPos = transaction.amount >= 0;

  const date    = new Date(transaction.date);
  const dateStr = (() => { try { return date.toLocaleDateString(locale, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }); } catch { return date.toDateString(); } })();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const amtStr = (isPos ? `+${sym}` : `-${sym}`) +
    Math.abs(transaction.amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const handleDelete = () => {
    Alert.alert(
      t('txd.delete'),
      t('txd.deleteMsg', { title: transaction.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('wallet.deleteBtn'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteTransaction(transaction.id);
              onDeleted(transaction.id);
              onClose();
            } catch (e: any) {
              Alert.alert(t('common.error'), errorMessage(e, t('txd.errDelete'), t));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />

      <View style={s.centeredWrap} pointerEvents="box-none">
        <View style={[s.card, { backgroundColor: theme.surface }]}>

          {/* Close */}
          <TouchableOpacity style={[s.closeBtn, { backgroundColor: theme.background }]} onPress={onClose} activeOpacity={0.7}>
            <MaterialIcons name="close" size={18} color={theme.textMuted} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={[s.iconCircle, { backgroundColor: cfg.bg }]}>
            <MaterialIcons name={icon} size={34} color={cfg.color} />
          </View>

          {/* Category */}
          <Text style={[s.categoryLabel, { color: theme.textMuted }]}>{label}</Text>

          {/* Amount */}
          <Text style={[s.amount, { color: isPos ? theme.income : theme.expense }]}>{amtStr}</Text>

          {/* Title */}
          <Text style={[s.title, { color: theme.text }]}>{transaction.title}</Text>

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: theme.border }]} />

          {/* Detail rows */}
          <View style={s.rows}>
            <DetailRow
              icon="calendar-today"
              label={t('txd.date')}
              value={dateStr}
              color={theme.primary}
              theme={theme}
            />
            <DetailRow
              icon="access-time"
              label={t('txd.time')}
              value={timeStr}
              color={theme.primary}
              theme={theme}
            />
            {transaction.description && (
              <DetailRow
                icon="notes"
                label={t('txd.note')}
                value={transaction.description}
                color={theme.primary}
                theme={theme}
              />
            )}
            {transaction.walletId && (
              <DetailRow
                icon="credit-card"
                label={t('txd.wallet')}
                value={t('txd.linked')}
                color={theme.primary}
                theme={theme}
              />
            )}
          </View>

          {/* Debt link: opens the debt or credit this money belongs to */}
          {!!transaction.debtId && (
            <TouchableOpacity
              style={[s.debtLink, { backgroundColor: theme.primaryBg }]}
              activeOpacity={0.8}
              accessibilityRole="button"
              onPress={() => { onClose(); router.push({ pathname: '/(dashboard)/debts' as any, params: { openId: transaction.debtId! } }); }}
            >
              <MaterialIcons name="handshake" size={18} color={theme.primary} />
              <Text style={[s.debtLinkText, { color: theme.primary }]}>{t('debt2.linked')}</Text>
              <Text style={[s.debtLinkOpen, { color: theme.primary }]}>{t('debt2.openIt')}</Text>
              <MaterialIcons name="chevron-right" size={18} color={theme.primary} />
            </TouchableOpacity>
          )}

          {/* Delete (debt entries are managed from the Debts tab) */}
          {locked ? (
            <Text style={[s.lockedText, { color: theme.textMuted }]}>
              {t('debts.locked')}{transaction.debtRole === 'BORROW_IN' ? ` ${t('debt2.notIncome')}` : ''}
            </Text>
          ) : (
          <TouchableOpacity
            style={[s.deleteBtn, { borderColor: 'rgba(248,113,113,0.3)', backgroundColor: 'rgba(248,113,113,0.08)' }]}
            onPress={handleDelete}
            disabled={deleting}
            activeOpacity={0.8}
          >
            {deleting
              ? <ActivityIndicator color="#F87171" size="small" />
              : <>
                  <MaterialIcons name="delete-outline" size={18} color="#F87171" />
                  <Text style={s.deleteText}>{t('txd.delete')}</Text>
                </>
            }
          </TouchableOpacity>
          )}

        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ icon, label, value, color, theme }: any) {
  return (
    <View style={s.detailRow}>
      <View style={[s.detailIconBg, { backgroundColor: color + '18' }]}>
        <MaterialIcons name={icon} size={14} color={color} />
      </View>
      <Text style={[s.detailLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[s.detailValue, { color: theme.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  lockedText: { fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 17 },
  debtLink:     { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12 },
  debtLinkText: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  debtLinkOpen: { fontSize: 12, fontWeight: '700' },
  overlay:     { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  centeredWrap:{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },

  card: { width: 320, borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },

  closeBtn:  { position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconCircle:{ width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },

  categoryLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  amount:        { fontSize: 32, fontWeight: '800', marginBottom: 6 },
  title:         { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 16 },

  divider: { width: '100%', height: 1, marginBottom: 14 },

  rows:       { width: '100%', gap: 10, marginBottom: 18 },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIconBg:{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  detailLabel: { fontSize: 12, width: 46 },
  detailValue: { flex: 1, fontSize: 13, fontWeight: '500' },

  deleteBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 13 },
  deleteText: { fontSize: 14, fontWeight: '600', color: '#F87171' },
});
