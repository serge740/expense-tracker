// Ported from expo_app/components/add/option-sheet.tsx
import React, { type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';

/** A bottom sheet with a title and a list of choices: tap outside, the X or a choice to close. */
export function OptionSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel={t('catsheet.close')} />
        <View style={[s.sheet, { backgroundColor: theme.surface }]}>
          <View style={[s.grab, { backgroundColor: theme.border }]} />
          <View style={s.head}>
            <Text style={[s.title, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={[s.x, { backgroundColor: theme.inputBg, borderColor: theme.border }]} accessibilityLabel={t('catsheet.close')}>
              <MaterialIcons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** One choice in an OptionSheet: a tile, a name, a line under it, and a tick when it is the current one. */
export function OptionRow({ tile, title, sub, selected, danger, onPress, testID }: {
  tile: ReactNode; title: string; sub?: string; selected?: boolean; danger?: boolean; onPress: () => void; testID?: string;
}) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={title} testID={testID}
                      style={[s.row, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primaryBg : theme.surface }]}>
      {tile}
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, { color: danger ? '#DC2626' : theme.text }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[s.rowSub, { color: theme.textSecondary }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {selected ? <MaterialIcons name="check-circle" size={20} color={theme.primary} /> : null}
    </TouchableOpacity>
  );
}

/** The small coloured square with an icon that leads every row. */
export function Tile({ icon, color, bg }: { icon: string; color: string; bg: string }) {
  return (
    <View style={[s.tile, { backgroundColor: bg }]}>
      <MaterialIcons name={icon} size={20} color={color} />
    </View>
  );
}

export const SectionLabel = ({ text }: { text: string }) => {
  const theme = useAppTheme();
  return <Text style={[s.section, { color: theme.textMuted }]}>{text}</Text>;
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,20,26,0.5)', justifyContent: 'flex-end' },
  sheet:    { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, maxHeight: '80%' },
  grab:     { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  head:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title:    { fontSize: 16, fontWeight: '700' },
  x:        { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  section:  { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 14, marginBottom: 7, marginLeft: 2 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 10, marginBottom: 8 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub:   { fontSize: 11, marginTop: 1 },
  tile:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
