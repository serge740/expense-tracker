// Ported from expo_app/components/wallet/balance-chart.tsx
import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, LayoutChangeEvent } from '@/rn';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle } from '@/rn/svg';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMoney } from '@/context/currency-context';
import { useI18n } from '@/context/language-context';

export const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
] as const;

const H = 130;

/** Smooth area chart of closing balances, with range chips. */
export function BalanceChart({
  points, currency, color, days, onRange, hidden, loading,
}: {
  points: { date: string; balance: number }[];
  currency: string;
  color: string;
  days: number;
  onRange: (d: number) => void;
  hidden?: boolean;
  loading?: boolean;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const vals = points.map(p => p.balance);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const span = max - min || 1;
  const first = vals[0] ?? 0;
  const last = vals[vals.length - 1] ?? 0;
  const change = last - first;
  const up = change >= 0;

  const xy = (i: number) => {
    const x = vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2;
    const y = 8 + (1 - (vals[i] - min) / span) * (H - 16);
    return [x, y] as const;
  };

  // Smooth path via midpoint quadratic curves.
  let line = '';
  vals.forEach((_, i) => {
    const [x, y] = xy(i);
    if (i === 0) { line = `M ${x} ${y}`; return; }
    const [px, py] = xy(i - 1);
    const mx = (px + x) / 2;
    line += ` Q ${px} ${py} ${mx} ${(py + y) / 2} T ${x} ${y}`;
  });
  const area = vals.length ? `${line} L ${w} ${H} L 0 ${H} Z` : '';
  const [lx, ly] = vals.length ? xy(vals.length - 1) : [0, 0];

  return (
    <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={s.head}>
        <View>
          <Text style={[s.caption, { color: theme.textMuted }]}>{t('chart.balanceOverTime')}</Text>
          <Text style={[s.change, { color: up ? '#16A34A' : '#DC2626' }]}>
            {hidden ? '••••' : formatMoney(change, currency, { sign: true })}
            <Text style={[s.caption, { color: theme.textMuted }]}>  {t('chart.in', { range: RANGES.find(r => r.days === days)?.label ?? `${days}D` })}</Text>
          </Text>
        </View>
      </View>

      <View style={{ height: H, marginTop: 10 }} onLayout={onLayout}>
        {w > 0 && !loading && vals.length > 0 && (
          <Svg width={w} height={H}>
            <Defs>
              <SvgGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </SvgGradient>
            </Defs>
            <Path d={area} fill="url(#fill)" />
            <Path d={line} stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
            <Circle cx={lx} cy={ly} r={4.5} fill={theme.surface} stroke={color} strokeWidth={2.5} />
          </Svg>
        )}
      </View>

      <View style={[s.ranges, { backgroundColor: theme.inputBg }]}>
        {RANGES.map(r => {
          const on = r.days === days;
          return (
            <TouchableOpacity key={r.label} onPress={() => onRange(r.days)} activeOpacity={0.8}
                              style={[s.range, on && { backgroundColor: theme.surface }]}>
              <Text style={[s.rangeText, { color: on ? theme.text : theme.textMuted }]}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:    { borderRadius: 20, borderWidth: 1, padding: 14 },
  head:    { flexDirection: 'row', justifyContent: 'space-between' },
  caption: { fontSize: 11, fontWeight: '500' },
  change:  { fontSize: 16, fontWeight: '700', marginTop: 2 },
  ranges:  { flexDirection: 'row', borderRadius: 12, padding: 3, marginTop: 12 },
  range:   { flex: 1, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rangeText: { fontSize: 11, fontWeight: '700' },
});
