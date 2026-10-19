import React, { useState } from 'react';
import {
  Modal, View, TouchableOpacity, StyleSheet, TextInput, TextInputProps,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform, Modal as RNModal, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { createWallet, updateWallet, Wallet } from '@/services/wallet.service';
import { useCurrency, currencyByCode, formatMoney } from '@/context/currency-context';
import { useI18n } from '@/context/language-context';
import { CurrencyPicker } from '@/components/wallet/currency-picker';
import { BANKS, MOBILE_MONEY, KIND_META, WalletKind } from '@/constants/providers';
import { DEFAULT_CARD_THEME, cardTheme } from '@/constants/card-themes';
import { CardColorRow } from '@/components/wallet/card-color-picker';
import { COUNTRIES, Country, DEFAULT_COUNTRY_ISO, flagOf } from '@/components/auth/countries';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful create or save. */
  onCreated: () => void;
  /** When set, the form edits this wallet instead of creating one. */
  wallet?: Wallet | null;
}

const OTHER = '__other__';
const KIND_LABEL: Record<WalletKind, 'form.bank' | 'form.mobile' | 'form.cash'> = { bank: 'form.bank', mobile: 'form.mobile', cash: 'form.cash' };

const DEFAULT_COUNTRY = COUNTRIES.find(c => c.iso === DEFAULT_COUNTRY_ISO)!;

/** Split "+250788123456" into its country and local number (longest dial-code match). */
function splitPhone(full?: string | null): { country: Country; local: string } {
  const n = (full ?? '').replace(/[^\d+]/g, '');
  const match = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find(c => n.startsWith(c.dial));
  return match ? { country: match, local: n.slice(match.dial.length) } : { country: DEFAULT_COUNTRY, local: n.replace(/^\+/, '') };
}

const kindOf = (w: Wallet): WalletKind => (w.walletType === 'MOBILE_MONEY' ? 'mobile' : w.walletType === 'CASH' ? 'cash' : 'bank');

export function WalletFormModal(props: Props) {
  // Mount the body only while open, keyed by wallet, so its state starts fresh.
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      {props.visible && <FormBody key={props.wallet?.id ?? 'new'} {...props} />}
    </Modal>
  );
}

