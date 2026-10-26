// Ported from expo_app/components/wallet/wallet-hero-card.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from '@/rn';
import { LinearGradient } from '@/rn/gradient';
import Svg, { Path } from '@/rn/svg';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { formatMoney, currencyByCode } from '@/context/currency-context';
import type { Wallet } from '@/services/wallet.service';
import { WALLET_TYPE_ICON } from './wallet-card';
import { cardTheme } from '@/constants/card-themes';
import { useI18n } from '@/context/language-context';

/** "0001234567" → "•••• 4567"; phone numbers keep the country code. */
export function maskNumber(n: string | null) {
  if (!n) return '';
  const tail = n.replace(/\D/g, '').slice(-4);
  return n.startsWith('+') ? `${n.slice(0, 4)} ••• ${tail}` : `•••• ${tail}`;
}

type Props = {
  wallet: Wallet;
  hidden: boolean;
  onToggleHidden: () => void;
  /** Change since yesterday's close, in the wallet's currency. */
  dayChange?: number | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Big banner card for one wallet, in the wallet's own colour. */
export function WalletHeroCard({ wallet, hidden, onToggleHidden, dayChange, onPress, style }: Props) {
  const cur = currencyByCode(wallet.currency);
  const ct = cardTheme(wallet.color);
  const { t } = useI18n();

  const body = (
    <LinearGradient colors={ct.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, style]}>
      <View style={[s.glowA, { backgroundColor: ct.glow }]} />
      <View style={s.glowB} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} viewBox="0 0 340 200" preserveAspectRatio="none">
        {[0, 14, 28, 42].map(o => (
          <Path key={o} d={`M ${150 + o} 200 C ${190 + o} 135, ${240 + o} 165, ${260 + o} 90 S ${330 + o} 25, ${360 + o} -10`}
                stroke="rgba(255,255,255,0.07)" strokeWidth={1.2} fill="none" />
        ))}
      </Svg>

      <View style={s.top}>
        <View style={s.providerRow}>
          <View style={[s.providerIcon, { backgroundColor: ct.glow }]}>
            <MaterialIcons name={WALLET_TYPE_ICON[wallet.walletType] ?? 'account-balance-wallet'} size={15} color="#FFFFFF" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={s.providerName} numberOfLines={1}>{wallet.name}</Text>
            <Text style={s.providerType} numberOfLines={1}>
              {wallet.bank !== wallet.name ? `${wallet.bank} · ` : ''}{t(`wtype.${wallet.walletType}` as any)}
              {wallet.isDefault ? ` · ${t('wallet.defaultTag')}` : ''}{wallet.archived ? ` · ${t('wallet.archived')}` : ''}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onToggleHidden} hitSlop={10} style={s.eye}>
          <MaterialIcons name={hidden ? 'visibility-off' : 'visibility'} size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Text style={s.label}>{t('wallet.available')}</Text>
      <Text style={s.amount} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(wallet.balance, wallet.currency, { hidden })}</Text>

      <View style={s.bottom}>
        <View style={{ flex: 1 }}>
          <Text style={s.smallLabel} numberOfLines={1}>{wallet.accountHolder ?? `${cur.flag} ${cur.name}`}</Text>
          <Text style={s.small}>{wallet.accountNumber ? maskNumber(wallet.accountNumber) : wallet.currency}</Text>
        </View>
        {!hidden && dayChange !== undefined && dayChange !== null && (
          <View style={s.changePill}>
            <MaterialIcons name={dayChange >= 0 ? 'north-east' : 'south-east'} size={12} color="#FFFFFF" />
            <Text style={s.changeText}>{t('wallet.today', { amount: formatMoney(dayChange, wallet.currency, { sign: true }) })}</Text>
          </View>
        )}
      </View>
    </LinearGradient>
  );

  return onPress ? <TouchableOpacity activeOpacity={0.92} onPress={onPress}>{body}</TouchableOpacity> : body;
}

const s = StyleSheet.create({
  hero:   { borderRadius: 26, padding: 18, overflow: 'hidden', height: 196 },
  glowA:  { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,160,200,0.18)', top: -90, right: -60 },
  glowB:  { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(0,98,127,0.22)', bottom: -50, left: -20 },
  top:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  providerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  providerIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: 'rgba(0,160,200,0.25)', alignItems: 'center', justifyContent: 'center' },
  providerName: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  providerType: { fontSize: 10, color: 'rgba(255,255,255,0.78)' },
  eye:    { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  label:  { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 18 },
  amount: { fontSize: 30, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 'auto' },
  smallLabel: { fontSize: 10, color: 'rgba(255,255,255,0.75)' },
  small:      { fontSize: 13, fontWeight: '600', color: '#FFFFFF', marginTop: 1, letterSpacing: 0.5 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11 },
  changeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
});
