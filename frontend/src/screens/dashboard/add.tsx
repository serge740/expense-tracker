// Ported from expo_app/app/(dashboard)/add.tsx
import React, { useCallback, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from '@/rn';
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
import { CategorySlug, canonicalCategory, categoryOf, categoryLabelKey } from '@/constants/categories';
import { CategorySheet } from '@/components/category-sheet';
import { useMySubCategories } from '@/hooks/use-my-subcategories';
import { DatePickerModal } from '@/components/date-picker-modal';
import { RepeatSheet } from '@/components/repeat-sheet';
import { ModeChoice, RepeatRow } from '@/components/schedule/schedule-fields';
import { createScheduled, ScheduleMode } from '@/services/scheduled.service';
import { RepeatRule, ruleProblem } from '@/utils/recurrence';
import { deviceTimeZone } from '@/utils/reminders';
import { isScheduledForm, scheduledPayload, scheduleSaveLabel, scheduleStartError } from '@/utils/schedule-form';
import { PayFromField } from '@/components/add/pay-from';
import { ReceiptField } from '@/components/add/receipt-field';
import { getDebts, Debt } from '@/services/debt.service';
import ENV from '@/env';
import { useScope } from '@/context/scope-context';
import { getMyAllowance, type MyAllowance } from '@/services/family-extras.service';
import { AddingToBanner, ViewerCannotAdd } from '@/components/family/scope-banner';
import { FamilyNote } from '@/components/family/family-screen';

type Kind = 'EXPENSE' | 'INCOME';
const KINDS: { id: Kind; icon: string; label: 'add.expense' | 'add.income' }[] = [
  { id: 'EXPENSE', icon: 'arrow-upward',   label: 'add.expense' },
  { id: 'INCOME',  icon: 'arrow-downward', label: 'add.income' },
];

/** A repeat rule sent in from a starter, only if it is a real one. */
function startRule(raw?: string): RepeatRule | null {
  if (!raw) return null;
  try { const r = JSON.parse(raw); return ruleProblem(r) ? null : (r as RepeatRule); } catch { return null; }
}

/**
 * The date a link asks for. A plain day (a scanned receipt says 2026-10-28) is that day on the person's own calendar at the current
 * time of day; reading it as UTC midnight shows the day before in some time zones. A full moment (duplicate, repeat) is used as it is.
 */
export function dateFromParam(raw?: string | null, now = new Date()): Date {
  if (!raw) return now;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (day) {
    const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), now.getHours(), now.getMinutes());
    // A day that does not exist (2026-02-30) or lies ahead of today is not trusted.
    if (d.getMonth() !== Number(day[2]) - 1) return now;
    return d.getTime() > now.getTime() ? now : d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? now : d;
}

