import React, { useCallback, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, TextInput, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { useI18n } from '@/context/language-context';
import { useCurrency, currencyByCode } from '@/context/currency-context';
import { createTransaction, uploadReceipt } from '@/services/transaction.service';
import { getWallets, Wallet } from '@/services/wallet.service';
import { CATEGORIES, CategorySlug, categoryOf } from '@/constants/categories';
import { DatePickerModal } from '@/components/date-picker-modal';
import { WalletChips } from '@/components/wallet/wallet-chips';
import ENV from '@/env';

type Kind = 'EXPENSE' | 'INCOME';
const KINDS: { id: Kind; icon: React.ComponentProps<typeof MaterialIcons>['name']; label: 'add.expense' | 'add.income' }[] = [
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
    description?: string; merchant?: string; date?: string; receiptUrl?: string;
  }>();

  const [kind, setKind]           = useState<Kind>('EXPENSE');
  const [amount, setAmount]       = useState('');
  const [category, setCategory]   = useState<CategorySlug>('food');
  const [showAllCats, setShowAllCats] = useState(false);
  const [description, setDescription] = useState('');
  const [wallets, setWallets]     = useState<Wallet[]>([]);
  const [walletId, setWalletId]   = useState<string | null>(null);
  const [date, setDate]           = useState(new Date());
  const [pickDate, setPickDate]   = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);

  // The screen stays mounted as a hidden tab: reset from params on every visit.
  useFocusEffect(useCallback(() => {
    const k: Kind = params.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
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
      setReceiptUri(params.receiptUrl || null);
      const pre = usable.find(w => w.id === params.walletId) ?? usable.find(w => w.isDefault) ?? usable[0];
      setWalletId(pre?.id ?? null);
    }).catch(() => {});
  }, [params.type, params.walletId, params.amount, params.category, params.description, params.merchant, params.date, params.receiptUrl]));

  const wallet = wallets.find(w => w.id === walletId) ?? null;
  const currency = wallet?.currency ?? mainCurrency.code;
  const cats = CATEGORIES.filter(c => !c.system && c.for.includes(kind));
  const visibleCats = showAllCats ? cats : (() => {
    const head = cats.slice(0, COLLAPSED);
    const sel = cats.find(c => c.id === category);
    return sel && !head.includes(sel) ? [...head.slice(0, COLLAPSED - 1), sel] : head;
  })();
  const accent = kind === 'INCOME' ? '#16A34A' : theme.primary;

  const switchKind = (k: Kind) => {
    setKind(k);
    if (!categoryOf(category).for.includes(k)) setCategory(k === 'INCOME' ? 'salary' : 'food');
  };

  const leave = () => {
    if (params.walletId) router.navigate('/(dashboard)/wallets');
    else if (router.canGoBack()) router.back();
    else router.navigate('/(dashboard)');
  };

  const pickReceipt = async (source: 'camera' | 'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('add.receipt'), t(source === 'camera' ? 'add.cameraPermission' : 'add.photoPermission'));
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: true };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setReceiptUri(res.assets[0].uri);
  };

  const save = async () => {
    const value = parseFloat(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return Alert.alert(t('add.amount'), t('add.errAmount'));

    setSaving(true);
    try {
      // Only local files need uploading; an existing server path is reused as-is.
      let receiptUrl: string | undefined;
      if (receiptUri) {
        if (/^(file|content|ph|assets-library):/.test(receiptUri)) {
          try { receiptUrl = await uploadReceipt(receiptUri); }
          catch { Alert.alert(t('add.receipt'), t('add.uploadFailed')); return; }
        } else {
          receiptUrl = receiptUri;
        }
      }
      await createTransaction({
        type: kind,
        category,
        title: description.trim() || t(`cat.${category}` as any),
        description: description.trim() || undefined,
        amount: value,
        date: date.toISOString(),
        walletId: walletId ?? undefined,
        receiptUrl,
      });
      leave();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave'));
    } finally {
      setSaving(false);
    }
  };

  const receiptPreview = receiptUri
    ? (/^(file|content|ph|assets-library|https?):/.test(receiptUri) ? receiptUri : `${ENV.UPLOADS_URL}/${receiptUri}`)
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

      <View style={s.header}>
        <TouchableOpacity style={[s.round, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={leave} hitSlop={6}>
          <MaterialIcons name="close" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>{t('add.title')}</Text>
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
          <WalletChips wallets={wallets} value={walletId} onChange={setWalletId} noneLabel={wallets.length ? undefined : t('add.noWallet')} />

          {/* Date */}
          <Label text={t('add.date')} />
          <TouchableOpacity style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]} onPress={() => setPickDate(true)} activeOpacity={0.8}>
            <MaterialIcons name="calendar-today" size={15} color={theme.textMuted} />
            <Text style={[s.inputText, { color: theme.text, flex: 1 }]}>
              {formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={theme.textMuted} />
          </TouchableOpacity>

          {/* Receipt */}
          <Label text={`${t('add.receipt')} (${t('add.optional')})`} />
          {receiptPreview ? (
            <View style={[s.receipt, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Image source={{ uri: receiptPreview }} style={s.receiptImg} />
              <View style={{ flex: 1, gap: 6 }}>
                <TouchableOpacity onPress={() => pickReceipt('camera')} style={s.receiptAction}>
                  <MaterialIcons name="photo-camera" size={15} color={theme.primary} />
                  <Text style={[s.receiptActionText, { color: theme.primary }]}>{t('add.takePhoto')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => pickReceipt('library')} style={s.receiptAction}>
                  <MaterialIcons name="photo-library" size={15} color={theme.primary} />
                  <Text style={[s.receiptActionText, { color: theme.primary }]}>{t('add.chooseImage')}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setReceiptUri(null)} hitSlop={8} style={[s.removeBtn, { backgroundColor: theme.inputBg }]}>
                <MaterialIcons name="delete-outline" size={17} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => pickReceipt('camera')} activeOpacity={0.8}
                                style={[s.receiptBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <MaterialIcons name="photo-camera" size={18} color={theme.primary} />
                <Text style={[s.receiptBtnText, { color: theme.text }]}>{t('add.takePhoto')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickReceipt('library')} activeOpacity={0.8}
                                style={[s.receiptBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <MaterialIcons name="photo-library" size={18} color={theme.primary} />
                <Text style={[s.receiptBtnText, { color: theme.text }]}>{t('add.chooseImage')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <View style={[s.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <TouchableOpacity style={[s.save, { backgroundColor: accent }]} onPress={save} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.saveText}>{t('add.save')}</Text>}
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

  receipt:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 8 },
  receiptImg: { width: 64, height: 64, borderRadius: 10 },
  receiptAction:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receiptActionText: { fontSize: 12, fontWeight: '600' },
  removeBtn:  { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  receiptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  receiptBtnText: { fontSize: 12, fontWeight: '600' },

  footer:   { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  save:     { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
