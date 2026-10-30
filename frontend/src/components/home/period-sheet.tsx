import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { OptionRow, OptionSheet, SectionLabel, Tile } from '@/components/add/option-sheet';
import { DateTimeSheet } from '@/components/datetime-sheet';
import { usePreferences } from '@/context/preferences-context';
import {
  PRESET_IDS, fromDay, lastMonth, matchPreset, monthsOf, periodLabel, presetPeriod, rangeOf, samePeriod, thisMonth, toDay, type LabelEnv, type Period,
} from '@/utils/period';

/** The label of a period in the person's language ("October", "March 2025", "Year 2026", "All time", "5 Oct – 9 Oct"). */
export function usePeriodLabel() {
  const { t, formatDate } = useI18n();
  const env: LabelEnv = {
    month: (y, m, withYear) => formatDate(new Date(y, m - 1, 1), withYear ? { month: 'long', year: 'numeric' } : { month: 'long' }),
    day: (d, withYear) => formatDate(d, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }),
    t: (key, vars) => t(key, vars),
  };
  const { prefs } = usePreferences();
  return (p: Period) => {
    const preset = p.kind === 'range' || p.kind === 'year' ? matchPreset(p, new Date(), prefs.weekStart) : null;
    // Months, years and all time already read well; the short ranges (Today, Last 7 days…) are named.
    return preset && p.kind === 'range' ? t(`preset.${preset}` as any) : periodLabel(p, env);
  };
}

