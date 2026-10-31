// Ported from expo_app/app/(dashboard)/transaction-detail.tsx
import { setPendingUndo } from '@/utils/pending-undo';
import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Image, Alert, ActivityIndicator } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect, useLocalSearchParams } from '@/router/router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { deleteTransaction, getTransaction, CATEGORY_ICON, CATEGORY_LABEL, CategorySlug } from '@/services/transaction.service';
import { EditTransactionSheet, type EditableTx } from '@/components/transaction/edit-transaction-sheet';
import { useScope } from '@/context/scope-context';
import { Comments } from '@/components/family/comments';
import { useI18n } from '@/context/language-context';
import { canEditTransaction } from '@/utils/family-permissions';
import { errorMessage } from '@/utils/family-errors';
import { useCurrency } from '@/context/currency-context';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { downloadFromUrl, extensionOf } from '@/lib/download';

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

export default function TransactionDetailScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;
  const scope = useScope();
  const { t: tr } = useI18n();
  const [deleting,    setDeleting]    = useState(false);
  const [viewerOpen,  setViewerOpen]  = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const [server, setServer] = useState<EditableTx | null>(null);
  const [editing, setEditing] = useState(false);
  const urlParams = useLocalSearchParams<{
    id: string; type: string; category: string; title: string;
    subCategory: string; description: string; amount: string; date: string;
    walletId: string; receiptUrl: string; receiptReportUrl: string;
    authorId?: string; authorName?: string; authorIsYou?: string;
  }>();

  // What is on screen follows the server once it has answered (the address only gives the first picture, and goes stale after an edit).
  const params = server ? {
    ...urlParams,
    type: server.type, category: server.category, title: server.title, subCategory: server.subCategory ?? '', description: server.description ?? '',
    amount: String(server.amount), date: String(server.date), walletId: server.walletId ?? '',
    receiptUrl: (server as any).receiptUrl ?? urlParams.receiptUrl, receiptReportUrl: (server as any).receiptReportUrl ?? urlParams.receiptReportUrl,
  } : urlParams;
  const { id, type, category, title, subCategory, description, walletId, receiptUrl, receiptReportUrl } = params;
  const loadServer = useCallback(() => { if (urlParams.id) getTransaction(urlParams.id).then(setServer).catch(() => undefined); }, [urlParams.id]);
  useFocusEffect(useCallback(() => { loadServer(); }, [loadServer]));
  const amount   = parseFloat(params.amount ?? '0');
  const date     = new Date(params.date ?? Date.now());
  const isIncome = type === 'INCOME';
  // Inside a family: who added it, and whether this person may change it (their own, with the right role; another person's, owner and admins only).
  const author = scope.isFamily && params.authorId ? { name: params.authorName ?? '', isYou: params.authorIsYou === '1' } : null;
  const mayDelete = !scope.isFamily || canEditTransaction(scope.role, !!author?.isYou);

  const cat     = (category ?? 'other') as CategorySlug;
  const cfg     = CATEGORY_COLOR[cat] ?? { color: '#94A3B8', bg: 'rgba(148,163,184,0.15)' };
  const icon    = CATEGORY_ICON[cat] ?? 'receipt';
  const catName = CATEGORY_LABEL[cat] ?? cat;

  const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const amtStr  = (amount >= 0 ? `+${sym}` : `-${sym}`) +
    Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const handleDownloadReceipt = async () => {
    if (!receiptUrl) return;
    setDownloading(true);
    try {
      await downloadFromUrl(receiptUrl, `receipt_${Date.now()}.${extensionOf(receiptUrl)}`);
    } catch {
      Alert.alert('Error', 'Could not save the receipt image.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!receiptReportUrl) return;
    setDownloadingReport(true);
    try {
      await downloadFromUrl(receiptReportUrl, `receipt-report-${Date.now()}.pdf`);
    } catch {
      Alert.alert('Error', 'Could not download the report.');
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      `Remove "${title}"?\nThis will also update your wallet balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const r = await deleteTransaction(id);
              if (r.trashId) setPendingUndo({ message: tr('select.deleted', { n: 1 }), trashIds: [r.trashId] });
              router.back();
            } catch (e: any) {
              Alert.alert('Error', errorMessage(e, 'Could not delete transaction.', tr));
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[s.root, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.headerBg }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Transaction Details</Text>
          {server?.edit.allowed ? (
            <TouchableOpacity testID="detail-edit" style={s.backBtn} onPress={() => setEditing(true)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={tr('edt.edit')}>
              <MaterialIcons name="edit" size={19} color="#fff" />
            </TouchableOpacity>
          ) : <View style={{ width: 38 }} />}
        </View>

        {/* Hero: icon + amount */}
        <View style={s.hero}>
          <View style={[s.iconCircle, { backgroundColor: cfg.bg }]}>
            <MaterialIcons name={icon} size={36} color={cfg.color} />
          </View>
          <Text style={[s.amountText, { color: isIncome ? '#4ADE80' : '#F87171' }]}>{amtStr}</Text>
          <Text style={s.titleText}>{title}</Text>
          <View style={[s.typeBadge, { backgroundColor: isIncome ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)' }]}>
            <Text style={[s.typeBadgeText, { color: isIncome ? '#4ADE80' : '#F87171' }]}>
              {isIncome ? 'INCOME' : 'EXPENSE'}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.body, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Receipt image */}
        {!!receiptUrl && (
          <>
            <ImageViewerModal
              visible={viewerOpen}
              uri={receiptUrl}
              onClose={() => setViewerOpen(false)}
            />
            <View style={[s.receiptCard, { backgroundColor: theme.surface }]}>
              <View style={s.receiptHeader}>
                <Text style={[s.sectionLabel, { color: theme.textMuted }]}>RECEIPT</Text>
                <TouchableOpacity
                  style={[s.downloadBtn, { backgroundColor: theme.primaryBg }]}
                  onPress={handleDownloadReceipt}
                  disabled={downloading}
                  activeOpacity={0.75}
                >
                  {downloading
                    ? <ActivityIndicator size="small" color={theme.primary} />
                    : <MaterialIcons name="download" size={16} color={theme.primary} />
                  }
                  <Text style={[s.downloadBtnText, { color: theme.primary }]}>
                    {downloading ? 'Saving…' : 'Download'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setViewerOpen(true)} activeOpacity={0.9}>
                <Image source={{ uri: receiptUrl }} style={s.receiptImg} resizeMode="contain" />
                <View style={s.zoomHint}>
                  <MaterialIcons name="zoom-in" size={14} color="rgba(255,255,255,0.8)" />
                  <Text style={s.zoomHintText}>Tap to zoom</Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Receipt report (PDF) */}
        {!!receiptReportUrl && (
          <TouchableOpacity
            style={[s.reportBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={handleDownloadReport}
            disabled={downloadingReport}
            activeOpacity={0.8}
          >
            <View style={[s.reportIcon, { backgroundColor: theme.primaryBg }]}>
              {downloadingReport
                ? <ActivityIndicator size="small" color={theme.primary} />
                : <MaterialIcons name="picture-as-pdf" size={20} color={theme.primary} />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.reportTitle, { color: theme.text }]}>Receipt report (PDF)</Text>
              <Text style={[s.reportSub, { color: theme.textMuted }]}>Extracted details + original file</Text>
            </View>
            <MaterialIcons name="download" size={18} color={theme.primary} />
          </TouchableOpacity>
        )}

        {/* Details card */}
        <View style={[s.detailCard, { backgroundColor: theme.surface }]}>
          <DetailRow icon="category" label="Category" value={catName} color={cfg.color} theme={theme} />
          {!!subCategory && (
            <>
              <View style={[s.sep, { backgroundColor: theme.border }]} />
              <DetailRow icon="label" label="Sub" value={subCategory} color={cfg.color} theme={theme} />
            </>
          )}
          <View style={[s.sep, { backgroundColor: theme.border }]} />
          {author ? (
            <>
              <DetailRow icon="person" label={tr('family.tx.by')} value={author.isYou ? `${author.name} (${tr('family.tx.you')})` : author.name} color={theme.primary} theme={theme} />
              <View style={[s.sep, { backgroundColor: theme.border }]} />
            </>
          ) : null}
          <DetailRow icon="calendar-today" label="Date" value={dateStr} color={theme.primary} theme={theme} />
          <View style={[s.sep, { backgroundColor: theme.border }]} />
          <DetailRow icon="access-time" label="Time" value={timeStr} color={theme.primary} theme={theme} />
          {!!description && (
            <>
              <View style={[s.sep, { backgroundColor: theme.border }]} />
              <DetailRow icon="notes" label="Note" value={description} color={theme.primary} theme={theme} />
            </>
          )}
          {!!walletId && (
            <>
              <View style={[s.sep, { backgroundColor: theme.border }]} />
              <DetailRow icon="credit-card" label="Wallet" value={server?.wallet?.name ?? 'Linked wallet'} color={theme.primary} theme={theme} />
            </>
          )}
          {server?.tags?.length ? (
            <>
              <View style={[s.sep, { backgroundColor: theme.border }]} />
              <DetailRow icon="sell" label="Tags" value={server.tags.map(x => `#${x}`).join(' ')} color={theme.primary} theme={theme} />
            </>
          ) : null}
          {server?.note ? (
            <>
              <View style={[s.sep, { backgroundColor: theme.border }]} />
              <DetailRow icon="lock" label="Private note" value={server.note} color={theme.primary} theme={theme} />
            </>
          ) : null}
        </View>

        {scope.isFamily && id ? <Comments transactionId={id} /> : null}
        <TouchableOpacity testID="detail-activity" onPress={() => router.push({ pathname: '/(dashboard)/activity' as any, params: { entity: 'transaction', entityId: id } })} accessibilityRole="button"
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: theme.primaryBg }}>
          <MaterialIcons name="history" size={20} color={theme.primary} />
          <Text style={{ flex: 1, color: theme.primary, fontSize: 14, fontWeight: '600' }}>{tr('act.itemHistory')}</Text>
          <MaterialIcons name="chevron-right" size={22} color={theme.primary} />
        </TouchableOpacity>

        {/* Delete button (in a family only where the role allows it) */}
        {!mayDelete ? <Text testID="detail-not-yours" style={{ color: theme.textMuted, fontSize: 12.5, textAlign: 'center', marginTop: 18, lineHeight: 18 }}>{tr('family.tx.notYours')}</Text> : null}
        {mayDelete ? (
        <TouchableOpacity
          testID="detail-delete"
          style={s.deleteBtn}
          onPress={handleDelete}
          disabled={deleting}
          activeOpacity={0.8}
        >
          {deleting
            ? <ActivityIndicator color="#F87171" />
            : <>
                <MaterialIcons name="delete-outline" size={20} color="#F87171" />
                <Text style={s.deleteBtnText}>Delete Transaction</Text>
              </>
          }
        </TouchableOpacity>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
      <EditTransactionSheet tx={server} visible={editing} onClose={() => setEditing(false)} onReload={loadServer}
                            onSaved={() => { loadServer(); }} />
    </View>
  );
}

