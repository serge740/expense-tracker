// Ported from expo_app/components/wallet/wallet-chips.tsx
import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { cardTheme } from '@/constants/card-themes';
import type { Wallet } from '@/services/wallet.service';
import { WALLET_TYPE_ICON } from './wallet-card';

/** Horizontal wallet picker: each chip shows the account's icon in its card colour. */
export function WalletChips({
  wallets, value, onChange, noneLabel,
}: { wallets: Wallet[]; value: string | null; onChange: (id: string | null) => void; noneLabel?: string }) {
  const theme = useAppTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} style={{ marginBottom: 2 }}>
      {noneLabel && (
        <TouchableOpacity onPress={() => onChange(null)} activeOpacity={0.8}
                          style={[s.chip, { borderColor: !value ? theme.primary : theme.border, backgroundColor: !value ? theme.primaryBg : theme.surface }]}>
          <View style={[s.icon, { backgroundColor: theme.inputBg }]}>
            <MaterialIcons name="block" size={14} color={theme.textMuted} />
          </View>
          <Text style={[s.name, { color: theme.textSecondary }]}>{noneLabel}</Text>
        </TouchableOpacity>
      )}
      {wallets.map(w => {
        const on = w.id === value;
        const ct = cardTheme(w.color);
        return (
          <TouchableOpacity key={w.id} onPress={() => onChange(w.id)} activeOpacity={0.8}
                            style={[s.chip, { borderColor: on ? ct.accent : theme.border, backgroundColor: on ? `${ct.accent}1A` : theme.surface }]}>
            <View style={[s.icon, { backgroundColor: ct.gradient[0] }]}>
              <MaterialIcons name={WALLET_TYPE_ICON[w.walletType] ?? 'account-balance-wallet'} size={14} color="#FFFFFF" />
            </View>
            <View>
              <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{w.name}</Text>
              <Text style={[s.cur, { color: theme.textMuted }]}>{w.currency}{w.last4 ? ` · •• ${w.last4}` : ''}</Text>
            </View>
            {on && <MaterialIcons name="check-circle" size={14} color={ct.accent} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row:  { gap: 6, paddingRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 44, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 8 },
  icon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 11, fontWeight: '700', maxWidth: 110 },
  cur:  { fontSize: 9 },
});