/** The small button that shows what Home is looking at ("October", "Year 2026", "All time") and opens the picker. */
export function PeriodPill({ period, onPress, onHeader = false }: { period: Period; onPress: () => void; onHeader?: boolean }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const label = usePeriodLabel()(period);
  const fg = onHeader ? '#FFFFFF' : theme.text;
  return (
    <TouchableOpacity testID="period-pill" activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${t('period.ariaPill')}: ${label}`}
                      style={[s.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <MaterialIcons name="calendar-month" size={15} color={fg} />
      <Text style={[s.pillText, { color: fg }]} numberOfLines={1}>{label}</Text>
      <MaterialIcons name="expand-more" size={16} color={fg} />
    </TouchableOpacity>
  );
}

/**
 * Pick what Home shows: this month, last month, any month, a year, everything, or a custom range of days.
 * Choosing closes the sheet; the custom range is applied with its own button once both days are chosen.
 */
export function PeriodSheet({ visible, period, onClose, onChange, presets = false }: { visible: boolean; period: Period; onClose: () => void; onChange: (p: Period) => void; presets?: boolean }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { prefs } = usePreferences();
  const now = new Date();
  const [year, setYear] = useState(period.kind === 'month' ? period.year : now.getFullYear());
  const [from, setFrom] = useState<Date | null>(period.kind === 'range' ? fromDay(period.from) : null);
  const [to, setTo] = useState<Date | null>(period.kind === 'range' ? fromDay(period.to) : null);
  const [picking, setPicking] = useState<null | 'from' | 'to'>(null);

  // Start from what is showing each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setYear(period.kind === 'month' ? period.year : period.kind === 'year' ? period.year : new Date().getFullYear());
    setFrom(period.kind === 'range' ? fromDay(period.from) : null);
    setTo(period.kind === 'range' ? fromDay(period.to) : null);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (p: Period) => { onChange(p); onClose(); };
  const dayText = (d: Date | null) => (d ? formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : t('period.choose'));
  const canApply = !!from && !!to;
  const apply = () => { if (from && to) choose(rangeOf(from, to)); };
  const stepYear = (by: number) => setYear(y => Math.min(now.getFullYear(), Math.max(2000, y + by)));

  return (
    <>
      <OptionSheet visible={visible} title={t('period.title')} onClose={onClose}>
        {presets ? (
          <View style={s.presets} testID="period-presets">
            {PRESET_IDS.map(id => {
              const on = matchPreset(period, now, prefs.weekStart) === id;
              return (
                <TouchableOpacity key={id} testID={`preset-${id}`} onPress={() => choose(presetPeriod(id, now, prefs.weekStart))} accessibilityRole="button" accessibilityState={{ selected: on }}
                                  style={[s.preset, { backgroundColor: on ? theme.primaryBg : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                  <Text style={{ fontSize: 12.5, fontWeight: on ? '600' : '500', color: on ? theme.primary : theme.text }}>{t(`preset.${id}` as any)}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={[s.preset, { backgroundColor: period.kind === 'range' && !matchPreset(period, now, prefs.weekStart) ? theme.primaryBg : theme.surface, borderColor: period.kind === 'range' && !matchPreset(period, now, prefs.weekStart) ? theme.primary : theme.border }]}>
              <Text style={{ fontSize: 12.5, fontWeight: '500', color: theme.text }}>{t('preset.custom')}</Text>
            </View>
          </View>
        ) : (
          <>
          <OptionRow testID="period-this-month" title={t('period.thisMonth')} selected={samePeriod(period, thisMonth())} tile={<Tile icon="today" color="#FFFFFF" bg={theme.primary} />} onPress={() => choose(thisMonth())} />
          <OptionRow testID="period-last-month" title={t('period.lastMonth')} selected={samePeriod(period, lastMonth())} tile={<Tile icon="history" color={theme.primary} bg={theme.primaryBg} />} onPress={() => choose(lastMonth())} />
          <OptionRow testID="period-this-year" title={t('period.thisYear')} selected={samePeriod(period, { kind: 'year', year: now.getFullYear() })} tile={<Tile icon="calendar-today" color={theme.primary} bg={theme.primaryBg} />} onPress={() => choose({ kind: 'year', year: now.getFullYear() })} />
          <OptionRow testID="period-all" title={t('period.allTime')} sub={t('period.allSub')} selected={period.kind === 'all'} tile={<Tile icon="all-inclusive" color={theme.primary} bg={theme.primaryBg} />} onPress={() => choose({ kind: 'all' })} />

          </>
        )}

        <SectionLabel text={t('period.pickMonth')} />
        <View style={[s.yearRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
          <TouchableOpacity testID="period-year-prev" onPress={() => stepYear(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous year"><MaterialIcons name="chevron-left" size={22} color={theme.text} /></TouchableOpacity>
          <TouchableOpacity testID="period-year-pick" onPress={() => choose({ kind: 'year', year })} accessibilityRole="button" accessibilityLabel={t('period.year', { year })}>
            <Text style={[s.yearText, { color: theme.text }]}>{year}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="period-year-next" onPress={() => stepYear(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next year" disabled={year >= now.getFullYear()}>
            <MaterialIcons name="chevron-right" size={22} color={year >= now.getFullYear() ? theme.textMuted : theme.text} />
          </TouchableOpacity>
        </View>
        <View style={s.grid}>
          {monthsOf(year).map(m => {
            const future = m.year > now.getFullYear() || (m.year === now.getFullYear() && m.month > now.getMonth() + 1);
            const on = period.kind === 'month' && period.year === m.year && period.month === m.month;
            return (
              <TouchableOpacity key={m.month} testID={`period-month-${m.month}`} disabled={future} onPress={() => choose({ kind: 'month', month: m.month, year: m.year })} accessibilityRole="button" accessibilityState={{ selected: on, disabled: future }}
                                style={[s.cell, { backgroundColor: on ? theme.primary : theme.inputBg, borderColor: on ? theme.primary : theme.border, opacity: future ? 0.4 : 1 }]}>
                <Text style={[s.cellText, { color: on ? (theme.isDark ? '#07202A' : '#FFFFFF') : theme.text }]}>{formatDate(new Date(m.year, m.month - 1, 1), { month: 'short' })}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <SectionLabel text={t('period.custom')} />
        <Text style={[s.hint, { color: theme.textSecondary }]}>{t('period.customSub')}</Text>
        <View style={s.rangeRow}>
          <TouchableOpacity testID="period-from" onPress={() => setPicking('from')} accessibilityRole="button" style={[s.field, { backgroundColor: theme.inputBg, borderColor: from ? theme.primary : theme.border }]}>
            <Text style={[s.fieldLabel, { color: theme.textMuted }]}>{t('period.from')}</Text>
            <Text style={[s.fieldValue, { color: from ? theme.text : theme.textMuted }]} numberOfLines={1}>{dayText(from)}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="period-to" onPress={() => setPicking('to')} accessibilityRole="button" style={[s.field, { backgroundColor: theme.inputBg, borderColor: to ? theme.primary : theme.border }]}>
            <Text style={[s.fieldLabel, { color: theme.textMuted }]}>{t('period.to')}</Text>
            <Text style={[s.fieldValue, { color: to ? theme.text : theme.textMuted }]} numberOfLines={1}>{dayText(to)}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity testID="period-apply" onPress={apply} disabled={!canApply} accessibilityRole="button" accessibilityState={{ disabled: !canApply }}
                          style={[s.apply, { backgroundColor: theme.buttonBg, opacity: canApply ? 1 : 0.45 }]}>
          <Text style={s.applyText}>{t('period.apply')}</Text>
        </TouchableOpacity>
        <View style={{ height: 8 }} />
      </OptionSheet>

      <DateTimeSheet
        visible={picking !== null} mode="date" title={t(picking === 'to' ? 'period.to' : 'period.from')} defaultView="calendar" presets={false}
        value={(picking === 'to' ? to : from) ?? undefined}
        onClose={() => setPicking(null)}
        onConfirm={d => {
          const day = fromDay(toDay(d));
          if (picking === 'from' && day) { setFrom(day); if (to && day > to) setTo(day); }
          if (picking === 'to' && day) { setTo(day); if (from && day < from) setFrom(day); }
          setPicking(null);
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preset: { minHeight: 38, paddingHorizontal: 13, borderRadius: 99, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 99, borderWidth: 1, maxWidth: 200 },
  pillText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },

  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, height: 44, marginBottom: 8 },
  yearText: { fontSize: 16, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '23%', flexGrow: 1, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 13, fontWeight: '700' },

  hint: { fontSize: 12, marginBottom: 8 },
  rangeRow: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  fieldLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4 },
  fieldValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  apply: { height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  applyText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
