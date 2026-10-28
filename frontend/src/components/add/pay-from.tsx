// Ported from expo_app/components/add/pay-from.tsx
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { cardTheme } from '@/constants/card-themes';
import { WALLET_TYPE_ICON } from '@/components/wallet/wallet-card';
import { OWE } from '@/components/debt/tone-chip';
import { OptionRow, OptionSheet, SectionLabel, Tile } from '@/components/add/option-sheet';
import type { Wallet } from '@/services/wallet.service';
import type { Debt } from '@/services/debt.service';

interface Props {
  wallets: Wallet[];
  /** Open loans that still have borrowed money left to spend (an expense may be paid from them instead of a wallet). */
  loans: Debt[];
  walletId: string | null;
  loanId: string | null;
  onWallet: (id: string | null) => void;
  onLoan: (id: string) => void;
}

const walletSub = (w: Wallet) => `${w.currency}${w.last4 ? ` · •• ${w.last4}` : ''}`;

/**
 * One field for "where does the money come from": it shows the choice, and tapping it opens a bottom sheet with
 * the person's wallets and (for an expense) the loans they can spend borrowed money from.
 */
export function PayFromField({ wallets, loans, walletId, loanId, onWallet, onLoan }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const wallet = wallets.find(w => w.id === walletId) ?? null;
  const loan = loans.find(l => l.id === loanId) ?? null;
  const left = (l: Debt) => t('paysrc.loanSub', { amount: formatMoney(l.unspent ?? 0, l.currency) });

  const walletTile = (w: Wallet) => {
    const ct = cardTheme(w.color);
    return <Tile icon={WALLET_TYPE_ICON[w.walletType] ?? 'account-balance-wallet'} color="#FFFFFF" bg={ct.gradient[0]} />;
  };
  const loanTile = <Tile icon="handshake" color={OWE} bg={`${OWE}1A`} />;

  const shown = loan
    ? { tile: loanTile, title: loan.person, sub: left(loan) }
    : wallet
      ? { tile: walletTile(wallet), title: wallet.name, sub: walletSub(wallet) }
      : { tile: <Tile icon="block" color={theme.textMuted} bg={theme.inputBg} />, title: t('add.noWallet'), sub: undefined };

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('add.wallet')} testID="pay-from-field"
                        style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
        {shown.tile}
        <View style={{ flex: 1 }}>
          <Text style={[s.value, { color: theme.text }]} numberOfLines={1}>{shown.title}</Text>
          {shown.sub ? <Text style={[s.sub, { color: theme.textSecondary }]} numberOfLines={1}>{shown.sub}</Text> : null}
        </View>
        <MaterialIcons name="expand-more" size={22} color={theme.textMuted} />
      </TouchableOpacity>

      <OptionSheet visible={open} title={t(loans.length ? 'paysrc.title' : 'add.wallet')} onClose={() => setOpen(false)}>
        <SectionLabel text={t('paysrc.wallets')} />
        {wallets.length === 0 && (
          <OptionRow tile={<Tile icon="block" color={theme.textMuted} bg={theme.inputBg} />} title={t('add.noWallet')} selected={!loan}
                     onPress={() => { onWallet(null); setOpen(false); }} />
        )}
        {wallets.map(w => (
          <OptionRow key={w.id} testID="pay-from-wallet" tile={walletTile(w)} title={w.name} sub={walletSub(w)} selected={!loan && w.id === walletId}
                     onPress={() => { onWallet(w.id); setOpen(false); }} />
        ))}

        {loans.length > 0 && (
          <>
            <SectionLabel text={t('paysrc.loans')} />
            {loans.map(l => (
              <OptionRow key={l.id} testID="pay-from-loan" tile={loanTile} title={l.person} sub={left(l)} selected={l.id === loanId}
                         onPress={() => { onLoan(l.id); setOpen(false); }} />
            ))}
            <Text style={[s.note, { color: theme.textMuted }]}>{t('paysrc.loanNote')}</Text>
          </>
        )}
      </OptionSheet>
    </>
  );
}

const s = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  value: { fontSize: 14, fontWeight: '700' },
  sub:   { fontSize: 11, marginTop: 1 },
  note:  { fontSize: 11, lineHeight: 15, marginTop: 2, marginHorizontal: 2 },
});
