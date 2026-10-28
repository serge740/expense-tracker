// Ported from expo_app/components/wallet/activity-row.tsx
import React from 'react';
import { View, StyleSheet } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMoney } from '@/context/currency-context';
import type { ActivityItem } from '@/services/wallet.service';
import { useI18n } from '@/context/language-context';
import { categoryOf } from '@/constants/categories';

/**
 * One activity line. `perspectiveWalletId` decides the sign of a transfer
 * (money out of that wallet is negative, into it positive).
 */
export function ActivityRow({ item, hidden, perspectiveWalletId }: { item: ActivityItem; hidden?: boolean; perspectiveWalletId?: string }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const isTransfer = item.type === 'TRANSFER' || item.type === 'DEBT';
  const isDebt = item.type === 'DEBT';
  const incoming = isTransfer ? perspectiveWalletId === item.toWallet?.id : item.type === 'INCOME';

  const amount = isTransfer && incoming ? item.toAmount ?? item.amount : item.amount;
  const currency = (isTransfer && incoming ? item.toWallet?.currency : item.wallet?.currency) ?? item.wallet?.currency ?? '';
  const signed = isTransfer && !perspectiveWalletId ? amount : incoming ? amount : -amount;

  const icon = isDebt ? 'handshake' : isTransfer ? (item.exchangeRate ? 'currency-exchange' : 'swap-horiz') : (item.category ? categoryOf(item.category).icon : 'receipt');
  const tileBg = isTransfer ? theme.primaryBg : incoming ? 'rgba(34,197,94,0.12)' : theme.isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F7';
  const tileFg = isTransfer ? theme.primary : incoming ? '#16A34A' : theme.textSecondary;
  const amountColor = isTransfer && !perspectiveWalletId ? theme.text : incoming ? '#16A34A' : theme.text;

  const when = new Date(item.date);
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sub = isDebt
    ? `${(item.wallet ?? item.toWallet)?.name ?? ''} · ${time}`
    : isTransfer
    ? `${item.wallet?.name ?? '—'} → ${item.toWallet?.name ?? t('activity.deletedWallet')}`
    : `${item.wallet?.name ?? t('activity.noWallet')} · ${time}`;

  return (
    <View style={s.row}>
      <View style={[s.tile, { backgroundColor: tileBg }]}>
        <MaterialIcons name={icon} size={18} color={tileFg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[s.sub, { color: theme.textMuted }]} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.amount, { color: amountColor }]}>
          {formatMoney(signed, currency, { hidden, sign: !isTransfer || !!perspectiveWalletId })}
        </Text>
        {isTransfer && item.exchangeRate && item.toWallet && !hidden ? (
          <Text style={[s.sub, { color: theme.textMuted }]}>→ {formatMoney(item.toAmount ?? 0, item.toWallet.currency)}</Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  tile:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:  { fontSize: 13, fontWeight: '600' },
  sub:    { fontSize: 11, marginTop: 1 },
  amount: { fontSize: 13, fontWeight: '700' },
});
