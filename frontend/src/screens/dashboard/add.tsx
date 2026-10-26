// Ported from expo_app/app/(dashboard)/add.tsx
import React, { useCallback, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, TextInput, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import * as ImagePicker from '@/lib/shims/expo-image-picker';
import * as DocumentPicker from '@/lib/shims/expo-document-picker';
import { router, useLocalSearchParams, useFocusEffect } from '@/router/router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { useI18n } from '@/context/language-context';
import { useCurrency, currencyByCode } from '@/context/currency-context';
import { createTransaction } from '@/services/transaction.service';
import { processReceipt } from '@/services/receipts.service';
import { getWallets, Wallet } from '@/services/wallet.service';
import { CATEGORIES, CategorySlug, categoryOf } from '@/constants/categories';
import { DatePickerModal } from '@/components/date-picker-modal';
import { RepeatSheet } from '@/components/repeat-sheet';
import { ModeChoice, RepeatRow } from '@/components/schedule/schedule-fields';
import { createScheduled, ScheduleMode } from '@/services/scheduled.service';
import { RepeatRule } from '@/utils/recurrence';
import { deviceTimeZone } from '@/utils/reminders';
import { isScheduledForm, scheduledPayload, scheduleSaveLabel, scheduleStartError } from '@/utils/schedule-form';
import { WalletChips } from '@/components/wallet/wallet-chips';
import { getDebts, Debt } from '@/services/debt.service';
import ENV from '@/env';

type Kind = 'EXPENSE' | 'INCOME';
const KINDS: { id: Kind; icon: string; label: 'add.expense' | 'add.income' }[] = [
  { id: 'EXPENSE', icon: 'arrow-upward',   label: 'add.expense' },
  { id: 'INCOME',  icon: 'arrow-downward', label: 'add.income' },
];
const COLLAPSED = 8;

export default function AddTransactionScreen() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { currency: mainCurrency } = useCurrency();
  const params = useLocalSearchParams<{
    type?: string; walletId?: string; amount?: string; category?: string;
    description?: string; merchant?: string; date?: string; receiptUrl?: string; receiptReportUrl?: string;
  }>();

  const [kind, setKind]           = useState<Kind>('EXPENSE');
  const [amount, setAmount]       = useState('');
  const [category, setCategory]   = useState<CategorySlug>('food');
  const [showAllCats, setShowAllCats] = useState(false);
  const [description, setDescription] = useState('');
  const [wallets, setWallets]     = useState<Wallet[]>([]);
  const [walletId, setWalletId]   = useState<string | null>(null);
  const [pots, setPots]           = useState<Debt[]>([]);
  const [potId, setPotId]         = useState<string | null>(null);
  const [date, setDate]           = useState(new Date());
  const [pickDate, setPickDate]   = useState(false);
  // Scheduling: a future date or a repeat turns this into a scheduled transaction (nothing moves until it is due).
  const [rule, setRule]           = useState<RepeatRule | null>(null);
  const [mode, setMode]           = useState<ScheduleMode>('REMIND_CONFIRM');
  const [pickRepeat, setPickRepeat] = useState(false);
  const [receiptUrl, setReceiptUrl]             = useState<string | null>(null);
  const [receiptReportUrl, setReceiptReportUrl] = useState<string | null>(null);
  const [receiptMime, setReceiptMime]           = useState<string | null>(null);
  const [receiptName, setReceiptName]           = useState<string | null>(null);
  const [analyzingReceipt, setAnalyzingReceipt] = useState(false);
  const [saving, setSaving]       = useState(false);

  // The screen stays mounted as a hidden tab: reset from params on every visit.
  useFocusEffect(useCallback(() => {
    const k: Kind = params.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
    getDebts().then(ds => setPots(ds.filter(d => d.kind === 'BORROWED' && d.status === 'OPEN' && !d.archived && (d.unspent ?? 0) > 0))).catch(() => setPots([]));
    getWallets().then(list => {
      const usable = list.filter(w => !w.archived);
      setWallets(usable);
      setKind(k);
      setAmount(params.amount ?? '');
      const preset = CATEGORIES.find(c => c.id === params.category && !c.system);
      setCategory(preset ? preset.id : k === 'INCOME' ? 'salary' : 'food');
      setShowAllCats(false);
      setDescription(params.description || params.merchant || '');
      const d = params.date ? new Date(params.date) : new Date();
      setDate(isNaN(d.getTime()) ? new Date() : d);
      setReceiptUrl(params.receiptUrl || null);
      setReceiptReportUrl(params.receiptReportUrl || null);
      setReceiptMime(null);
      setReceiptName(null);
      const pre = usable.find(w => w.id === params.walletId) ?? usable.find(w => w.isDefault) ?? usable[0];
      setWalletId(pre?.id ?? null);
    }).catch(() => {});
  }, [params.type, params.walletId, params.amount, params.category, params.description, params.merchant, params.date, params.receiptUrl, params.receiptReportUrl]));

  const wallet = wallets.find(w => w.id === walletId) ?? null;
  const currency = wallet?.currency ?? mainCurrency.code;
  const cats = CATEGORIES.filter(c => !c.system && c.for.includes(kind));
  const visibleCats = showAllCats ? cats : (() => {
    const head = cats.slice(0, COLLAPSED);
    const sel = cats.find(c => c.id === category);
    return sel && !head.includes(sel) ? [...head.slice(0, COLLAPSED - 1), sel] : head;
  })();
  const accent = kind === 'INCOME' ? '#16A34A' : theme.primary;
  const scheduled = isScheduledForm(date, rule);

  const switchKind = (k: Kind) => {
    setKind(k);
    if (!categoryOf(category).for.includes(k)) setCategory(k === 'INCOME' ? 'salary' : 'food');
  };

  const leave = () => {
    if (params.walletId) router.navigate('/(dashboard)/wallets');
    else if (router.canGoBack()) router.back();
    else router.navigate('/(dashboard)');
  };

  /** Keeps the file on Cloudinary, runs AI extraction, and fills in whatever fields are still empty. */
  const runReceiptPipeline = async (uri: string, filename: string, mimeType: string) => {
    setAnalyzingReceipt(true);
    try {
      const result = await processReceipt(uri, filename, mimeType);
      setReceiptUrl(result.receiptUrl);
      setReceiptReportUrl(result.receiptReportUrl);
      setReceiptMime(mimeType);
      setReceiptName(filename);
      if (result.amount !== null) setAmount(prev => prev || String(result.amount));
      if (result.merchant) setDescription(prev => prev || result.merchant!);
      if (result.date) {
        const d = new Date(result.date);
        if (!isNaN(d.getTime())) setDate(d);
      }
      if (result.category) {
        const preset = CATEGORIES.find(c => c.id === result.category && !c.system);
        if (preset) setCategory(preset.id);
      }
    } catch (e: any) {
      Alert.alert(t('add.receipt'), e?.response?.data?.message || e?.message || t('add.uploadFailed'));
    } finally {
      setAnalyzingReceipt(false);
    }
  };

  const pickReceipt = async (source: 'camera' | 'file') => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert(t('add.receipt'), t('add.cameraPermission')); return; }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      const mime = asset.mimeType ?? 'image/jpeg';
      const name = asset.fileName ?? `receipt.${mime === 'image/png' ? 'png' : 'jpg'}`;
      await runReceiptPipeline(asset.uri, name, mime);
      return;
    }

    const res = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    await runReceiptPipeline(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
  };

  const removeReceipt = () => {
    setReceiptUrl(null);
    setReceiptReportUrl(null);
    setReceiptMime(null);
    setReceiptName(null);
  };

  /** Saves as a scheduled transaction: nothing moves now, the server posts or reminds on the due dates. */
  const saveScheduled = async (value: number) => {
    setSaving(true);
    try {
      const created = await createScheduled(scheduledPayload({
        kind, category, title: description.trim() || t(`cat.${category}` as any), description: description.trim(),
        amount: value, walletId, date, rule, mode, timezone: deviceTimeZone(),
      }));
      const first = created.waiting[0]?.dueAt ?? created.nextDueAt ?? date.toISOString();
      Alert.alert(t('sched.savedTitle'), t('sched.savedMsg', {
        when: formatDate(first, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
      }), [{ text: t('rep.done'), onPress: leave }], { onDismiss: leave });
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave'));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const value = parseFloat(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return Alert.alert(t('add.amount'), t('add.errAmount'));

    if (scheduled) {
      if (scheduleStartError(date, rule)) return Alert.alert(t('sched.repeat'), t('sched.errPast'));
      if (receiptUrl) {
        // A schedule cannot carry a receipt, so say so instead of dropping it silently.
        return Alert.alert(t('sched.receiptDropTitle'), t('sched.receiptDropMsg'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('sched.continue'), onPress: () => { void saveScheduled(value); } },
        ]);
      }
      return saveScheduled(value);
    }

    setSaving(true);
    try {
      await createTransaction({
        type: kind,
        category,
        title: description.trim() || t(`cat.${category}` as any),
        description: description.trim() || undefined,
        amount: value,
        date: date.toISOString(),
        walletId: potId ? undefined : walletId ?? undefined,
        fundedByDebtId: potId ?? undefined,
        receiptUrl: receiptUrl ?? undefined,
        receiptReportUrl: receiptReportUrl ?? undefined,
      });
      leave();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave'));
    } finally {
      setSaving(false);
    }
  };

  const receiptIsImage = !receiptMime || receiptMime.startsWith('image/');
  const receiptPreview = receiptUrl
    ? (/^https?:/.test(receiptUrl) ? receiptUrl : `${ENV.UPLOADS_URL}/${receiptUrl}`)
    : null;

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <DatePickerModal
        visible={pickDate}
        title={t('add.date')}
        value={date}
        showTime
        onClose={() => setPickDate(false)}
        onConfirm={d => { setDate(d); setPickDate(false); }}
      />

      <RepeatSheet visible={pickRepeat} start={date} value={rule} onClose={() => setPickRepeat(false)}
                   onConfirm={r => { setRule(r); setPickRepeat(false); }} />

      <View style={s.header}>
        <TouchableOpacity style={[s.round, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={leave} hitSlop={6}>
          <MaterialIcons name="close" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>{t(scheduled ? 'sched.newTitle' : 'add.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Expense / Income */}
          <View style={[s.kinds, { backgroundColor: theme.inputBg }]}>
            {KINDS.map(k => {
              const on = kind === k.id;
              const c = k.id === 'INCOME' ? '#16A34A' : theme.primary;
              return (
                <TouchableOpacity key={k.id} onPress={() => switchKind(k.id)} activeOpacity={0.85}
                                  style={[s.kind, on && { backgroundColor: theme.surface }]}>
                  <MaterialIcons name={k.icon} size={14} color={on ? c : theme.textMuted} />
                  <Text style={[s.kindText, { color: on ? c : theme.textMuted }]}>{t(k.label)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Amount */}
          <View style={[s.amountBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[s.amountCur, { color: theme.textMuted }]}>{currencyByCode(currency).symbol}</Text>
            <TextInput
              value={amount}
              onChangeText={v => setAmount(v.replace(/[^\d.,]/g, ''))}
              placeholder="0"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              style={[s.amountInput, { color: accent }]}
            />
            <Text style={[s.amountCode, { color: theme.textMuted }]}>{currency}</Text>
          </View>

          {/* Category */}
          <Label text={t('add.category')} />
          <View style={s.catGrid}>
            {visibleCats.map(c => {
              const on = c.id === category;
              return (
                <TouchableOpacity key={c.id} onPress={() => setCategory(c.id)} activeOpacity={0.8}
                                  style={[s.cat, { borderColor: on ? c.color : theme.border, backgroundColor: on ? `${c.color}1A` : theme.surface }]}>
                  <MaterialIcons name={c.icon} size={15} color={c.color} />
                  <Text style={[s.catText, { color: on ? theme.text : theme.textSecondary, fontWeight: on ? '700' : '500' }]} numberOfLines={1}>
                    {t(`cat.${c.id}` as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {cats.length > COLLAPSED && (
              <TouchableOpacity onPress={() => setShowAllCats(v => !v)} activeOpacity={0.8}
                                style={[s.cat, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <MaterialIcons name={showAllCats ? 'expand-less' : 'apps'} size={15} color={theme.primary} />
                <Text style={[s.catText, { color: theme.primary, fontWeight: '700' }]}>{showAllCats ? '−' : `+${cats.length - visibleCats.length}`}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Description */}
          <Label text={t('add.description')} />
          <View style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="notes" size={16} color={theme.textMuted} />
            <TextInput value={description} onChangeText={setDescription} placeholder={t('add.descriptionPh')}
                       placeholderTextColor={theme.textMuted} style={[s.inputText, { color: theme.text, flex: 1 }]} />
          </View>

          {/* Wallet */}
          <Label text={t('add.wallet')} />
          <WalletChips wallets={wallets} value={potId ? null : walletId} onChange={id => { setPotId(null); setWalletId(id); }} noneLabel={wallets.length ? undefined : t('add.noWallet')} />
          {kind === 'EXPENSE' && !rule && pots.length > 0 && (
            <>
              <Label text={t('debt2.paidFrom')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {pots.map(p => {
                  const on = p.id === potId;
                  return (
                    <TouchableOpacity key={p.id} testID="pot-chip" onPress={() => setPotId(on ? null : p.id)} activeOpacity={0.8}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryBg : theme.surface }}>
                      <Text style={{ color: theme.text, fontWeight: '600' }}>{p.person}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{(p.unspent ?? 0).toLocaleString('en-US')} {p.currency} {t('debt2.unspentLeft')}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* Date */}
          <Label text={t('add.date')} />
          <TouchableOpacity style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]} onPress={() => setPickDate(true)} activeOpacity={0.8}>
            <MaterialIcons name="calendar-today" size={15} color={theme.textMuted} />
            <Text style={[s.inputText, { color: theme.text, flex: 1 }]}>
              {formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={theme.textMuted} />
          </TouchableOpacity>

          {/* Repeat (transactions only) */}
          <Label text={t('sched.repeat')} />
          <RepeatRow start={date} rule={rule} onPress={() => setPickRepeat(true)} />

          {scheduled && (
            <>
              <Label text={t('sched.whenDue')} />
              <ModeChoice value={mode} onChange={setMode} />
            </>
          )}

          {/* Receipt */}
          <Label text={`${t('add.receipt')} (${t('add.optional')})`} />
          {analyzingReceipt && (
            <View style={[s.analyzingRow, { backgroundColor: theme.inputBg }]}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[s.analyzingText, { color: theme.textSecondary }]}>{t('add.analyzing')}</Text>
            </View>
          )}
          {receiptUrl ? (
            <View style={[s.receipt, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              {receiptIsImage ? (
                <Image source={{ uri: receiptPreview! }} style={s.receiptImg} />
              ) : (
                <View style={[s.receiptFileIcon, { backgroundColor: theme.inputBg }]}>
                  <MaterialIcons name="description" size={26} color={theme.primary} />
                </View>
              )}
              <View style={{ flex: 1, gap: 6 }}>
                {!receiptIsImage && receiptName && (
                  <Text style={[s.receiptFileName, { color: theme.text }]} numberOfLines={1}>{receiptName}</Text>
                )}
                <TouchableOpacity onPress={() => pickReceipt('camera')} style={s.receiptAction} disabled={analyzingReceipt}>
                  <MaterialIcons name="photo-camera" size={15} color={theme.primary} />
                  <Text style={[s.receiptActionText, { color: theme.primary }]}>{t('add.takePhoto')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => pickReceipt('file')} style={s.receiptAction} disabled={analyzingReceipt}>
                  <MaterialIcons name="insert-drive-file" size={15} color={theme.primary} />
                  <Text style={[s.receiptActionText, { color: theme.primary }]}>{t('add.chooseFile')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/(dashboard)/scan')} style={s.receiptAction} disabled={analyzingReceipt}>
                  <MaterialIcons name="document-scanner" size={15} color={theme.primary} />
                  <Text style={[s.receiptActionText, { color: theme.primary }]}>{t('add.scanReceipt')}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={removeReceipt} hitSlop={8} style={[s.removeBtn, { backgroundColor: theme.inputBg }]} disabled={analyzingReceipt}>
                <MaterialIcons name="delete-outline" size={17} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity onPress={() => router.push('/(dashboard)/scan')} activeOpacity={0.85} disabled={analyzingReceipt}
                                style={[s.scanBtn, { backgroundColor: theme.primary, opacity: analyzingReceipt ? 0.6 : 1 }]}>
                <MaterialIcons name="document-scanner" size={18} color="#fff" />
                <Text style={s.scanBtnText}>{t('add.scanReceipt')}</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => pickReceipt('camera')} activeOpacity={0.8} disabled={analyzingReceipt}
                                  style={[s.receiptBtn, { borderColor: theme.border, backgroundColor: theme.surface, opacity: analyzingReceipt ? 0.6 : 1 }]}>
                  <MaterialIcons name="photo-camera" size={18} color={theme.primary} />
                  <Text style={[s.receiptBtnText, { color: theme.text }]}>{t('add.takePhoto')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => pickReceipt('file')} activeOpacity={0.8} disabled={analyzingReceipt}
                                  style={[s.receiptBtn, { borderColor: theme.border, backgroundColor: theme.surface, opacity: analyzingReceipt ? 0.6 : 1 }]}>
                  <MaterialIcons name="insert-drive-file" size={18} color={theme.primary} />
                  <Text style={[s.receiptBtnText, { color: theme.text }]}>{t('add.chooseFile')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>

        <View style={[s.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <TouchableOpacity style={[s.save, { backgroundColor: accent }]} onPress={save} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.saveText}>{t(scheduled ? scheduleSaveLabel(rule) : 'add.save')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ text }: { text: string }) {
  const theme = useAppTheme();
  return <Text style={[s.label, { color: theme.textSecondary }]}>{text}</Text>;
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  round:  { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:  { fontSize: 15, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },

  kinds:    { flexDirection: 'row', borderRadius: 14, padding: 3 },
  kind:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 34, borderRadius: 11 },
  kindText: { fontSize: 12, fontWeight: '700' },

  amountBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, height: 58, marginTop: 12 },
  amountCur:   { fontSize: 14, fontWeight: '700' },
  amountInput: { flex: 1, fontSize: 24, fontWeight: '700', fontFamily: 'Poppins_700Bold', paddingVertical: 0 },
  amountCode:  { fontSize: 11, fontWeight: '700' },

  label: { fontSize: 11, fontWeight: '600', marginTop: 12, marginBottom: 5, marginLeft: 2 },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cat:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 32, borderRadius: 12, borderWidth: 1, maxWidth: '48%' },
  catText: { fontSize: 11 },

  input:     { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  inputText: { fontSize: 13, fontFamily: 'Poppins_400Regular', paddingVertical: 0 },

  scanBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, marginBottom: 8 },
  scanBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  analyzingRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  analyzingText: { fontSize: 12, fontWeight: '600' },

  receipt:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 8 },
  receiptImg: { width: 64, height: 64, borderRadius: 10 },
  receiptFileIcon: { width: 64, height: 64, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  receiptFileName: { fontSize: 12, fontWeight: '700' },
  receiptAction:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receiptActionText: { fontSize: 12, fontWeight: '600' },
  removeBtn:  { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  receiptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  receiptBtnText: { fontSize: 12, fontWeight: '600' },

  footer:   { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  save:     { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
