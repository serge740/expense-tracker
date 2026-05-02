import React, { useState, useCallback, useEffect, ComponentProps } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar, TextInput,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { DatePickerModal } from '@/components/date-picker-modal';
import { Text } from '@/components/text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { createTransaction, CategorySlug, TransactionType } from '@/services/transaction.service';
import { getWallets, Wallet } from '@/services/wallet.service';
import { useCurrency } from '@/context/currency-context';

type IconName = ComponentProps<typeof MaterialIcons>['name'];
interface Category { id: CategorySlug; label: string; icon: IconName }

const CATEGORIES: Category[] = [
  { id: 'food',          label: 'Food',          icon: 'restaurant'          },
  { id: 'transport',     label: 'Transport',      icon: 'directions-car'      },
  { id: 'shopping',      label: 'Shopping',       icon: 'shopping-bag'        },
  { id: 'health',        label: 'Health',         icon: 'local-hospital'      },
  { id: 'entertainment', label: 'Entertainment',  icon: 'movie'               },
  { id: 'travel',        label: 'Travel',         icon: 'flight'              },
  { id: 'groceries',     label: 'Groceries',      icon: 'local-grocery-store' },
  { id: 'salary',        label: 'Salary',         icon: 'payments'            },
  { id: 'other',         label: 'Other',          icon: 'more-horiz'          },
];

const CAT_COLORS: Record<CategorySlug, string> = {
  food: '#FF8C42', transport: '#60A5FA', shopping: '#A78BFA',
  health: '#F472B6', entertainment: '#FBBF24', travel: '#7B7FD4',
  groceries: '#4ADE80', salary: '#34D399', other: '#94A3B8',
};

