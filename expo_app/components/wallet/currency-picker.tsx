import React, { useMemo, useState } from 'react';
import { View, Modal, TouchableOpacity, TextInput, FlatList, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { CURRENCIES, Currency } from '@/context/currency-context';
import { useI18n } from '@/context/language-context';

/** Bottom-sheet currency list with search. */
export function CurrencyPicker({
  visible, value, onSelect, onClose, title, note,
}: { visible: boolean; value?: string; onSelect: (c: Currency) => void; onClose: () => void; title?: string; note?: string }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? CURRENCIES.filter(c => c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)) : CURRENCIES;
  }, [q]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { backgroundColor: theme.surface }]}>
          <View style={s.head}>
            <Text style={[s.title, { color: theme.text }]}>{title ?? t('cur.choose')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><MaterialIcons name="close" size={20} color={theme.text} /></TouchableOpacity>
          </View>
          {note ? <Text style={[s.note, { color: theme.textSecondary }]}>{note}</Text> : null}
          <View style={[s.search, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="search" size={17} color={theme.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder={t('cur.search')} placeholderTextColor={theme.textMuted}
                       style={[s.input, { color: theme.text }]} autoCorrect={false} />
          </View>
          <FlatList
            data={list}
            keyExtractor={c => c.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={[s.row, { borderBottomColor: theme.border }]} onPress={() => { onSelect(item); setQ(''); }} activeOpacity={0.7}>
                <Text style={s.flag}>{item.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.code, { color: theme.text }]}>{item.code}</Text>
                  <Text style={[s.name, { color: theme.textMuted }]}>{item.name}</Text>
                </View>
                <Text style={[s.symbol, { color: theme.textSecondary }]}>{item.symbol}</Text>
                {item.code === value && <MaterialIcons name="check-circle" size={17} color={theme.primary} style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet:  { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '78%' },
  head:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title:  { fontSize: 15, fontWeight: '700' },
  note:   { fontSize: 11, marginBottom: 8, lineHeight: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, marginBottom: 6 },
  input:  { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', paddingVertical: 0 },
  row:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  flag:   { fontSize: 20 },
  code:   { fontSize: 13, fontWeight: '700' },
  name:   { fontSize: 11 },
  symbol: { fontSize: 12 },
});
