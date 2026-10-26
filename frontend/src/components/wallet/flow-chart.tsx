// Ported from expo_app/components/wallet/flow-chart.tsx
import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from '@/rn';
import { LinearGradient } from '@/rn/gradient';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMoney } from '@/context/currency-context';
import type { DailyFlow } from '@/services/wallet.service';
import { useI18n } from '@/context/language-context';

const BAR_AREA = 120;

/** Weekly income / expense bars; tap a bar to see its value. */
export function FlowChart({ flow, hidden, locale = 'en-US' }: { flow: DailyFlow | null; hidden?: boolean; locale?: string }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [mode, setMode] = useState<'out' | 'in'>('out');
  const days = flow?.days ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected ?? days.length - 1;

  const values = days.map(d => d[mode]);
  const max = Math.max(1, ...values);
  const total = mode === 'in' ? flow?.totalIn ?? 0 : flow?.totalOut ?? 0;
  const accent = mode === 'in' ? ['#22C3A6', '#0E9F86'] as const : ['#00627F', '#2BA3C4'] as const;

  const dayLabel = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    try { return d.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 3); } catch { return iso.slice(5); }
  };

  return (
    <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[s.tabs, { backgroundColor: theme.inputBg }]}>
        {(['out', 'in'] as const).map(m => (
          <TouchableOpacity key={m} onPress={() => setMode(m)} activeOpacity={0.8}
                            style={[s.tab, mode === m && { backgroundColor: theme.surface }]}>
            <Text style={[s.tabText, { color: mode === m ? theme.primary : theme.textMuted }]}>{t(m === 'out' ? 'chart.expenses' : 'chart.income')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.head}>
        <View>
          <Text style={[s.total, { color: theme.text }]}>{flow ? formatMoney(total, flow.base, { hidden }) : '—'}</Text>
          <Text style={[s.caption, { color: theme.textMuted }]}>{t('chart.last7')}</Text>
        </View>
      </View>

      <View style={s.chart}>
        {days.map((d, i) => {
          const h = Math.max(6, (values[i] / max) * BAR_AREA);
          const active = i === sel;
          return (
            <TouchableOpacity key={d.date} style={s.col} onPress={() => setSelected(i)} activeOpacity={0.8}>
              {active && values[i] > 0 && (
                <View style={[s.tip, { backgroundColor: accent[0] }]}>
                  <Text style={s.tipText} numberOfLines={1}>{formatMoney(values[i], flow!.base, { hidden })}</Text>
                </View>
              )}
              <View style={{ height: BAR_AREA, justifyContent: 'flex-end' }}>
                {active ? (
                  <LinearGradient colors={accent} style={[s.bar, { height: h }]} />
                ) : (
                  <View style={[s.bar, { height: h, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : '#E7EEF1' }]} />
                )}
              </View>
              <Text style={[s.day, { color: active ? theme.text : theme.textMuted, fontWeight: active ? '700' : '500' }]}>{dayLabel(d.date)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:  { borderRadius: 20, borderWidth: 1, padding: 14 },
  tabs:  { flexDirection: 'row', borderRadius: 14, padding: 3 },
  tab:   { flex: 1, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12, fontWeight: '600' },
  head:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 },
  total: { fontSize: 20, fontWeight: '700' },
  caption: { fontSize: 11, marginTop: 1 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18 },
  col:   { flex: 1, alignItems: 'center' },
  bar:   { width: 18, borderRadius: 9 },
  day:   { fontSize: 10, marginTop: 6 },
  tip:   { position: 'absolute', top: -26, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, zIndex: 2, minWidth: 44, alignItems: 'center' },
  tipText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
});