export default function AddTransactionScreen() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { currency: mainCurrency } = useCurrency();
  const scope = useScope();
  const inFamily = scope.isFamily;
  const params = useLocalSearchParams<{
    type?: string; walletId?: string; amount?: string; category?: string;
    description?: string; merchant?: string; date?: string; currency?: string; receiptUrl?: string; receiptReportUrl?: string;
    // From the "Plan a schedule" starters on Home: a subcategory and a repeat rule (JSON) to start from.
    subCategory?: string; repeat?: string;
  }>();

  const [kind, setKind]           = useState<Kind>('EXPENSE');
  const [allowance, setAllowance]   = useState<MyAllowance | null>(null);
  const [amount, setAmount]       = useState('');
  const [category, setCategory]   = useState<CategorySlug>('food');
  const [subCategory, setSubCategory] = useState<string | null>(null);
  const [catOpen, setCatOpen]     = useState(false);
  const { mine, reload: reloadMine, forget } = useMySubCategories();
  const [description, setDescription] = useState('');
  const [wallets, setWallets]     = useState<Wallet[]>([]);
  const [walletId, setWalletId]   = useState<string | null>(null);
  const [pots, setPots]           = useState<Debt[]>([]);
  const [walletsReady, setWalletsReady] = useState(false);
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
    reloadMine();
    // Borrowed money (loans) is personal: it is never offered, nor even asked for, inside a family.
    if (inFamily) setPots([]);
    else getDebts().then(ds => setPots(ds.filter(d => d.kind === 'BORROWED' && d.status === 'OPEN' && !d.archived && (d.unspent ?? 0) > 0))).catch(() => setPots([]));
    getWallets().then(list => {
      const usable = list.filter(w => !w.archived);
      setWallets(usable);
      setWalletsReady(true);
      setKind(k);
      setAmount(params.amount ?? '');
      // A category sent in from another screen (the scanner, an older link) may be a retired name: it becomes its new home.
      const preset = params.category ? canonicalCategory(params.category) : null;
      const presetCat = preset && categoryOf(preset.id).for.includes(k) && preset.id !== 'loan' ? preset : null;
      setCategory(presetCat ? presetCat.id : k === 'INCOME' ? 'salary' : 'food');
      setSubCategory(params.subCategory ? params.subCategory.slice(0, 40) : presetCat?.sub ?? null);
      setRule(startRule(params.repeat));
      setDescription(params.description || params.merchant || '');
      setDate(dateFromParam(params.date));
      setReceiptUrl(params.receiptUrl || null);
      setReceiptReportUrl(params.receiptReportUrl || null);
      setReceiptMime(null);
      setReceiptName(null);
      const pre = usable.find(w => w.id === params.walletId) ?? (params.currency ? usable.find(w => w.currency === params.currency && w.isDefault) ?? usable.find(w => w.currency === params.currency) : undefined) ?? usable.find(w => w.isDefault) ?? usable[0];
      setWalletId(pre?.id ?? null);
    }).catch(() => { setWalletsReady(true); });
  }, [reloadMine, inFamily, params.type, params.walletId, params.amount, params.category, params.description, params.merchant, params.date, params.receiptUrl, params.receiptReportUrl, params.subCategory, params.repeat]));

  const wallet = wallets.find(w => w.id === walletId) ?? null;
  const currency = wallet?.currency ?? mainCurrency.code;
  const catDef = categoryOf(category);
  const catName = t(categoryLabelKey(category, kind) as any);
  const accent = kind === 'INCOME' ? '#16A34A' : theme.primary;
  // In a family only owners and admins schedule; for everyone else what is saved there is a real transaction, dated now or earlier.
  const canSchedule = !inFamily || scope.can('schedule.manage');
  const scheduled = canSchedule && isScheduledForm(date, rule);

  React.useEffect(() => {
    if (!inFamily || !scope.family) { setAllowance(null); return; }
    getMyAllowance(scope.family.id).then(setAllowance).catch(() => setAllowance(null));
  }, [inFamily, scope.family?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (potId && (kind !== 'EXPENSE' || scheduled)) setPotId(null);
  }, [potId, kind, scheduled]);

  const switchKind = (k: Kind) => {
    setKind(k);
    // Spending and income have different categories, so a change starts again from the first one.
    if (k !== kind) { setCategory(k === 'INCOME' ? 'salary' : 'food'); setSubCategory(null); }
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
      if (result.category && kind === 'EXPENSE') {
        const preset = canonicalCategory(result.category);
        if (categoryOf(preset.id).for.includes('EXPENSE') && preset.id !== 'loan') {
          setCategory(preset.id);
          setSubCategory(preset.sub ?? null);
        }
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
        kind, category, subCategory, title: description.trim() || subCategory || catName, description: description.trim(),
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
    if (inFamily && !scheduled && date.getTime() > Date.now() + 5 * 60_000) return Alert.alert(t('add.date'), t('family.add.noFuture'));

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
        subCategory: subCategory ?? undefined,
        title: description.trim() || subCategory || catName,
        description: description.trim() || undefined,
        amount: value,
        date: date.toISOString(),
        walletId: potId ? undefined : walletId ?? undefined,
        fundedByDebtId: potId ?? undefined,
        receiptUrl: receiptUrl ?? undefined,
        receiptReportUrl: receiptReportUrl ?? undefined,
      }).then((r: any) => { if (r?.pending) Alert.alert(t('appr.title'), t('appr.sent')); });
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

  // A Viewer can look at the family's money but not add to it (the server refuses too; this just explains it).
  if (inFamily && !scope.can('tx.add')) {
    return (
      <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
        <ViewerCannotAdd onClose={leave} />
      </SafeAreaView>
    );
  }

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

      <CategorySheet
        visible={catOpen} kind={kind} category={category} subCategory={subCategory} mine={mine} startOnSub={!!subCategory}
        onClose={() => setCatOpen(false)}
        onSelect={(c, sub) => { setCategory(c); setSubCategory(sub); setCatOpen(false); }}
        onForget={forget}
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
          <AddingToBanner />

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

          {inFamily && allowance && kind === 'EXPENSE' ? (
            <Text testID="allowance-line" style={{ color: Number(amount.replace(',', '.')) > allowance.left ? theme.negative : theme.textSecondary, fontSize: 12.5, marginTop: 6 }}>
              {Number(amount.replace(',', '.')) > allowance.left ? t('allow.over', { left: String(Math.max(0, Math.round(allowance.left))) }) : t('allow.left', { left: String(Math.round(allowance.left)) })}
            </Text>
          ) : null}

          {/* Category: one field; the sheet does the choosing (category first, then what it was) */}
          <Label text={t('add.category')} />
          <TouchableOpacity onPress={() => setCatOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('add.category')}
                            style={[s.catField, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
            <View style={[s.catTile, { backgroundColor: `${catDef.color}22` }]}>
              <MaterialIcons name={catDef.icon} size={19} color={catDef.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.catValue, { color: theme.text }]} numberOfLines={1}>
                {catName}{subCategory ? <Text style={{ color: theme.textMuted }}>{'  ›  '}</Text> : null}{subCategory ?? ''}
              </Text>
              <Text style={[s.catHint, { color: theme.textSecondary }]}>{subCategory ? t('catsheet.tapChange') : t('catsheet.addOptional')}</Text>
            </View>
            <MaterialIcons name="expand-more" size={22} color={theme.textMuted} />
          </TouchableOpacity>
          {/* Description */}
          <Label text={t('add.description')} />
          <View style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="notes" size={16} color={theme.textMuted} />
            <TextInput value={description} onChangeText={setDescription} placeholder={t('add.descriptionPh')}
                       placeholderTextColor={theme.textMuted} style={[s.inputText, { color: theme.text, flex: 1 }]} />
          </View>

          {/* Wallet: one field; its sheet lists the wallets and, for an expense, the loans to spend borrowed money from */}
          <Label text={t('add.wallet')} />
          <PayFromField wallets={wallets} loans={kind === 'EXPENSE' && !scheduled && !inFamily ? pots : []} walletId={walletId} loanId={potId}
                        onWallet={id => { setPotId(null); setWalletId(id); }} onLoan={id => setPotId(id)} />
          {inFamily && walletsReady && wallets.length === 0 ? <FamilyNote tone="warn" testID="family-no-wallet" text={t('family.add.noWallet')} /> : null}

          {/* Date */}
          <Label text={t('add.date')} />
          <TouchableOpacity style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]} onPress={() => setPickDate(true)} activeOpacity={0.8}>
            <MaterialIcons name="calendar-today" size={15} color={theme.textMuted} />
            <Text style={[s.inputText, { color: theme.text, flex: 1 }]}>
              {formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={theme.textMuted} />
          </TouchableOpacity>

          {/* Repeat (personal, or in a family for owners and admins) */}
          {canSchedule && (
            <>
              <Label text={t('sched.repeat')} />
              <RepeatRow start={date} rule={rule} onPress={() => setPickRepeat(true)} />
            </>
          )}

          {scheduled && (
            <>
              <Label text={t('sched.whenDue')} />
              <ModeChoice value={mode} onChange={setMode} />
            </>
          )}

          {/* Receipt: one field; its sheet has scan, photo and file (and remove when there is one) */}
          <Label text={`${t('add.receipt')} (${t('add.optional')})`} />
          <ReceiptField attached={!!receiptUrl} previewUri={receiptPreview} isImage={receiptIsImage} fileName={receiptName} analyzing={analyzingReceipt}
                        onScan={() => router.push('/(dashboard)/scan')} onCamera={() => pickReceipt('camera')} onFile={() => pickReceipt('file')} onRemove={removeReceipt} />
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

  catField: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  catTile:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catValue: { fontSize: 14, fontWeight: '600' },
  catHint:  { fontSize: 11, marginTop: 1 },

  input:     { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  inputText: { fontSize: 13, fontFamily: 'Poppins_400Regular', paddingVertical: 0 },




  footer:   { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  save:     { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
