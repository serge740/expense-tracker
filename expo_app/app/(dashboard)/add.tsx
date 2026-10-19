import React, { useState, useCallback, useEffect, ComponentProps } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar, TextInput, Image,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
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

const SUBCATEGORIES: Record<CategorySlug, string[]> = {
  food:          ['Restaurant', 'Fast Food', 'Coffee & Drinks', 'Bakery', 'Street Food'],
  transport:     ['Fuel / Gas', 'Bus / Train', 'Taxi / Uber', 'Parking', 'Car Maintenance'],
  shopping:      ['Clothing', 'Electronics', 'Home & Garden', 'Beauty', 'Books'],
  health:        ['Pharmacy', 'Doctor Visit', 'Gym', 'Supplements', 'Dental'],
  entertainment: ['Movies', 'Streaming', 'Games', 'Concert / Event', 'Sports'],
  travel:        ['Flights', 'Hotel', 'Car Rental', 'Tours', 'Visa / Fees'],
  groceries:     ['Supermarket', 'Fresh Produce', 'Bakery', 'Beverages', 'Household'],
  salary:        ['Monthly Salary', 'Freelance', 'Bonus', 'Commission', 'Other Income'],
  other:         ['Subscription', 'Gift', 'Charity', 'Education', 'Miscellaneous'],
};

