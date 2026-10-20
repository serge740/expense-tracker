import React, { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { DebtKind, getLedger, Ledger, LedgerCurrency } from '@/services/debt.service';

export const LEDGER_COLORS: Record<DebtKind, [string, string]> = {
  BORROWED: ['#B42318', '#E5484D'],
  LENT: ['#0F7A3E', '#2FB36B'],
};

/** The headline figure and detail line for one currency of a ledger. */
export function LedgerFigures({ ledger, hidden, light = true }: { ledger: Ledger | null; hidden: boolean; light?: boolean }) {
  const { t } = useI18n();
  const theme = useAppTheme();
  const fg = light ? '#FFFFFF' : theme.text;
  const rows: LedgerCurrency[] = ledger?.currencies ?? [];
  const lent = ledger?.kind === 'LENT';
  const main = rows[0];
  return (
    <View>
      {rows.length === 0 ? (
        <Text style={[s.big, { color: fg }]}>—</Text>
      ) : rows.map(r => (
        <Text key={r.currency} style={[s.big, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(r.remaining, r.currency, { hidden })}
        </Text>
      ))}
      <View style={s.stats}>
        <Stat label={t(lent ? 'debt2.lent' : 'debt2.taken')} value={main ? formatMoney(main.taken, main.currency, { hidden }) : '—'} fg={fg} />
        <Stat label={t(lent ? 'debt2.received' : 'debt2.paid')} value={main ? formatMoney(main.paid, main.currency, { hidden }) : '—'} fg={fg} />
        <Stat label={t('debt2.fullyPaid')} value={String(ledger?.settledCount ?? 0)} fg={fg} />
      </View>
    </View>
  );
}

function Stat({ label, value, fg }: { label: string; value: string; fg: string }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={[s.statLabel, { color: fg }]} numberOfLines={1}>{label}</Text>
      <Text style={[s.statValue, { color: fg }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function LedgerHero({ kind, ledger, hidden, onPress, showNote }: {
  kind: DebtKind; ledger: Ledger | null; hidden: boolean; onPress?: () => void; showNote?: boolean;
}) {
  const { t } = useI18n();
  const lent = kind === 'LENT';
  const body = (
    <LinearGradient colors={LEDGER_COLORS[kind]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.lock}>
        <MaterialIcons name="lock" size={10} color="#FFFFFF" />
        <Text style={s.lockText}>{t('debt2.system')}</Text>
      </View>
      <Text style={s.kicker}>{t(lent ? 'debt2.creditWallet' : 'debt2.debtWallet')} · {t(lent ? 'debt2.creditWalletSub' : 'debt2.debtWalletSub')}</Text>
      <LedgerFigures ledger={ledger} hidden={hidden} />
      {showNote && !lent && <Text style={s.note}>{t('debt2.cardNote')}</Text>}
    </LinearGradient>
  );
  return onPress ? (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} accessibilityRole="button"
                      accessibilityLabel={t(lent ? 'debt2.creditWallet' : 'debt2.debtWallet')}>{body}</TouchableOpacity>
  ) : body;
}

/** The two protected cards at the bottom of the Wallets tab. They are summaries, not real wallets. */
export function LedgerCards({ hidden }: { hidden: boolean }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [debt, setDebt] = useState<Ledger | null>(null);
  const [credit, setCredit] = useState<Ledger | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.all([getLedger('BORROWED'), getLedger('LENT')])
      .then(([d, c]) => { if (alive) { setDebt(d); setCredit(c); } })
      .catch(() => { /* keep last */ });
    return () => { alive = false; };
  }, []));

  const open = (kind: DebtKind) => router.push({ pathname: '/(dashboard)/debt-ledger' as any, params: { kind } });

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={[s.title, { color: theme.text }]}>{t('debt2.section')}</Text>
        <TouchableOpacity onPress={() => router.push('/(dashboard)/debts' as any)} hitSlop={8}>
          <Text style={[s.link, { color: theme.primary }]}>{t('debt2.manage')}</Text>
        </TouchableOpacity>
      </View>
      <LedgerHero kind="BORROWED" ledger={debt} hidden={hidden} onPress={() => open('BORROWED')} showNote />
      <View style={{ height: 10 }} />
      <LedgerHero kind="LENT" ledger={credit} hidden={hidden} onPress={() => open('LENT')} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { paddingHorizontal: 16, marginTop: 24 },
  head:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '700' },
  link:  { fontSize: 12, fontWeight: '600' },

  card:     { borderRadius: 22, padding: 16 },
  lock:     { position: 'absolute', right: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  lockText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  kicker:   { color: 'rgba(255,255,255,0.88)', fontSize: 11, marginRight: 70 },
  big:      { fontSize: 24, fontWeight: '800', marginTop: 2, marginBottom: 4 },
  stats:    { flexDirection: 'row', gap: 16, marginTop: 4 },
  statLabel:{ fontSize: 10.5, opacity: 0.85 },
  statValue:{ fontSize: 13, fontWeight: '700' },
  note:     { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, marginTop: 8 },
});
