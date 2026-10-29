// Ported from expo_app/components/family/family-balance-card.tsx
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from '@/rn';
import { useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { formatMoney } from '@/context/currency-context';
import { getWalletOverview, type WalletOverview } from '@/services/wallet.service';

/**
 * "Family balance": every family wallet added up in the family's own currency. A wallet in a currency with no known rate
 * is not guessed at: its currency is listed separately underneath, as the Wallets screen already does.
 */
export function FamilyBalanceCard({ hidden = false }: { hidden?: boolean }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { family, isFamily } = useScope();
  const [overview, setOverview] = useState<WalletOverview | null>(null);
  const base = family?.currency ?? 'RWF';

  useFocusEffect(useCallback(() => {
    if (!isFamily) return;
    getWalletOverview(base).then(setOverview).catch(() => {});
  }, [isFamily, base]));

  if (!isFamily) return null;
  const separate = overview ? Object.entries(overview.byCurrency).filter(([code]) => overview.unconverted.includes(code)) : [];

  return (
    <View testID="family-balance" style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[s.label, { color: theme.textMuted }]}>{t('family.home.balance').toUpperCase()}</Text>
      {overview && overview.walletCount === 0 ? (
        <Text style={[s.empty, { color: theme.textSecondary }]}>{t('family.wallet.empty')}</Text>
      ) : (
        <Text testID="family-balance-amount" style={[s.amount, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {overview ? formatMoney(overview.total, base, { hidden }) : '…'}
        </Text>
      )}
      {separate.length > 0 ? (
        <View testID="family-balance-separate" style={{ marginTop: 6 }}>
          <Text style={[s.note, { color: theme.textMuted }]}>{t('family.home.unconverted')}</Text>
          {separate.map(([code, amount]) => <Text key={code} style={[s.note, { color: theme.textSecondary }]}>{formatMoney(amount, code, { hidden })}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderRadius: 18, padding: 14 },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  amount: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  empty: { fontSize: 13, marginTop: 4 },
  note: { fontSize: 11.5, marginTop: 2 },
});