export default function AddExpenseScreen() {
  const theme = useAppTheme();
  const { currency } = useCurrency();
  const sym = currency.symbol;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    amount?: string; merchant?: string; date?: string;
    type?: string; category?: string; description?: string;
    receiptUrl?: string;
  }>();

  const [step,             setStep]             = useState(1);
  const [receiptUrl,       setReceiptUrl]       = useState('');
  const [txType,           setTxType]           = useState<TransactionType>('EXPENSE');
  const [amount,           setAmount]           = useState('');
  const [selectedCat,      setSelectedCat]      = useState<CategorySlug>('food');
  const [selectedSubCat,   setSelectedSubCat]   = useState('');
  const [customSubCat,     setCustomSubCat]     = useState('');
  const [showCustomInput,  setShowCustomInput]  = useState(false);
  const [merchant,         setMerchant]         = useState('');
  const [wallets,          setWallets]          = useState<Wallet[]>([]);
  const [selectedWallet,   setSelectedWallet]   = useState<string | undefined>(undefined);
  const [saving,           setSaving]           = useState(false);
  const [selectedDate,     setSelectedDate]     = useState<Date>(new Date());
  const [showDatePicker,   setShowDatePicker]   = useState(false);

  useEffect(() => {
    if (params.amount || params.merchant || params.description || params.category) {
      if (params.amount)   setAmount(params.amount);
      if (params.type)     setTxType(params.type as TransactionType);
      if (params.category) {
        const cat = CATEGORIES.find(c => c.id === params.category);
        if (cat) setSelectedCat(cat.id);
      }
      setMerchant(params.description || params.merchant || '');
      if (params.date) {
        const d = new Date(params.date);
        if (!isNaN(d.getTime())) setSelectedDate(d);
      }
      setReceiptUrl(params.receiptUrl ?? '');
      // OCR pre-fill: skip category + sub-cat pickers
      if (params.amount && params.category) setStep(4);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.amount, params.category, params.date, params.description, params.merchant, params.type, params.receiptUrl]);

  const isIncome       = txType === 'INCOME';
  const accent         = isIncome ? '#22C55E' : theme.buttonBg;
  const selectedCatObj = CATEGORIES.find(c => c.id === selectedCat);
  const catColor       = CAT_COLORS[selectedCat];

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
    setStep(1); setTxType('EXPENSE'); setAmount('');
    setSelectedCat('food'); setSelectedSubCat(''); setCustomSubCat('');
    setShowCustomInput(false); setMerchant('');
    setSelectedDate(new Date()); setReceiptUrl(''); setSaving(false);
  };

  const handleSave = async () => {
    if (!merchant.trim()) {
      Alert.alert('Missing Description', 'Please enter a description for this transaction.');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }
    setSaving(true);
    try {
      await createTransaction({
        type: txType,
        category: selectedCat,
        title: merchant.trim(),
        subCategory: selectedSubCat || undefined,
        amount: parsedAmount,
        walletId: selectedWallet,
        date: selectedDate.toISOString(),
        receiptUrl: receiptUrl || undefined,
      });
      resetForm();
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubCatSelect = (sub: string) => {
    setSelectedSubCat(sub);
    setMerchant(sub);
    setShowCustomInput(false);
    setStep(4);
  };

  const handleCustomConfirm = () => {
    if (!customSubCat.trim()) return;
    setSelectedSubCat(customSubCat.trim());
    setMerchant(customSubCat.trim());
    setStep(4);
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

            {/* Step dots — 4 steps */}
            <View style={s.dotsRow}>
              {[1, 2, 3, 4].map(n => (
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

          {/* Step 1 header */}
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

          {/* Step 2 header — category */}
          {step === 2 && (
            <View style={s.stepHeadBlock}>
              <Text style={s.stepTitle}>Choose Category</Text>
              <Text style={s.stepSub}>What type of {isIncome ? 'income' : 'expense'} is this?</Text>
            </View>
          )}

          {/* Step 3 header — sub-category */}
          {step === 3 && (
            <View style={s.stepHeadBlock}>
              <View style={s.summaryRow}>
                <Text style={s.summaryAmt}>{sym}{amount}</Text>
                <View style={[s.summaryBadge, { backgroundColor: catColor + '33' }]}>
                  <MaterialIcons name={selectedCatObj?.icon ?? 'receipt'} size={13} color={catColor} />
                  <Text style={[s.summaryBadgeText, { color: catColor }]}>{selectedCatObj?.label}</Text>
                </View>
              </View>
              <Text style={s.stepSub}>What specifically did you spend on?</Text>
            </View>
          )}

          {/* Step 4 header — details */}
          {step === 4 && (
            <View style={s.stepHeadBlock}>
              <View style={s.summaryRow}>
                <Text style={s.summaryAmt}>{sym}{amount}</Text>
                <View style={[s.summaryBadge, { backgroundColor: catColor + '33' }]}>
                  <MaterialIcons name={selectedCatObj?.icon ?? 'receipt'} size={13} color={catColor} />
                  <Text style={[s.summaryBadgeText, { color: catColor }]}>{selectedCatObj?.label}</Text>
                </View>
              </View>
              <Text style={s.stepSub}>
                {selectedSubCat ? `${selectedSubCat} · ` : ''}Add a description so you remember this later
              </Text>
            </View>
          )}

        </SafeAreaView>
      </View>

      {/* ── Light body ── */}
      <View style={[s.body, { backgroundColor: theme.background }]}>

        {/* STEP 1 BODY */}
        {step === 1 && (
          <ScrollView
            contentContainerStyle={[s.step1Body, { paddingBottom: insets.bottom + 16 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={[s.continueBtn, { backgroundColor: accent }]}
              onPress={() => { if (validateAmount()) setStep(2); }}
              activeOpacity={0.85}
            >
              <Text style={s.continueBtnText}>Continue</Text>
              <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* STEP 2 BODY — Category grid */}
        {step === 2 && (
          <ScrollView
            contentContainerStyle={[s.catContainer, { paddingBottom: insets.bottom + 16 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.catGrid}>
              {CATEGORIES.map(cat => {
                const active = selectedCat === cat.id;
                const cc     = CAT_COLORS[cat.id];
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      s.catTile,
                      { backgroundColor: theme.surface, borderColor: active ? cc : theme.border },
                      active && { backgroundColor: cc + '15' },
                    ]}
                    onPress={() => {
                      setSelectedCat(cat.id);
                      setSelectedSubCat('');
                      setCustomSubCat('');
                      setShowCustomInput(false);
                      setStep(3);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.catIconBg, { backgroundColor: cc + '22' }]}>
                      <MaterialIcons name={cat.icon} size={26} color={cc} />
                    </View>
                    <Text style={[s.catTileLabel, { color: active ? cc : theme.text }]}>{cat.label}</Text>
                    {active && (
                      <View style={[s.catCheck, { backgroundColor: cc }]}>
                        <MaterialIcons name="check" size={10} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* STEP 3 BODY — Sub-category list */}
        {step === 3 && (
          <ScrollView
            contentContainerStyle={[s.subCatList, { paddingBottom: insets.bottom + 16 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {SUBCATEGORIES[selectedCat].map(sub => (
              <TouchableOpacity
                key={sub}
                style={[s.subCatChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => handleSubCatSelect(sub)}
                activeOpacity={0.7}
              >
                <View style={[s.subCatDot, { backgroundColor: catColor }]} />
                <Text style={[s.subCatLabel, { color: theme.text }]}>{sub}</Text>
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[
                s.subCatChip,
                {
                  backgroundColor: 'transparent',
                  borderColor: showCustomInput ? accent : theme.border,
                  borderStyle: 'dashed',
                },
              ]}
              onPress={() => setShowCustomInput(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="edit" size={16} color={accent} />
              <Text style={[s.subCatLabel, { color: accent }]}>Custom…</Text>
            </TouchableOpacity>

            {showCustomInput && (
              <View style={[s.customInputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <TextInput
                  style={[s.customInput, { color: theme.text }]}
                  value={customSubCat}
                  onChangeText={setCustomSubCat}
                  placeholder="Describe what you spent on…"
                  placeholderTextColor={theme.textMuted}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCustomConfirm}
                />
                <TouchableOpacity
                  style={[s.customConfirmBtn, { backgroundColor: accent }]}
                  onPress={handleCustomConfirm}
                  activeOpacity={0.85}
                >
                  <Text style={s.customConfirmText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {/* STEP 4 BODY — Description + wallet + date + save */}
        {step === 4 && (
          <ScrollView
            contentContainerStyle={[s.detailsContent, { paddingBottom: insets.bottom + 16 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {receiptUrl ? (
              <View style={[s.receiptThumb, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Image source={{ uri: receiptUrl }} style={s.receiptThumbImg} resizeMode="cover" />
                <View style={s.receiptThumbInfo}>
                  <Text style={[s.receiptThumbTitle, { color: theme.text }]}>Receipt attached</Text>
                  <Text style={[s.receiptThumbSub, { color: theme.textMuted }]}>Scanned & saved to server</Text>
                </View>
                <MaterialIcons name="check-circle" size={18} color="#4ADE80" />
              </View>
            ) : null}

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
                        <Text style={[s.walletChipText, { color: active ? accent : theme.text }]} numberOfLines={1}>
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
                  <Text style={s.saveBtnText}>Saves {isIncome ? 'Income' : 'Expense'}</Text>
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

  dotsRow:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 22, borderRadius: 4 },

  typeRow:           { flexDirection: 'row', marginHorizontal: 20, marginTop: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', padding: 3 },
  typeBtn:           { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 18 },
  typeBtnActive:     { backgroundColor: 'rgba(255,255,255,0.2)' },
  typeBtnText:       { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  typeBtnTextActive: { color: '#FFFFFF' },

  amountBlock: { alignItems: 'center', paddingTop: 12, paddingBottom: 28 },
  amountCue:   { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.5, marginBottom: 8 },
  amountRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  amountSym:   { fontSize: 32, fontWeight: '600', marginBottom: 8 },
  amountInput: { fontSize: 72, fontWeight: '800', color: '#FFFFFF', minWidth: 100, maxWidth: 260 },

  stepHeadBlock:    { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 22 },
  stepTitle:        { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  stepSub:          { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  summaryRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  summaryAmt:       { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  summaryBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  summaryBadgeText: { fontSize: 13, fontWeight: '600' },

  body: { flex: 1 },

  step1Body:       { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 20 },
  continueBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingVertical: 17, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 5 },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  catContainer: { paddingHorizontal: 20, paddingTop: 20 },
  catGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  catTile:      { width: '30%', flexGrow: 1, borderRadius: 16, borderWidth: 1.5, paddingVertical: 16, alignItems: 'center', gap: 8, position: 'relative' },
  catIconBg:    { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  catTileLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  catCheck:     { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  subCatList:       { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  subCatChip:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 16 },
  subCatDot:        { width: 8, height: 8, borderRadius: 4 },
  subCatLabel:      { flex: 1, fontSize: 15, fontWeight: '600' },
  customInputRow:   { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  customInput:      { fontSize: 15, paddingVertical: 4 },
  customConfirmBtn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  customConfirmText:{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  detailsContent:    { paddingHorizontal: 20, paddingTop: 20 },
  receiptThumb:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 10, marginBottom: 20 },
  receiptThumbImg:   { width: 60, height: 60, borderRadius: 10 },
  receiptThumbInfo:  { flex: 1 },
  receiptThumbTitle: { fontSize: 13, fontWeight: '600' },
  receiptThumbSub:   { fontSize: 11, marginTop: 2 },
  fieldLabel:        { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8 },
  inputRow:          { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 54, marginBottom: 20 },
  textAreaRow:       { alignItems: 'flex-start', height: 90, paddingTop: 14, paddingBottom: 10 },
  inputIcon:         { marginRight: 10 },
  textInput:         { flex: 1, fontSize: 15 },
  textArea:          { height: 64, textAlignVertical: 'top' },

  walletScroll:        { marginBottom: 20 },
  walletScrollContent: { gap: 8 },
  walletChip:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  walletChipText:      { fontSize: 13, fontWeight: '600', maxWidth: 120 },

  dateRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 48, marginBottom: 24 },
  dateText: { fontSize: 14 },

  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingVertical: 17, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 5 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
