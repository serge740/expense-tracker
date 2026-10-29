// Ported from expo_app/components/add/receipt-field.tsx
import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { OptionRow, OptionSheet, Tile } from '@/components/add/option-sheet';

interface Props {
  /** Something is attached (its address is only used to know that). */
  attached: boolean;
  /** A picture to show, when the attachment is an image. */
  previewUri: string | null;
  isImage: boolean;
  fileName: string | null;
  /** The receipt is being read and saved. */
  analyzing: boolean;
  /** Leave out where scanning does not apply (a loan payment only keeps the proof). */
  onScan?: () => void;
  onCamera: () => void;
  onFile: () => void;
  onRemove: () => void;
}

/**
 * One field for the receipt: "Add a receipt" (or a thumbnail when one is attached). Tapping it opens a bottom sheet with
 * the ways to add one (scan, photo, file) and, when there is one, a way to remove it.
 */
export function ReceiptField({ attached, previewUri, isImage, fileName, analyzing, onScan, onCamera, onFile, onRemove }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };

  const lead = analyzing
    ? <View style={[s.thumb, { backgroundColor: theme.surface }]}><ActivityIndicator size="small" color={theme.primary} /></View>
    : attached && isImage && previewUri
      ? <Image source={{ uri: previewUri }} style={s.thumb} accessibilityLabel={t('add.receipt')} />
      : <Tile icon={attached ? 'description' : 'receipt-long'} color={theme.primary} bg={theme.primaryBg} />;

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} disabled={analyzing} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('add.receipt')} testID="receipt-field"
                        style={[s.field, { backgroundColor: theme.inputBg, borderColor: attached ? theme.primary : theme.border, opacity: analyzing ? 0.8 : 1 }]}>
        {lead}
        <View style={{ flex: 1 }}>
          <Text style={[s.value, { color: theme.text }]} numberOfLines={1}>
            {analyzing ? t('add.analyzing') : attached ? (isImage ? t('receipt.attached') : fileName ?? t('receipt.attached')) : t('receipt.add')}
          </Text>
          <Text style={[s.sub, { color: theme.textSecondary }]} numberOfLines={1}>{attached && !analyzing ? t('receipt.change') : t('receipt.addSub')}</Text>
        </View>
        <MaterialIcons name="expand-more" size={22} color={theme.textMuted} />
      </TouchableOpacity>

      <OptionSheet visible={open} title={t('add.receipt')} onClose={() => setOpen(false)}>
        {onScan && <OptionRow testID="receipt-scan" tile={<Tile icon="document-scanner" color="#FFFFFF" bg={theme.primary} />} title={t('add.scanReceipt')} sub={t('receipt.scanSub')} onPress={pick(onScan)} />}
        <OptionRow testID="receipt-camera" tile={<Tile icon="photo-camera" color={theme.primary} bg={theme.primaryBg} />} title={t('add.takePhoto')} sub={t('receipt.cameraSub')} onPress={pick(onCamera)} />
        <OptionRow testID="receipt-file" tile={<Tile icon="insert-drive-file" color={theme.primary} bg={theme.primaryBg} />} title={t('add.chooseFile')} sub={t('receipt.fileSub')} onPress={pick(onFile)} />
        {attached && (
          <OptionRow testID="receipt-remove" danger tile={<Tile icon="delete-outline" color="#DC2626" bg="rgba(220,38,38,0.1)" />} title={t('receipt.remove')} onPress={pick(onRemove)} />
        )}
      </OptionSheet>
    </>
  );
}

const s = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  thumb: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 14, fontWeight: '700' },
  sub:   { fontSize: 11, marginTop: 1 },
});
