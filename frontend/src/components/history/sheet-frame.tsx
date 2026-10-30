import React, { type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';

/**
 * A tall bottom sheet with a title, an optional "Reset", a scrolling body and a fixed footer (the filter sheet's
 * "Show N results" button). Tapping outside or the X closes it.
 */
export function SheetFrame({ visible, title, onClose, onReset, resetLabel, footer, height = '88%', children, testID }: {
  visible: boolean; title: string; onClose: () => void; onReset?: () => void; resetLabel?: string; footer?: ReactNode; height?: string; children: ReactNode; testID?: string;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel={t('catsheet.close')} />
        <View testID={testID} style={[s.sheet, { backgroundColor: theme.surface, height: height as any }]}>
          <View style={[s.grab, { backgroundColor: theme.border }]} />
          <View style={s.head}>
            <Text style={[s.title, { color: theme.text }]}>{title}</Text>
            {onReset ? <TouchableOpacity onPress={onReset} style={s.reset} accessibilityRole="button"><Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>{resetLabel}</Text></TouchableOpacity> : null}
            <TouchableOpacity onPress={onClose} style={s.x} accessibilityRole="button" accessibilityLabel={t('catsheet.close')}><MaterialIcons name="close" size={24} color={theme.text} /></TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={[s.footer, { borderTopColor: theme.border }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,12,16,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 10 },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '600' },
  reset: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  x: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, flexDirection: 'row', gap: 8 },
});
