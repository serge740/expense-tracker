import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import * as ImagePicker from '@/lib/shims/expo-image-picker';
import * as DocumentPicker from '@/lib/shims/expo-document-picker';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { DatePickerModal } from '@/components/date-picker-modal';
import { PayFromField } from '@/components/add/pay-from';
import { ReceiptField } from '@/components/add/receipt-field';
import { getWallets, type Wallet } from '@/services/wallet.service';
import { getDebts, type Debt } from '@/services/debt.service';
import { processReceipt, type ProcessedReceipt } from '@/services/receipts.service';
import { dateFromParam } from '@/utils/date-param';
import ENV from '@/env';

export interface PayDetailsOptions {
  /** The day it was planned for (ISO); the "paid on" day starts there, or now when that is still ahead. */
  plannedAt: string | null;
  /** '' when unknown. */
  currency: string;
  /** Where it was planned to be paid from (or into). */
  walletId: string | null;
  /** Money coming in: only a wallet to put it in, never borrowed money. */
  income: boolean;
  /** The debt being paid, so it is never offered to pay itself. */
  excludeDebtId?: string;
  /** With no planned wallet, start on the default one (a credit repaid to me goes somewhere by default). */
  defaultWallet?: boolean;
  /** What a scanned receipt says (the amount goes to the sheet; the day goes to this hook). */
  onScanned: (r: ProcessedReceipt) => void;
}

/** What the person decides in a confirm-payment sheet besides the amount: the day it was paid, where from, and a receipt. */
export function usePayDetails(o: PayDetailsOptions) {
  const { t } = useI18n();
  const scope = useScope();
  const planned = useMemo(() => {
    const p = o.plannedAt ? new Date(o.plannedAt) : null;
    const now = new Date();
    return p && !Number.isNaN(p.getTime()) && p.getTime() <= now.getTime() ? p : now;
  }, [o.plannedAt]);
  const [date, setDate] = useState<Date>(planned);
  const [dateTouched, setDateTouched] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [pots, setPots] = useState<Debt[]>([]);
  const [walletId, setWalletId] = useState<string | null>(o.walletId);
  const [potId, setPotId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; reportUrl: string; mime: string; name: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    getWallets().then(all => {
      const usable = all.filter(x => !x.archived && (!o.currency || x.currency === o.currency));
      setWallets(usable);
      if (o.defaultWallet) { const pre = usable.find(x => x.isDefault) ?? usable[0]; if (pre) setWalletId(cur => cur ?? pre.id); }
    }).catch(() => {});
    // Borrowed money is personal (never offered in a family) and only pays money going out.
    if (o.income || scope.isFamily) { setPots([]); return; }
    getDebts().then(ds => setPots(ds.filter(d => d.kind === 'BORROWED' && d.status === 'OPEN' && !d.archived && (d.unspent ?? 0) > 0 && d.id !== o.excludeDebtId && (!o.currency || d.currency === o.currency)))).catch(() => setPots([]));
  }, [o.currency, o.income, o.excludeDebtId, scope.isFamily]);

  const pickDate = (d: Date) => { setDate(d); setDateTouched(true); };

  const run = useCallback(async (uri: string, filename: string, mime: string) => {
    setAnalyzing(true);
    try {
      const r = await processReceipt(uri, filename, mime);
      setReceipt({ url: r.receiptUrl, reportUrl: r.receiptReportUrl, mime, name: filename });
      // The day (and time) printed on the receipt becomes the day it was paid, when it is a real day that is not ahead of now.
      if (r.date) {
        const d = dateFromParam(r.date, new Date(), r.time);
        if (d.getTime() <= Date.now() + 5 * 60_000) { setDate(d); setDateTouched(true); }
      }
      setScanned(true);
      o.onScanned(r);
    } catch (e: any) {
      Alert.alert(t('add.receipt'), e?.response?.data?.message || e?.message || t('add.uploadFailed'));
    } finally { setAnalyzing(false); }
  }, [o.onScanned, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (source: 'camera' | 'file') => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert(t('add.receipt'), t('add.cameraPermission')); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      const mime = asset.mimeType ?? 'image/jpeg';
      await run(asset.uri, asset.fileName ?? `receipt.${mime === 'image/png' ? 'png' : 'jpg'}`, mime);
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    await run(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
  };

  return {
    planned, date, dateTouched, pickDate, wallets, pots, walletId, setWalletId, potId, setPotId,
    receipt, analyzing, scanned, pickReceipt: pick, removeReceipt: () => { setReceipt(null); setScanned(false); },
  };
}

export type PayDetails = ReturnType<typeof usePayDetails>;

/** The fields: day paid, where it is paid from (or into), and the receipt. */
export function PayDetailsFields({ d, income }: { d: PayDetails; income: boolean }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const [open, setOpen] = useState(false);
  const label = { color: theme.textSecondary, fontSize: 11, fontWeight: '600' as const, marginTop: 12, marginBottom: 6 };
  const preview = d.receipt && (d.receipt.mime ?? '').startsWith('image/') ? (/^https?:/.test(d.receipt.url) ? d.receipt.url : `${ENV.UPLOADS_URL}/${d.receipt.url}`) : null;

  return (
    <View>
      <Text style={label}>{t('pay.paidOn')}</Text>
      <TouchableOpacity testID="pay-date" onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityRole="button"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 12 }}>
        <MaterialIcons name="calendar-today" size={15} color={theme.textMuted} />
        <Text style={{ flex: 1, color: theme.text, fontSize: 14 }}>
          {formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {d.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <MaterialIcons name="expand-more" size={18} color={theme.textMuted} />
      </TouchableOpacity>
      {d.dateTouched ? (
        <Text testID="pay-planned" style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>{t('pay.plannedFor', { when: formatDate(d.planned, { day: 'numeric', month: 'short' }) })}</Text>
      ) : null}
      <DatePickerModal visible={open} title={t('pay.paidOn')} value={d.date} showTime maxDate={new Date()} onClose={() => setOpen(false)} onConfirm={x => { d.pickDate(x); setOpen(false); }} />

      <Text style={label}>{t(income ? 'pay.into' : 'pay.from')}</Text>
      <PayFromField wallets={d.wallets} loans={d.pots} walletId={d.walletId} loanId={d.potId} allowNone
                    onWallet={id => { d.setPotId(null); d.setWalletId(id); }} onLoan={id => d.setPotId(id)} />

      <Text style={label}>{t('add.receipt')} ({t('add.optional')})</Text>
      <ReceiptField attached={!!d.receipt} previewUri={preview} isImage={!d.receipt || (d.receipt.mime ?? '').startsWith('image/')} fileName={d.receipt?.name ?? null} analyzing={d.analyzing}
                    onCamera={() => d.pickReceipt('camera')} onFile={() => d.pickReceipt('file')} onRemove={d.removeReceipt} />
      {d.scanned ? <Text testID="pay-scanned" style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>{t('pay.filled')}</Text> : null}
    </View>
  );
}