export default function AddExpenseScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ amount?: string; merchant?: string; date?: string; type?: string }>();

  const [step,           setStep]           = useState(1);
  const [txType,         setTxType]         = useState<TransactionType>((params.type as TransactionType) ?? 'EXPENSE');
  const [amount,         setAmount]         = useState(params.amount ?? '');
  const [selectedCat,    setSelectedCat]    = useState<CategorySlug>('food');
  const [merchant,       setMerchant]       = useState(params.merchant ?? '');
  const [wallets,        setWallets]        = useState<Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | undefined>(undefined);
  const [saving,         setSaving]         = useState(false);

  const isIncome   = txType === 'INCOME';
  const accent     = isIncome ? '#22C55E' : theme.buttonBg;
  const selectedCatObj = CATEGORIES.find(c => c.id === selectedCat);

  const [selectedDate,   setSelectedDate]   = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const dateLabel = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLabel = selectedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const loadWallets = useCallback(async () => {
    try {
      const list = await getWallets();
      setWallets(list);
      const def = list.find(w => w.isDefault) ?? list[0];
      if (def) setSelectedWallet(def.id);
    } catch {}
  }, []);

  useEffect(() => { loadWallets(); }, [loadWallets]);

  const goBack = () => {
    if (step > 1) setStep(s => s - 1);
    else router.back();
  };

  const validateAmount = () => {
    const n = parseFloat(amount);
    if (!amount || isNaN(n) || n <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return false;
    }
    return true;
  };

  const resetForm = () => {
    setStep(1);
    setTxType('EXPENSE');
    setAmount('');
    setSelectedCat('food');
    setMerchant('');
    setSaving(false);
  };

  const handleSave = async () => {
    if (!merchant.trim()) {
      Alert.alert('Missing Description', 'Please enter a description for this transaction.');
      return;
    }
    setSaving(true);
    try {
      await createTransaction({
        type: txType,
        category: selectedCat,
        title: merchant.trim(),
        amount: parseFloat(amount),
        walletId: selectedWallet,
        date: params.date ? new Date(params.date).toISOString() : selectedDate.toISOString(),
      });
      resetForm();
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: theme.headerBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />

      {/* ── Dark header ── */}
      <View style={[s.headerSection, { backgroundColor: theme.headerBg }]}>
        <SafeAreaView edges={['top']}>

          {/* Toolbar */}
          <View style={s.toolbar}>
            <TouchableOpacity
              style={[s.toolBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
              onPress={goBack}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Step dots */}
            <View style={s.dotsRow}>
              {[1, 2, 3].map(n => (
                <View
                  key={n}
                  style={[
                    s.dot,
                    { backgroundColor: n <= step ? accent : 'rgba(255,255,255,0.25)' },
                    n === step && s.dotActive,
                  ]}
                />
              ))}
            </View>

            {step === 1 ? (
              <TouchableOpacity
                style={[s.scanChip, { backgroundColor: 'rgba(255,255,255,0.14)' }]}
                onPress={() => router.push('/(dashboard)/scan')}
                activeOpacity={0.8}
              >
                <MaterialIcons name="document-scanner" size={14} color="#FFFFFF" />
                <Text style={s.scanText}>Scan</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 64 }} />
            )}
          </View>

          {/* ── Step 1 header: type toggle + big amount ── */}
          {step === 1 && (
            <>
              <View style={s.typeRow}>
                {(['EXPENSE', 'INCOME'] as TransactionType[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeBtn, txType === t && s.typeBtnActive]}
                    onPress={() => setTxType(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.typeBtnText, txType === t && s.typeBtnTextActive]}>
                      {t === 'EXPENSE' ? 'Expense' : 'Income'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.amountBlock}>
                <Text style={s.amountCue}>Enter amount</Text>
                <View style={s.amountRow}>
                  <Text style={[s.amountSym, { color: isIncome ? '#4ADE80' : 'rgba(255,255,255,0.7)' }]}>{sym}</Text>
                  <TextInput
                    style={s.amountInput}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    selectionColor="rgba(255,255,255,0.7)"
                    autoFocus
                  />
                </View>
              </View>
            </>
          )}

          {/* ── Step 2 header: category label ── */}
          {step === 2 && (
            <View style={s.stepHeadBlock}>
              <Text style={s.stepTitle}>Choose Category</Text>
              <Text style={s.stepSub}>What type of {isIncome ? 'income' : 'expense'} is this?</Text>
            </View>
          )}

          {/* ── Step 3 header: amount + category summary ── */}
          {step === 3 && (
            <View style={s.stepHeadBlock}>
              <View style={s.summaryRow}>
                <Text style={s.summaryAmt}>{sym}{amount}</Text>
                <View style={[s.summaryBadge, { backgroundColor: CAT_COLORS[selectedCat] + '33' }]}>
                  <MaterialIcons name={selectedCatObj?.icon ?? 'receipt'} size={13} color={CAT_COLORS[selectedCat]} />
                  <Text style={[s.summaryBadgeText, { color: CAT_COLORS[selectedCat] }]}>
                    {selectedCatObj?.label}
                  </Text>
                </View>
              </View>
              <Text style={s.stepSub}>Add a description so you remember this later</Text>
            </View>
          )}

        </SafeAreaView>
      </View>

      {/* ── Light body ── */}
      <View style={[s.body, { backgroundColor: theme.background }]}>

        {/* STEP 1 BODY — Continue button */}
        {step === 1 && (
          <View style={[s.step1Body, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={[s.continueBtn, { backgroundColor: accent }]}
              onPress={() => { if (validateAmount()) setStep(2); }}
              activeOpacity={0.85}
            >
              <Text style={s.continueBtnText}>Continue</Text>
              <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2 BODY — Category grid */}
        {step === 2 && (
          <ScrollView
            contentContainerStyle={[s.catContainer, { paddingBottom: insets.bottom + 16 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.catGrid}>
              {CATEGORIES.map(cat => {
                const active   = selectedCat === cat.id;
                const catColor = CAT_COLORS[cat.id];
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      s.catTile,
                      {
                        backgroundColor: theme.surface,
                        borderColor: active ? catColor : theme.border,
                      },
                      active && { backgroundColor: catColor + '15' },
                    ]}
                    onPress={() => { setSelectedCat(cat.id); setStep(3); }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.catIconBg, { backgroundColor: catColor + '22' }]}>
                      <MaterialIcons name={cat.icon} size={26} color={catColor} />
                    </View>
                    <Text style={[s.catTileLabel, { color: active ? catColor : theme.text }]}>
                      {cat.label}
                    </Text>
                    {active && (
                      <View style={[s.catCheck, { backgroundColor: catColor }]}>
                        <MaterialIcons name="check" size={10} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* STEP 3 BODY — Description + wallet + save */}
        {step === 3 && (
          <ScrollView
            contentContainerStyle={[s.detailsContent, { paddingBottom: insets.bottom + 16 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[s.fieldLabel, { color: theme.textMuted }]}>DESCRIPTION *</Text>
            <View style={[s.inputRow, s.textAreaRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <MaterialIcons name="receipt" size={18} color={theme.textMuted} style={[s.inputIcon, { marginTop: 4 }]} />
              <TextInput
                style={[s.textInput, s.textArea, { color: theme.text }]}
                value={merchant}
                onChangeText={setMerchant}
                placeholder="e.g. Lunch at KFC, Monthly salary…"
                placeholderTextColor={theme.textMuted}
                autoFocus
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                returnKeyType="default"
              />
            </View>

            {wallets.length > 0 && (
              <>
                <Text style={[s.fieldLabel, { color: theme.textMuted }]}>WALLET</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.walletScroll}
                  contentContainerStyle={s.walletScrollContent}
                >
                  {wallets.map(w => {
                    const active = selectedWallet === w.id;
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[
                          s.walletChip,
                          {
                            borderColor: active ? accent : theme.border,
                            backgroundColor: active ? accent + '18' : theme.surface,
                          },
                        ]}
                        onPress={() => setSelectedWallet(w.id)}
                        activeOpacity={0.75}
                      >
                        <MaterialIcons name="credit-card" size={14} color={active ? accent : theme.textMuted} />
                        <Text
                          style={[s.walletChipText, { color: active ? accent : theme.text }]}
                          numberOfLines={1}
                        >
                          {w.name}{w.last4 ? ` ···${w.last4}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Text style={[s.fieldLabel, { color: theme.textMuted }]}>DATE & TIME</Text>
            <TouchableOpacity
              style={[s.dateRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="calendar-today" size={15} color={theme.primary} />
              <Text style={[s.dateText, { color: theme.text }]}>{dateLabel}</Text>
              <Text style={[s.dateText, { color: theme.textSecondary, marginLeft: 8 }]}>{timeLabel}</Text>
              <MaterialIcons name="edit" size={14} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: accent }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="check" size={20} color="#FFFFFF" />
                  <Text style={s.saveBtnText}>Save {isIncome ? 'Income' : 'Expense'}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}

      </View>

      <DatePickerModal
        visible={showDatePicker}
        title="Select Date & Time"
        value={selectedDate}
        showTime
        onClose={() => setShowDatePicker(false)}
        onConfirm={(date) => { setSelectedDate(date); setShowDatePicker(false); }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  headerSection: { overflow: 'hidden' },

  toolbar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  toolBtn:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scanChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20 },
  scanText:   { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  dotsRow:    { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  dotActive:  { width: 22, borderRadius: 4 },

  typeRow:        { flexDirection: 'row', marginHorizontal: 20, marginTop: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', padding: 3 },
  typeBtn:        { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 18 },
  typeBtnActive:  { backgroundColor: 'rgba(255,255,255,0.2)' },
  typeBtnText:    { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  typeBtnTextActive: { color: '#FFFFFF' },

  amountBlock: { alignItems: 'center', paddingTop: 12, paddingBottom: 28 },
  amountCue:   { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5, marginBottom: 8 },
  amountRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  amountSym:   { fontSize: 32, fontWeight: '600', marginBottom: 8 },
  amountInput: { fontSize: 72, fontWeight: '800', color: '#FFFFFF', minWidth: 100, maxWidth: 260 },

  stepHeadBlock: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 22 },
  stepTitle:     { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  stepSub:       { fontSize: 13, color: 'rgba(255,255,255,0.55)' },

  summaryRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  summaryAmt:        { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  summaryBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  summaryBadgeText:  { fontSize: 13, fontWeight: '600' },

  body: { flex: 1 },

  // Step 1
  step1Body:    { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20 },
  continueBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingVertical: 17, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 5 },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Step 2
  catContainer: { paddingHorizontal: 20, paddingTop: 20 },
  catGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  catTile:      { width: '30%', flexGrow: 1, borderRadius: 16, borderWidth: 1.5, paddingVertical: 16, alignItems: 'center', gap: 8, position: 'relative' },
  catIconBg:    { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  catTileLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  catCheck:     { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Step 3
  detailsContent: { paddingHorizontal: 20, paddingTop: 20 },
  fieldLabel:     { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  inputRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 54, marginBottom: 20 },
  textAreaRow:    { alignItems: 'flex-start', height: 90, paddingTop: 14, paddingBottom: 10 },
  inputIcon:      { marginRight: 10 },
  textInput:      { flex: 1, fontSize: 15 },
  textArea:       { height: 64, textAlignVertical: 'top' },

  walletScroll:        { marginBottom: 20 },
  walletScrollContent: { gap: 8 },
  walletChip:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  walletChipText:      { fontSize: 13, fontWeight: '600', maxWidth: 120 },

  dateRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 48, marginBottom: 24 },
  dateText: { fontSize: 14 },

  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingVertical: 17, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 5 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
