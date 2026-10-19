import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { currencyByCode, formatMoney } from '@/context/currency-context';
import { getRates } from '@/services/wallet.service';
import { CurrencyPicker } from './currency-picker';
import { tint } from './wallet-card';

const ZERO_DECIMAL = new Set(['RWF', 'UGX', 'TZS', 'BIF', 'CDF', 'JPY', 'KES', 'NGN']);
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
const RATES_SHOWN = ['USD', 'EUR', 'GBP', 'KES', 'UGX', 'TZS', 'RWF', 'ZAR', 'AED', 'CNY', 'JPY', 'CAD'];

const fmtNum = (n: number, code: string) =>
  n.toLocaleString('en-US', { maximumFractionDigits: ZERO_DECIMAL.has(code) ? 0 : 2 });

/** Stand-alone currency converter: any amount, any pair, no wallet involved. */
export function Converter({ initialFrom = 'USD', initialTo = 'RWF' }: { initialFrom?: string; initialTo?: string }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [from, setFrom]     = useState(initialFrom);
  const [to, setTo]         = useState(initialFrom === initialTo ? (initialFrom === 'USD' ? 'EUR' : 'USD') : initialTo);
  const [amount, setAmount] = useState('100');
  const [pair, setPair]     = useState<{ key: string; rate: number } | null>(null);
  const [list, setList]     = useState<{ key: string; rates: Record<string, number> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [copied, setCopied] = useState(false);

  // Rate for the current pair: 1 `from` = rate `to`.
  useEffect(() => {
    let alive = true;
    getRates(to, [from])
      .then(r => { if (alive && r.rates[from]) { setPair({ key: `${from}>${to}`, rate: r.rates[from] }); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [from, to]);

  // Today's rates: 1 unit of each popular currency in `from`.
  useEffect(() => {
    let alive = true;
    getRates(from, RATES_SHOWN.filter(c => c !== from))
      .then(r => { if (alive) setList({ key: from, rates: r.rates }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [from]);

  useEffect(() => {
    if (!copied) return;
    const tm = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(tm);
  }, [copied]);

  const rate = pair?.key === `${from}>${to}` ? pair.rate : 0;
  const value = parseFloat(amount) || 0;
  const result = value * rate;
  const rates = list?.key === from ? list.rates : {};

  const press = (k: string) => setAmount(prev => {
    if (k === '⌫') return prev.slice(0, -1);
    if (k === '.') return prev.includes('.') ? prev : (prev || '0') + '.';
    const next = prev === '0' ? k : prev + k;
    const [, dec] = next.split('.');
    if (dec && dec.length > 2) return prev;
    return next.length > 12 ? prev : next;
  });

  const swap = () => { setFrom(to); setTo(from); };
  const fromCur = currencyByCode(from);
  const toCur = currencyByCode(to);

  return (
    <View style={{ flex: 1 }}>
      <CurrencyPicker visible={!!picking} value={picking === 'from' ? from : to}
                      onSelect={c => {
                        if (picking === 'from') { if (c.code === to) setTo(from); setFrom(c.code); }
                        else { if (c.code === from) setFrom(to); setTo(c.code); }
                        setPicking(null);
                      }}
                      onClose={() => setPicking(null)} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Amount */}
        <View style={[s.box, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[s.boxLabel, { color: theme.textMuted }]}>{t('conv.amount')}</Text>
          <View style={s.boxBody}>
            <CurrencyChip code={from} onPress={() => setPicking('from')} />
            <Text style={[s.big, { color: value ? theme.text : theme.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>{amount || '0'}</Text>
          </View>
          <Text style={[s.curName, { color: theme.textMuted }]}>{fromCur.flag} {fromCur.name}</Text>
        </View>

        <View style={s.swapRow}>
          <TouchableOpacity onPress={swap} activeOpacity={0.8} style={[s.swapBtn, { backgroundColor: theme.buttonBg, borderColor: theme.background }]}>
            <MaterialIcons name="swap-vert" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Result */}
        <View style={[s.box, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: -14 }]}>
          <View style={s.boxHead}>
            <Text style={[s.boxLabel, { color: theme.textMuted }]}>{t('conv.converted')}</Text>
            {rate > 0 && (
              <TouchableOpacity onPress={() => { Clipboard.setStringAsync(fmtNum(result, to)); setCopied(true); }} hitSlop={8} style={s.copy}>
                <MaterialIcons name={copied ? 'check' : 'content-copy'} size={13} color={theme.primary} />
                <Text style={[s.copyText, { color: theme.primary }]}>{t(copied ? 'conv.copied' : 'conv.copy')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={s.boxBody}>
            <CurrencyChip code={to} onPress={() => setPicking('to')} />
            <Text style={[s.big, { color: result ? theme.primary : theme.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
              {rate ? fmtNum(result, to) : '—'}
            </Text>
          </View>
          <Text style={[s.curName, { color: theme.textMuted }]}>{toCur.flag} {toCur.name}</Text>
        </View>

        {/* Rate both ways */}
        <View style={[s.rateCard, { backgroundColor: theme.primaryBg, borderColor: theme.border }]}>
          {rate > 0 ? (
            <>
              <View style={s.rateRow}>
                <View style={[s.liveDot, { backgroundColor: '#22C55E' }]} />
                <Text style={[s.rateText, { color: theme.text }]}>1 {from} = {rate < 0.01 ? rate.toPrecision(3) : rate.toLocaleString('en-US', { maximumFractionDigits: 4 })} {to}</Text>
              </View>
              <Text style={[s.rateInverse, { color: theme.textSecondary }]}>
                1 {to} = {(1 / rate).toLocaleString('en-US', { maximumFractionDigits: 4 })} {from}
              </Text>
              <Text style={[s.hint, { color: theme.textMuted }]}>{t('conv.hint')}</Text>
            </>
          ) : (
            <Text style={[s.rateText, { color: theme.textSecondary }]}>{failed ? t('conv.offline') : '…'}</Text>
          )}
        </View>

        {/* Today's rates */}
        {Object.keys(rates).length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: theme.text }]}>{t('tx.todaysRates', { cur: from })}</Text>
            <View style={[s.ratesCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {RATES_SHOWN.filter(c => rates[c] !== undefined).map((code, i) => {
                const c = currencyByCode(code);
                const on = code === to;
                return (
                  <TouchableOpacity key={code} onPress={() => setTo(code)} activeOpacity={0.7}
                                    style={[s.rateItem, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                    <Text style={s.flag}>{c.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.code, { color: theme.text }]}>{code}</Text>
                      <Text style={[s.name, { color: theme.textMuted }]}>{c.name}</Text>
                    </View>
                    <Text style={[s.value, { color: theme.text }]}>{formatMoney(rates[code], from)}</Text>
                    {on && <MaterialIcons name="check-circle" size={16} color={theme.primary} style={{ marginLeft: 6 }} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Keypad */}
      <View style={[s.keypadWrap, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <View style={s.keypad}>
          {KEYS.map(k => (
            <TouchableOpacity key={k} style={s.key} onPress={() => press(k)} onLongPress={() => k === '⌫' && setAmount('')} activeOpacity={0.6}>
              {k === '⌫'
                ? <MaterialIcons name="backspace" size={20} color={theme.text} />
                : <Text style={[s.keyText, { color: theme.text }]}>{k}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

function CurrencyChip({ code, onPress }: { code: string; onPress: () => void }) {
  const theme = useAppTheme();
  const c = currencyByCode(code);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
                      style={[s.chip, { backgroundColor: theme.isDark ? theme.inputBg : tint(theme.primary, 0.9), borderColor: theme.border }]}>
      <Text style={{ fontSize: 20 }}>{c.flag}</Text>
      <Text style={[s.chipCode, { color: theme.text }]}>{code}</Text>
      <MaterialIcons name="expand-more" size={18} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  scroll:  { paddingHorizontal: 16, paddingBottom: 16 },
  box:     { borderRadius: 22, borderWidth: 1, padding: 14 },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boxLabel:{ fontSize: 11, fontWeight: '600' },
  boxBody: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  big:     { flex: 1, textAlign: 'right', fontSize: 28, fontWeight: '700' },
  curName: { fontSize: 10, marginTop: 6 },
  copy:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyText:{ fontSize: 11, fontWeight: '700' },

  chip:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7 },
  chipCode: { fontSize: 14, fontWeight: '700' },

  swapRow: { alignItems: 'center', zIndex: 2, marginTop: -10 },
  swapBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },

  rateCard:    { borderRadius: 16, borderWidth: 1, padding: 12, marginTop: 12, gap: 4 },
  rateRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot:     { width: 7, height: 7, borderRadius: 4 },
  rateText:    { fontSize: 13, fontWeight: '700' },
  rateInverse: { fontSize: 12, marginLeft: 15 },
  hint:        { fontSize: 10, marginLeft: 15, marginTop: 2 },

  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  ratesCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  rateItem:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  flag:      { fontSize: 18 },
  code:      { fontSize: 12, fontWeight: '700' },
  name:      { fontSize: 10 },
  value:     { fontSize: 12, fontWeight: '600' },

  keypadWrap: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  keypad:     { flexDirection: 'row', flexWrap: 'wrap' },
  key:        { width: '33.33%', height: 46, alignItems: 'center', justifyContent: 'center' },
  keyText:    { fontSize: 20, fontWeight: '600' },
});
