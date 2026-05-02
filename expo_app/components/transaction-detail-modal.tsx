import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Text } from '@/components/text';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Transaction, CATEGORY_ICON, CATEGORY_LABEL, deleteTransaction } from '@/services/transaction.service';
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

interface Props {
  visible: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function TransactionDetailModal({ visible, transaction, onClose, onDeleted }: Props) {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;
  const [deleting, setDeleting] = useState(false);

  if (!transaction) return null;

  const cfg   = CATEGORY_COLOR[transaction.category] ?? { color: '#94A3B8', bg: 'rgba(148,163,184,0.15)' };
  const icon  = CATEGORY_ICON[transaction.category] ?? 'receipt';
  const label = CATEGORY_LABEL[transaction.category] ?? transaction.category;
  const isPos = transaction.amount >= 0;

  const date    = new Date(transaction.date);
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const amtStr = (isPos ? `+${sym}` : `-${sym}`) +
    Math.abs(transaction.amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      `Remove "${transaction.title}"?\nThis will also update your wallet balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteTransaction(transaction.id);
              onDeleted(transaction.id);
              onClose();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not delete transaction.');
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
              label="Date"
              value={dateStr}
              color={theme.primary}
              theme={theme}
            />
            <DetailRow
              icon="access-time"
              label="Time"
              value={timeStr}
              color={theme.primary}
              theme={theme}
            />
            {transaction.description && (
              <DetailRow
                icon="notes"
                label="Note"
                value={transaction.description}
                color={theme.primary}
                theme={theme}
              />
            )}
            {transaction.walletId && (
              <DetailRow
                icon="credit-card"
                label="Wallet"
                value="Linked wallet"
                color={theme.primary}
                theme={theme}
              />
            )}
          </View>

          {/* Delete */}
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
                  <Text style={s.deleteText}>Delete Transaction</Text>
                </>
            }
          </TouchableOpacity>

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
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  centeredWrap:{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

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
