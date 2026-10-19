import React from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { CARD_THEMES, cardTheme } from '@/constants/card-themes';
import { useI18n } from '@/context/language-context';

/** Row of mini card swatches (used inside the new-wallet form). */
export function CardColorRow({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const selected = cardTheme(value).id;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {CARD_THEMES.map(th => {
        const on = th.id === selected;
        return (
          <TouchableOpacity key={th.id} onPress={() => onChange(th.id)} activeOpacity={0.85} style={s.item}>
            <LinearGradient colors={th.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={[s.swatch, { borderColor: on ? th.accent : 'transparent' }]}>
              <View style={[s.glow, { backgroundColor: th.glow }]} />
              {on && <MaterialIcons name="check" size={16} color="#FFFFFF" />}
            </LinearGradient>
            <Text style={[s.name, { color: on ? theme.text : theme.textMuted, fontWeight: on ? '700' : '500' }]}>{t(`color.${th.id}` as any)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** Bottom sheet to change an existing wallet's card colour. */
export function CardColorPicker({
  visible, value, walletName, onSelect, onClose,
}: { visible: boolean; value?: string; walletName?: string; onSelect: (id: string) => void; onClose: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const selected = cardTheme(value).id;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: theme.surface }]}>
          <View style={s.head}>
            <Text style={[s.title, { color: theme.text }]}>{t('color.title')}{walletName ? ` · ${walletName}` : ''}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><MaterialIcons name="close" size={20} color={theme.text} /></TouchableOpacity>
          </View>
          <View style={s.grid}>
            {CARD_THEMES.map(th => {
              const on = th.id === selected;
              return (
                <TouchableOpacity key={th.id} style={s.gridItem} onPress={() => onSelect(th.id)} activeOpacity={0.85}>
                  <LinearGradient colors={th.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                  style={[s.big, { borderColor: on ? th.accent : 'transparent' }]}>
                    <View style={[s.bigGlow, { backgroundColor: th.glow }]} />
                    <View style={s.bigLines}>
                      <View style={s.line} />
                      <View style={[s.line, { width: '40%' }]} />
                    </View>
                    {on && <View style={s.check}><MaterialIcons name="check" size={12} color={th.gradient[0]} /></View>}
                  </LinearGradient>
                  <Text style={[s.gridName, { color: on ? theme.text : theme.textSecondary, fontWeight: on ? '700' : '500' }]}>
                    {t(`color.${th.id}` as any)}{th.id === CARD_THEMES[0].id ? ` · ${t('color.default')}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  row:    { gap: 10, paddingRight: 8 },
  item:   { alignItems: 'center', width: 62 },
  swatch: { width: 56, height: 38, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glow:   { position: 'absolute', width: 40, height: 40, borderRadius: 20, top: -16, right: -12 },
  name:   { fontSize: 9, marginTop: 4 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 28 },
  head:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title:    { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  gridItem: { width: '23%', alignItems: 'center' },
  big:      { width: '100%', aspectRatio: 1.45, borderRadius: 12, borderWidth: 2, overflow: 'hidden', justifyContent: 'flex-end', padding: 6 },
  bigGlow:  { position: 'absolute', width: 50, height: 50, borderRadius: 25, top: -20, right: -16 },
  bigLines: { gap: 3 },
  line:     { height: 3, width: '70%', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  check:    { position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  gridName: { fontSize: 10, marginTop: 5, textAlign: 'center' },
});