function FormBody({ onClose, onCreated, wallet }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { currency: mainCurrency } = useCurrency();
  const editing = !!wallet;

  // Initial values: the wallet being edited, or an empty bank wallet.
  const w = wallet ?? null;
  const k0: WalletKind = w ? kindOf(w) : 'bank';
  const list0 = k0 === 'bank' ? BANKS : MOBILE_MONEY;

  const [kind, setKind]           = useState<WalletKind>(k0);
  const [provider, setProvider]   = useState<string>(w && k0 !== 'cash' ? (list0.includes(w.bank) ? w.bank : OTHER) : '');
  const [customName, setCustomName] = useState(w && k0 !== 'cash' && !list0.includes(w.bank) ? w.bank : '');
  const [holder, setHolder]       = useState(w?.accountHolder ?? '');
  const [number, setNumber]       = useState(w && k0 === 'bank' ? w.accountNumber ?? '' : '');
  const phone0 = splitPhone(w && k0 === 'mobile' ? w.accountNumber : null);
  const [country, setCountry]     = useState<Country>(phone0.country);
  const [phone, setPhone]         = useState(phone0.local);
  const [typeOpen, setTypeOpen]   = useState(false);
  const [pickCountry, setPickCountry] = useState(false);
  const [balance, setBalance]     = useState('');
  const [currency, setCurrency]   = useState(w?.currency ?? mainCurrency.code);
  const [color, setColor]         = useState(w ? cardTheme(w.color).id : DEFAULT_CARD_THEME.id);
  const [pickCurrency, setPickCurrency] = useState(false);
  const [saving, setSaving]       = useState(false);

  const providers = kind === 'bank' ? BANKS : MOBILE_MONEY;
  const providerName = provider === OTHER ? customName.trim() : provider;
  const switchKind = (k: WalletKind) => { setKind(k); setProvider(''); setCustomName(''); setTypeOpen(false); };

  const save = async () => {
    const digits = (kind === 'mobile' ? phone : number).replace(/\D/g, '');
    const req = t('form.required');
    if (kind !== 'cash') {
      if (!providerName) return Alert.alert(req, t(kind === 'bank' ? 'form.errBank' : 'form.errProvider'));
      if (!holder.trim()) return Alert.alert(req, t(kind === 'bank' ? 'form.errHolder' : 'form.errRegName'));
      if (kind === 'bank' && digits.length < 4) return Alert.alert(req, t('form.errAccount'));
      if (kind === 'mobile' && digits.length < 6) return Alert.alert(req, t('form.errPhone'));
    }
    // No nickname: wallets are named after their bank / provider (or "Cash").
    const name = kind === 'cash' ? t('form.cash') : providerName;
    const details = {
      name,
      bank: kind === 'cash' ? 'Cash' : providerName,
      walletType: KIND_META[kind].walletType,
      color,
      accountHolder: kind === 'cash' ? '' : holder.trim(),
      accountNumber: kind === 'cash' ? '' : kind === 'mobile' ? `${country.dial}${digits.replace(/^0+/, '')}` : digits,
    };

    setSaving(true);
    try {
      if (wallet) await updateWallet(wallet.id, details);
      else await createWallet({ ...details, currency, balance: balance ? parseFloat(balance) : 0 });
      onCreated();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.message || t('form.errSave'));
    } finally {
      setSaving(false);
    }
  };

  const cur = currencyByCode(currency);

  return (
    <>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 14 }]}>
          <View style={[s.grabber, { backgroundColor: theme.border }]} />
          <View style={s.head}>
            <Text style={[s.title, { color: theme.text }]}>{t(editing ? 'form.editWallet' : 'form.newWallet')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><MaterialIcons name="close" size={20} color={theme.textMuted} /></TouchableOpacity>
          </View>

          {/* Account type (dropdown) */}
          <Label text={t('form.accountType')} first />
          <TouchableOpacity style={[s.input, { backgroundColor: theme.inputBg, borderColor: typeOpen ? theme.primary : theme.border }]}
                            onPress={() => setTypeOpen(o => !o)} activeOpacity={0.8}>
            <MaterialIcons name={KIND_META[kind].icon} size={16} color={theme.primary} />
            <Text style={[s.inputText, { color: theme.text, flex: 1 }]}>{t(KIND_LABEL[kind])}</Text>
            <MaterialIcons name={typeOpen ? 'expand-less' : 'expand-more'} size={20} color={theme.textMuted} />
          </TouchableOpacity>
          {typeOpen && (
            <View style={[s.dropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {(Object.keys(KIND_META) as WalletKind[]).map((k, i) => {
                const on = kind === k;
                return (
                  <TouchableOpacity key={k} onPress={() => switchKind(k)} activeOpacity={0.7}
                                    style={[s.dropItem, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, on && { backgroundColor: theme.primaryBg }]}>
                    <MaterialIcons name={KIND_META[k].icon} size={16} color={on ? theme.primary : theme.textSecondary} />
                    <Text style={[s.dropText, { color: on ? theme.primary : theme.text }]}>{t(KIND_LABEL[k])}</Text>
                    {on && <MaterialIcons name="check" size={16} color={theme.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {kind !== 'cash' && (
              <>
                <Label text={t(kind === 'bank' ? 'form.bank' : 'form.provider')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 2 }} contentContainerStyle={s.chips}>
                  {[...providers, OTHER].map(p => {
                    const on = provider === p;
                    return (
                      <TouchableOpacity key={p} onPress={() => setProvider(p)} activeOpacity={0.8}
                                        style={[s.chip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryBg : theme.background }]}>
                        {p === OTHER && <MaterialIcons name="edit" size={12} color={on ? theme.primary : theme.textSecondary} />}
                        <Text style={[s.chipText, { color: on ? theme.primary : theme.textSecondary }]}>{p === OTHER ? t('form.other') : p}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {provider === OTHER && (
                  <Field icon={kind === 'bank' ? 'account-balance' : 'phone-iphone'} value={customName} onChangeText={setCustomName}
                         placeholder={t(kind === 'bank' ? 'form.typeBank' : 'form.typeProvider')} autoCapitalize="words" />
                )}

                <Label text={t(kind === 'bank' ? 'form.holder' : 'form.regName')} />
                <Field icon="person-outline" value={holder} onChangeText={setHolder}
                       placeholder={t(kind === 'bank' ? 'form.holderPh' : 'form.regNamePh')} autoCapitalize="words" />

                {kind === 'bank' ? (
                  <>
                    <Label text={t('form.accountNumber')} />
                    <Field icon="tag" value={number} onChangeText={v => setNumber(v.replace(/[^\d\s-]/g, ''))}
                           placeholder="0001 2345 6789" keyboardType="number-pad" />
                  </>
                ) : (
                  <>
                    <Label text={t('form.momoNumber')} />
                    <View style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border, paddingLeft: 6 }]}>
                      <TouchableOpacity onPress={() => setPickCountry(true)} activeOpacity={0.75}
                                        style={[s.codeBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Text style={{ fontSize: 16 }}>{flagOf(country.iso)}</Text>
                        <Text style={[s.codeText, { color: theme.text }]}>{country.dial}</Text>
                        <MaterialIcons name="arrow-drop-down" size={18} color={theme.textMuted} />
                      </TouchableOpacity>
                      <TextInput value={phone} onChangeText={v => setPhone(v.replace(/[^\d\s]/g, ''))}
                                 placeholder="788 123 456" placeholderTextColor={theme.textMuted} keyboardType="phone-pad"
                                 style={[s.inputText, { color: theme.text, flex: 1 }]} />
                    </View>
                  </>
                )}
              </>
            )}


            {editing && wallet ? (
              <View style={[s.readOnly, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <Text style={{ fontSize: 15 }}>{cur.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.readOnlyValue, { color: theme.text }]}>{formatMoney(wallet.balance, wallet.currency)}</Text>
                  <Text style={[s.readOnlyNote, { color: theme.textMuted }]}>{t('form.balanceNote')}</Text>
                </View>
              </View>
            ) : (
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Label text={t('form.currency')} />
                  <TouchableOpacity style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
                                    onPress={() => setPickCurrency(true)} activeOpacity={0.75}>
                    <Text style={{ fontSize: 15 }}>{cur.flag}</Text>
                    <Text style={[s.inputText, { color: theme.text, flex: 1 }]}>{currency}</Text>
                    <MaterialIcons name="expand-more" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1.3 }}>
                  <Label text={t('form.balance')} />
                  <View style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                    <Text style={[s.prefix, { color: theme.textMuted }]}>{cur.symbol}</Text>
                    <TextInput value={balance} onChangeText={v => setBalance(v.replace(/[^\d.]/g, ''))} placeholder="0"
                               placeholderTextColor={theme.textMuted} keyboardType="decimal-pad"
                               style={[s.inputText, { color: theme.text, flex: 1 }]} />
                  </View>
                </View>
              </View>
            )}

            <Label text={t('form.cardColor')} />
            <CardColorRow value={color} onChange={setColor} />

            {!editing && <Text style={[s.hint, { color: theme.textMuted }]}>{t('form.notConnected')}</Text>}
          </ScrollView>

          <TouchableOpacity style={[s.save, { backgroundColor: theme.buttonBg }]} onPress={save} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.saveText}>{t(editing ? 'form.save' : 'form.create')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <CountryPicker visible={pickCountry} value={country} onSelect={c => { setCountry(c); setPickCountry(false); }} onClose={() => setPickCountry(false)} />
      <CurrencyPicker visible={pickCurrency} value={currency}
                      onSelect={c => { setCurrency(c.code); setPickCurrency(false); }}
                      onClose={() => setPickCurrency(false)} />
    </>
  );
}

function Label({ text, first }: { text: string; first?: boolean }) {
  const theme = useAppTheme();
  return <Text style={[s.label, { color: theme.textSecondary }, first && { marginTop: 0 }]}>{text}</Text>;
}

function CountryPicker({ visible, value, onSelect, onClose }: { visible: boolean; value: Country; onSelect: (c: Country) => void; onClose: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = query ? COUNTRIES.filter(c => c.name.toLowerCase().includes(query) || c.dial.includes(query)) : COUNTRIES;
  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.countrySheet, { backgroundColor: theme.surface }]}>
          <View style={s.head}>
            <Text style={[s.title, { color: theme.text }]}>{t('form.country')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><MaterialIcons name="close" size={20} color={theme.text} /></TouchableOpacity>
          </View>
          <View style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border, marginBottom: 6 }]}>
            <MaterialIcons name="search" size={17} color={theme.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder={t('form.searchCountry')} placeholderTextColor={theme.textMuted}
                       autoCorrect={false} style={[s.inputText, { color: theme.text, flex: 1 }]} />
          </View>
          <FlatList
            data={list}
            keyExtractor={c => c.iso}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => { onSelect(item); setQ(''); }} activeOpacity={0.7}
                                style={[s.countryRow, { borderBottomColor: theme.border }]}>
                <Text style={{ fontSize: 18 }}>{flagOf(item.iso)}</Text>
                <Text style={[s.countryName, { color: theme.text }]}>{item.name}</Text>
                <Text style={[s.countryDial, { color: theme.textSecondary }]}>{item.dial}</Text>
                {item.iso === value.iso && <MaterialIcons name="check-circle" size={16} color={theme.primary} style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </RNModal>
  );
}

function Field({ icon, ...props }: TextInputProps & { icon: React.ComponentProps<typeof MaterialIcons>['name'] }) {
  const theme = useAppTheme();
  return (
    <View style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
      <MaterialIcons name={icon} size={16} color={theme.textMuted} />
      <TextInput placeholderTextColor={theme.textMuted} autoCorrect={false} {...props} style={[s.inputText, { color: theme.text, flex: 1 }]} />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:    { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8, maxHeight: '90%' },
  grabber:  { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 8 },
  head:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title:    { fontSize: 16, fontWeight: '700' },


  label:    { fontSize: 11, fontWeight: '600', marginTop: 12, marginBottom: 5, marginLeft: 2 },
  dropdown: { borderRadius: 12, borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  dropItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 42 },
  dropText: { flex: 1, fontSize: 13, fontWeight: '600' },
  codeBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, borderRadius: 9, borderWidth: 1, paddingLeft: 7 },
  codeText: { fontSize: 12, fontWeight: '700' },
  countrySheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '75%' },
  countryRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1 },
  countryName:  { flex: 1, fontSize: 13 },
  countryDial:  { fontSize: 13 },
  chips:    { gap: 6, paddingRight: 8 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: '600' },

  input:     { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  inputText: { fontSize: 13, fontFamily: 'Poppins_400Regular', paddingVertical: 0 },
  prefix:    { fontSize: 12, fontWeight: '700' },
  row2:      { flexDirection: 'row', gap: 10 },
  readOnly:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12 },
  readOnlyValue: { fontSize: 14, fontWeight: '700' },
  readOnlyNote:  { fontSize: 10, marginTop: 2, lineHeight: 14 },
  hint:      { fontSize: 10, marginTop: 10, textAlign: 'center' },

  save:     { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