function DetailRow({ icon, label, value, color, theme }: any) {
  return (
    <View style={s.detailRow}>
      <View style={[s.detailIcon, { backgroundColor: color + '20' }]}>
        <MaterialIcons name={icon} size={16} color={color} />
      </View>
      <Text style={[s.detailLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[s.detailValue, { color: theme.text }]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  backBtn:     { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  hero:       { alignItems: 'center', paddingVertical: 24, gap: 8 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  amountText: { fontSize: 42, fontWeight: '800', color: '#fff' },
  titleText:  { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.85)', textAlign: 'center', paddingHorizontal: 32 },
  typeBadge:     { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  body: { paddingHorizontal: 20, paddingTop: 20, flexGrow: 1 },

  receiptCard:     { borderRadius: 18, padding: 16, marginBottom: 14 },
  receiptHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel:    { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  downloadBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  downloadBtnText: { fontSize: 12, fontWeight: '600' },
  receiptImg:      { width: '100%', height: 220, borderRadius: 12 },
  zoomHint:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 },
  zoomHintText:    { fontSize: 11, color: 'rgba(150,150,150,0.9)' },

  reportBtn:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14 },
  reportIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reportTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  reportSub:   { fontSize: 11 },

  detailCard: { borderRadius: 18, paddingVertical: 4, paddingHorizontal: 16, marginBottom: 20 },
  detailRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  detailIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailLabel:{ fontSize: 13, width: 68 },
  detailValue:{ flex: 1, fontSize: 14, fontWeight: '600' },
  sep:        { height: 1, marginLeft: 46 },

  deleteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 15, borderWidth: 1.5, borderColor: 'rgba(248,113,113,0.35)', backgroundColor: 'rgba(248,113,113,0.08)' },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: '#F87171' },
});
