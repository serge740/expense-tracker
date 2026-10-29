// Ported from expo_app/app/(dashboard)/transfer.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, Alert, ActivityIndicator, TextInput, Modal } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useLocalSearchParams, useFocusEffect } from '@/router/router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { getWallets, getTransferQuote, transferBetweenWallets, Wallet } from '@/services/wallet.service';
import { useScope } from '@/context/scope-context';
import { ViewerCannotAdd } from '@/components/family/scope-banner';
import { errorMessage } from '@/utils/family-errors';
import { formatMoney, currencyByCode, useCurrency } from '@/context/currency-context';
import { useI18n } from '@/context/language-context';
import { tint, WALLET_TYPE_ICON } from '@/components/wallet/wallet-card';
import { WalletFormModal } from '@/components/wallet-form-modal';
import { Converter } from '@/components/wallet/converter';
import { cardTheme } from '@/constants/card-themes';

type Mode = 'transfer' | 'exchange';
const ZERO_DECIMAL = new Set(['RWF', 'UGX', 'TZS', 'BIF', 'CDF', 'JPY', 'KES', 'NGN']);
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default function TransferScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { currency: mainCurrency } = useCurrency();
  const params = useLocalSearchParams<{ mode?: string; from?: string }>();

  const scope = useScope();
  const [mode, setMode]       = useState<Mode>('transfer');
  const [visit, setVisit]     = useState(0);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [fromId, setFromId]   = useState<string | null>(null);
  const [toId, setToId]       = useState<string | null>(null);
  const [amount, setAmount]   = useState('');
  const [note, setNote]       = useState('');
  const [liveRate, setLiveRate] = useState<{ pair: string; rate: number } | null>(null);
  const [customRate, setCustomRate] = useState('');
  const [useCustom, setUseCustom]   = useState(false);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);

  const loadWallets = useCallback(() =>
    getWallets().then(list => list.filter(w => !w.archived)).then(list => { setWallets(list); return list; }), []);

  // Fresh state each time the screen opens (it stays mounted as a hidden tab).
  useFocusEffect(useCallback(() => {
    loadWallets().then(list => {
      setMode(params.mode === 'exchange' ? 'exchange' : 'transfer');
      setVisit(v => v + 1);
      setAmount(''); setNote(''); setCustomRate(''); setUseCustom(false); setLiveRate(null);
      const start = list.find(w => w.id === params.from) ?? list.find(w => w.isDefault) ?? list[0];
      setFromId(start?.id ?? null);
      setToId(list.find(w => w.id !== start?.id)?.id ?? null);
    }).catch(() => {});
  }, [params.from, params.mode, loadWallets]));

  const from = wallets.find(w => w.id === fromId) ?? null;
  const to = wallets.find(w => w.id === toId) ?? null;
  const cross = !!from && !!to && from.currency !== to.currency;
  const value = parseFloat(amount) || 0;
  const pair = from && to ? `${from.currency}>${to.currency}` : '';

  // Moving money between wallets in different currencies converts at the live rate.
  useEffect(() => {
    if (!cross || !from || !to) return;
    const tm = setTimeout(() => {
      getTransferQuote(from.id, to.id, 1)
        .then(q => { if (q.rate) setLiveRate({ pair: `${from.currency}>${to.currency}`, rate: q.rate }); })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(tm);
  }, [cross, from, to]);

  const live = liveRate && liveRate.pair === pair ? liveRate.rate : 0;
  const rate = cross ? (useCustom ? parseFloat(customRate) || 0 : live) : 1;
  const receives = value * rate;
  const overBalance = !!from && from.walletType !== 'CREDIT' && value > from.balance;
  const canSend = !!from && !!to && value > 0 && (!cross || rate > 0) && !sending;

  const press = (k: string) => {
    if (!from) return;
    setAmount(prev => {
      if (k === '⌫') return prev.slice(0, -1);
      if (k === '.') return ZERO_DECIMAL.has(from.currency) || prev.includes('.') ? prev : (prev || '0') + '.';
      const next = prev === '0' ? k : prev + k;
      const [, dec] = next.split('.');
      if (dec && dec.length > 2) return prev;
      return next.length > 12 ? prev : next;
    });
  };

  const swap = () => {
    if (!from || !to) return;
    setFromId(to.id); setToId(from.id); setAmount(''); setUseCustom(false);
  };

  const pickWallet = (w: Wallet) => {
    if (picking === 'from') {
      setFromId(w.id);
      setAmount('');
      if (w.id === toId) setToId(wallets.find(x => x.id !== w.id)?.id ?? null);
    } else {
      setToId(w.id);
    }
    setPicking(null);
  };

  const send = async () => {
    if (!from || !to) return;
    setSending(true);
    try {
      const res = await transferBetweenWallets({
        fromWalletId: from.id,
        toWalletId: to.id,
        amount: value,
        ...(cross && useCustom ? { rate } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      Alert.alert(
        t(cross ? 'tx.exchangeComplete' : 'tx.complete'),
        `${formatMoney(res.amount, res.from)} · ${from.name}\n→ ${formatMoney(res.toAmount, res.to)} · ${to.name}`,
        [{ text: t('tx.done'), onPress: () => router.navigate('/(dashboard)/wallets') }],
      );
    } catch (e: any) {
      Alert.alert(t('tx.failed'), errorMessage(e, t('tx.retry'), t));
    } finally {
      setSending(false);
    }
  };

  const fromCur = from ? currencyByCode(from.currency) : null;
  const toCur = to ? currencyByCode(to.currency) : null;
  const startCurrency = wallets.find(w => w.id === params.from)?.currency ?? mainCurrency.code;

  // Moving money inside a family is for people who may add to it; a Viewer only looks.
  if (scope.isFamily && !scope.can('tx.add')) {
    return (
      <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
        <ViewerCannotAdd onClose={() => (router.canGoBack() ? router.back() : router.navigate('/(dashboard)/wallets'))} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <WalletFormModal visible={showForm} onClose={() => setShowForm(false)}
                       onCreated={() => { setShowForm(false); loadWallets(); }} />
      <WalletPicker
        visible={!!picking}
        title={t(picking === 'from' ? 'tx.sendFrom' : 'tx.sendTo')}
        wallets={wallets}
        selectedId={picking === 'from' ? fromId : toId}
        isDisabled={w => picking === 'to' && w.id === fromId}
        onPick={pickWallet}
        onClose={() => setPicking(null)}
      />

      {/* Header + mode switch */}
      <View style={s.header}>
        <TouchableOpacity style={[s.round, { backgroundColor: theme.surface, borderColor: theme.border }]}
                          onPress={() => router.navigate('/(dashboard)/wallets')} hitSlop={6}>
          <MaterialIcons name="arrow-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <View style={[s.modeSwitch, { backgroundColor: theme.inputBg }]}>
          {(['transfer', 'exchange'] as Mode[]).map(m => (
            <TouchableOpacity key={m} onPress={() => setMode(m)} activeOpacity={0.85}
                              style={[s.modeItem, mode === m && { backgroundColor: theme.surface }]}>
              <MaterialIcons name={m === 'transfer' ? 'swap-horiz' : 'currency-exchange'} size={14} color={mode === m ? theme.primary : theme.textMuted} />
              <Text style={[s.modeText, { color: mode === m ? theme.primary : theme.textMuted }]}>{t(m === 'transfer' ? 'wallet.transfer' : 'wallet.exchange')}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {mode === 'exchange' ? (
        // Plain converter: any amount, any currencies — no wallet needed.
        <Converter key={`${visit}-${startCurrency}`} initialFrom={startCurrency}
                   initialTo={startCurrency === mainCurrency.code ? 'USD' : mainCurrency.code} />
      ) : wallets.length < 2 ? (
        <View style={s.emptyWrap}>
          <MaterialIcons name="account-balance-wallet" size={34} color={theme.textMuted} />
          <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t('tx.needTwo')}</Text>
          <TouchableOpacity style={[s.sendBtn, { backgroundColor: theme.buttonBg, alignSelf: 'stretch' }]} onPress={() => setShowForm(true)}>
            <Text style={s.sendText}>{t('wallet.addWallet')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* You send */}
            <View style={[s.box, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={s.boxHead}>
                <Text style={[s.boxLabel, { color: theme.textMuted }]}>{t('tx.youSend')}</Text>
                {from && (
                  <TouchableOpacity onPress={() => setAmount(from.balance > 0 ? String(from.balance) : '')} hitSlop={6}>
                    <Text style={[s.boxHint, { color: overBalance ? '#E5484D' : theme.textMuted }]}>
                      {t('tx.balance', { amount: formatMoney(from.balance, from.currency) })}{from.balance > 0 ? `  ·  ${t('tx.max')}` : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={s.boxBody}>
                <WalletChip wallet={from} placeholder={t('tx.choose')} onPress={() => setPicking('from')} />
                <Text style={[s.bigAmount, { color: value ? theme.text : theme.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
                  {amount || '0'}
                </Text>
              </View>
              {fromCur && <Text style={[s.curName, { color: theme.textMuted }]}>{fromCur.flag} {fromCur.name}</Text>}
            </View>

            <View style={s.swapRow}>
              <TouchableOpacity onPress={swap} disabled={!to} activeOpacity={0.8}
                                style={[s.swapBtn, { backgroundColor: theme.buttonBg, borderColor: theme.background }]}>
                <MaterialIcons name="swap-vert" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Arrives in */}
            <View style={[s.box, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: -14 }]}>
              <View style={s.boxHead}>
                <Text style={[s.boxLabel, { color: theme.textMuted }]}>{t('tx.arrivesIn')}</Text>
                {to && <Text style={[s.boxHint, { color: theme.textMuted }]}>{t('tx.balance', { amount: formatMoney(to.balance, to.currency) })}</Text>}
              </View>
              <View style={s.boxBody}>
                <WalletChip wallet={to} placeholder={t('tx.choose')} onPress={() => setPicking('to')} />
                <Text style={[s.bigAmount, { color: receives ? theme.text : theme.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
                  {to ? (receives ? receives.toLocaleString('en-US', { maximumFractionDigits: ZERO_DECIMAL.has(to.currency) ? 0 : 2 }) : '0') : '—'}
                </Text>
              </View>
              {toCur && <Text style={[s.curName, { color: theme.textMuted }]}>{toCur.flag} {toCur.name}</Text>}
            </View>

            {/* Rate when the wallets use different currencies */}
            {cross && from && to && (
              <View style={[s.rateCard, { backgroundColor: theme.primaryBg, borderColor: theme.border }]}>
                <View style={s.rateRow}>
                  <View style={[s.liveDot, { backgroundColor: useCustom ? '#F59E0B' : '#22C55E' }]} />
                  <Text style={[s.rateText, { color: theme.text }]}>
                    {rate > 0
                      ? `1 ${from.currency} = ${rate < 0.01 ? rate.toPrecision(3) : rate.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${to.currency}`
                      : t('tx.noRate')}
                  </Text>
                  <TouchableOpacity onPress={() => setUseCustom(v => !v)} hitSlop={6}>
                    <Text style={[s.rateLink, { color: theme.primary }]}>{t(useCustom ? 'tx.useLive' : 'tx.myRate')}</Text>
                  </TouchableOpacity>
                </View>
                {useCustom && (
                  <TextInput value={customRate} onChangeText={v => setCustomRate(v.replace(/[^\d.]/g, ''))}
                             placeholder={`1 ${from.currency} = ? ${to.currency}`} placeholderTextColor={theme.textMuted}
                             keyboardType="decimal-pad"
                             style={[s.rateInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
                )}
              </View>
            )}

            <TextInput value={note} onChangeText={setNote} placeholder={t('tx.note')} placeholderTextColor={theme.textMuted}
                       style={[s.note, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
          </ScrollView>

          {/* Keypad + send */}
          <View style={[s.keypadWrap, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <View style={s.keypad}>
              {KEYS.map(k => (
                <TouchableOpacity key={k} style={s.key} onPress={() => press(k)} activeOpacity={0.6}>
                  {k === '⌫'
                    ? <MaterialIcons name="backspace" size={20} color={theme.text} />
                    : <Text style={[s.keyText, { color: theme.text }]}>{k}</Text>}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[s.sendBtn, { backgroundColor: canSend ? theme.buttonBg : theme.textMuted }]}
                              onPress={send} disabled={!canSend} activeOpacity={0.85}>
              {sending ? <ActivityIndicator color="#FFFFFF" /> : (
                <Text style={s.sendText}>
                  {!to ? t('tx.chooseWallet') : t('tx.send', { amount: from ? formatMoney(value, from.currency) : '' })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function WalletChip({ wallet, onPress, placeholder }: { wallet: Wallet | null; onPress: () => void; placeholder: string }) {
  const theme = useAppTheme();
  const ct = wallet ? cardTheme(wallet.color) : null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
                      style={[s.chip, { backgroundColor: theme.isDark ? theme.inputBg : tint(ct?.accent ?? theme.primary, 0.9), borderColor: theme.border }]}>
      <View style={[s.chipIcon, { backgroundColor: ct?.gradient[0] ?? theme.primary }]}>
        <MaterialIcons name={wallet ? WALLET_TYPE_ICON[wallet.walletType] ?? 'account-balance-wallet' : 'add'} size={13} color="#FFFFFF" />
      </View>
      <View style={{ maxWidth: 120 }}>
        <Text style={[s.chipCode, { color: theme.text }]}>{wallet ? wallet.currency : placeholder}</Text>
        {wallet && <Text style={[s.chipName, { color: theme.textMuted }]} numberOfLines={1}>{wallet.name}</Text>}
      </View>
      <MaterialIcons name="expand-more" size={18} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

function WalletPicker({
  visible, title, wallets, selectedId, isDisabled, onPick, onClose,
}: {
  visible: boolean; title: string; wallets: Wallet[]; selectedId: string | null;
  isDisabled: (w: Wallet) => boolean; onPick: (w: Wallet) => void; onClose: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: theme.surface }]}>
          <View style={s.sheetHead}>
            <Text style={[s.sheetTitle, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><MaterialIcons name="close" size={20} color={theme.text} /></TouchableOpacity>
          </View>
          <ScrollView>
            {wallets.map(w => {
              const off = isDisabled(w);
              const sel = w.id === selectedId;
              const ct = cardTheme(w.color);
              return (
                <TouchableOpacity key={w.id} disabled={off} onPress={() => onPick(w)} activeOpacity={0.7}
                                  style={[s.pickRow, { borderColor: sel ? ct.accent : theme.border, opacity: off ? 0.4 : 1 }]}>
                  <View style={[s.pickIcon, { backgroundColor: ct.gradient[0] }]}>
                    <MaterialIcons name={WALLET_TYPE_ICON[w.walletType] ?? 'account-balance-wallet'} size={16} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.pickName, { color: theme.text }]}>{w.name}</Text>
                    <Text style={[s.pickSub, { color: theme.textMuted }]}>{currencyByCode(w.currency).flag} {w.currency} · {w.bank}</Text>
                  </View>
                  <Text style={[s.pickBal, { color: theme.text }]}>{formatMoney(w.balance, w.currency)}</Text>
                  {sel && <MaterialIcons name="check-circle" size={18} color={ct.accent} style={{ marginLeft: 6 }} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  round:  { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modeSwitch: { flexDirection: 'row', borderRadius: 16, padding: 3 },
  modeItem:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 32, borderRadius: 13 },
  modeText:   { fontSize: 12, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingBottom: 16 },

  box:      { borderRadius: 22, borderWidth: 1, padding: 14 },
  boxHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boxLabel: { fontSize: 11, fontWeight: '600' },
  boxHint:  { fontSize: 10 },
  boxBody:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  bigAmount:{ flex: 1, textAlign: 'right', fontSize: 28, fontWeight: '700' },
  curName:  { fontSize: 10, marginTop: 6 },

  chip:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: 1, paddingLeft: 6, paddingRight: 4, paddingVertical: 6 },
  chipIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  chipCode: { fontSize: 13, fontWeight: '700' },
  chipName: { fontSize: 9 },

  swapRow: { alignItems: 'center', zIndex: 2, marginTop: -10 },
  swapBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },

  rateCard:  { borderRadius: 16, borderWidth: 1, padding: 12, marginTop: 12, gap: 6 },
  rateRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot:   { width: 7, height: 7, borderRadius: 4 },
  rateText:  { flex: 1, fontSize: 12, fontWeight: '600' },
  rateLink:  { fontSize: 11, fontWeight: '700' },
  rateInput: { height: 38, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, fontFamily: 'Poppins_400Regular' },

  note: { height: 40, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, marginTop: 12, fontSize: 12, fontFamily: 'Poppins_400Regular' },

  keypadWrap: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  keypad:     { flexDirection: 'row', flexWrap: 'wrap' },
  key:        { width: '33.33%', height: 44, alignItems: 'center', justifyContent: 'center' },
  keyText:    { fontSize: 20, fontWeight: '600' },
  sendBtn:    { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  sendText:   { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 13, textAlign: 'center' },

  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '70%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sheetTitle:{ fontSize: 15, fontWeight: '700' },
  pickRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 16, padding: 10, marginBottom: 8 },
  pickIcon:  { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pickName:  { fontSize: 13, fontWeight: '600' },
  pickSub:   { fontSize: 11 },
  pickBal:   { fontSize: 12, fontWeight: '700' },
});
