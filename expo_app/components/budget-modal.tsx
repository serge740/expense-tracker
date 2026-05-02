import React, { useState } from 'react';
import {
  Modal, View, TouchableOpacity, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Text } from '@/components/text';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { upsertBudget } from '@/services/budget.service';
import { useCurrency } from '@/context/currency-context';

interface Props {
  visible: boolean;
  currentLimit: number;
  onClose: () => void;
  onSaved: () => void;
}

export function BudgetModal({ visible, currentLimit, onClose, onSaved }: Props) {
  const theme = useAppTheme();
  const { currency } = useCurrency();

  const now       = new Date();
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const [limit,  setLimit]  = useState(currentLimit > 0 ? String(currentLimit) : '');
  const [saving, setSaving] = useState(false);

  const handleClose = () => { setLimit(currentLimit > 0 ? String(currentLimit) : ''); onClose(); };

  const handleSave = async () => {
    const val = parseFloat(limit);
    if (!limit || isNaN(val) || val <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a budget limit greater than 0.');
      return;
    }
    setSaving(true);
    try {
      await upsertBudget({ limit: val });
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not save budget.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={handleClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kvWrap}>
        <View style={[s.sheet, { backgroundColor: theme.surface }]}>

          <View style={[s.handle, { backgroundColor: theme.border }]} />

          <View style={s.header}>
            <View>
              <Text style={[s.title, { color: theme.text }]}>Set Monthly Budget</Text>
              <Text style={[s.sub, { color: theme.textMuted }]}>{monthName}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={s.closeBtn} activeOpacity={0.7}>
              <MaterialIcons name="close" size={22} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[s.label, { color: theme.textMuted }]}>Spending Limit</Text>
          <View style={[s.inputRow, { backgroundColor: theme.background, borderColor: theme.primary }]}>
            <Text style={[s.sym, { color: theme.textMuted }]}>{currency.symbol}</Text>
            <TextInput
              style={[s.input, { color: theme.text }]}
              value={limit}
              onChangeText={setLimit}
              placeholder="0.00"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          <Text style={[s.hint, { color: theme.textMuted }]}>
            You'll see a progress bar on the home screen tracking your spending against this limit.
          </Text>

          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: theme.buttonBg, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="check" size={20} color="#fff" />
                <Text style={s.saveText}>Save Budget</Text>
              </>
            )}
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  kvWrap:  { flex: 1, justifyContent: 'flex-end' },

  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },

  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title:    { fontSize: 18, fontWeight: '700' },
  sub:      { fontSize: 13, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  label:    { fontSize: 12, fontWeight: '600', marginBottom: 8, letterSpacing: 0.3 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 2, paddingHorizontal: 16, height: 60, marginBottom: 12 },
  sym:      { fontSize: 22, fontWeight: '600', marginRight: 8 },
  input:    { flex: 1, fontSize: 28, fontWeight: '700' },

  hint:    { fontSize: 13, lineHeight: 18, marginBottom: 24 },

  saveBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
