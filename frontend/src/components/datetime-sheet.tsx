// Ported from expo_app/components/datetime-sheet.tsx
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from '@/rn';
import { useSafeAreaInsets } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { WheelPicker, tick } from '@/components/wheel-picker';
import { useAppTheme, AppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import type { StringKey } from '@/i18n/strings';
import * as dt from '@/utils/datetime';

export interface DateTimeSheetProps {
  visible: boolean;
  title?: string;
  value?: Date | null;
  /** `date` keeps the time of day of `value` (noon if none); `time` is a time of day only. */
  mode?: dt.PickerMode;
  /** Earliest / latest allowed value. Ignored for `time`. */
  minDate?: Date | null;
  maxDate?: Date | null;
  /** Minute wheel granularity: 1, 5, 10, 15 or 30. */
  minuteStep?: number;
  /** Force 12 / 24-hour; defaults to the app language's convention. */
  hour12?: boolean;
  confirmLabel?: string;
  /** Show the quick-pick chips. */
  presets?: boolean;
  /** Open the full month calendar instead of the day strip (useful for far-away or past dates). */
  defaultView?: 'strip' | 'calendar';
  onClose: () => void;
  onConfirm: (date: Date) => void;
}

const DAY_W = 54;
const DAY_GAP = 8;
const STRIP_DAYS = 30;

const PRESET_KEY: Partial<Record<dt.PresetId, StringKey>> = {
  today: 'date.today', tomorrow: 'date.tomorrow', nextMonday: 'date.nextMonday', inWeek: 'date.inWeek',
  endOfMonth: 'date.endOfMonth', inMonth: 'date.inMonth', now: 'date.now',
  in10: 'date.in10', in30: 'date.in30', in1h: 'date.in1h', tonight: 'date.tonight',
  tomorrow9: 'date.tomorrow9', nextMon9: 'date.nextMon9',
};

// ── Locale helpers ───────────────────────────────────────────────────────────
// Creating an Intl formatter is slow on Hermes, so every formatter and every derived
// table is built once per locale and reused (never inside render).
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = formatters.get(key);
  if (!f) {
    try { f = new Intl.DateTimeFormat(locale, opts); } catch { f = new Intl.DateTimeFormat('en-US', opts); }
    formatters.set(key, f);
  }
  return f;
}

const namesCache = new Map<string, { months: string[]; days: string[]; weekdayShort: string[] }>();
/** Month / weekday names in the app language; English if the device can't format it. */
function localNames(locale: string) {
  const hit = namesCache.get(locale);
  if (hit) return hit;
  let value = { months: MONTHS_EN, days: WEEKDAYS_EN, weekdayShort: WEEKDAYS_EN };
  try {
    const mf = formatter(locale, { month: 'long' });
    const wf = formatter(locale, { weekday: 'short' });
    const months = MONTHS_EN.map((_, m) => mf.format(new Date(2024, m, 1)));
    // 2024-01-07 is a Sunday.
    const weekdayShort = WEEKDAYS_EN.map((_, i) => wf.format(new Date(2024, 0, 7 + i)).replace('.', ''));
    const days = weekdayShort.map(w => w.slice(0, 3));
    const ok = months.every(x => x && !/^\d/.test(x)) && days.every(Boolean) && new Set(days).size === 7;
    if (ok) value = { months: months.map(x => x[0].toUpperCase() + x.slice(1)), days, weekdayShort };
  } catch { /* keep English */ }
  namesCache.set(locale, value);
  return value;
}

const hour12Cache = new Map<string, boolean>();
function localeHour12(locale: string): boolean {
  const hit = hour12Cache.get(locale);
  if (hit !== undefined) return hit;
  let v = true;
  try {
    const r = formatter(locale, { hour: 'numeric' }).resolvedOptions() as Intl.ResolvedDateTimeFormatOptions & { hourCycle?: string };
    if (r.hourCycle) v = r.hourCycle === 'h12' || r.hourCycle === 'h11';
    else if (typeof r.hour12 === 'boolean') v = r.hour12;
  } catch { /* default */ }
  hour12Cache.set(locale, v);
  return v;
}

const periodCache = new Map<string, [string, string]>();
function dayPeriods(locale: string): [string, string] {
  const hit = periodCache.get(locale);
  if (hit) return hit;
  let v: [string, string] = ['AM', 'PM'];
  try {
    const f = formatter(locale, { hour: 'numeric', hour12: true });
    const label = (h: number) => f.formatToParts(new Date(2024, 0, 1, h)).find(p => p.type === 'dayPeriod')?.value;
    const am = label(9), pm = label(21);
    if (am && pm && am !== pm) v = [am, pm];
  } catch { /* default */ }
  periodCache.set(locale, v);
  return v;
}

// ── Rows that only redraw when they change ───────────────────────────────────
interface DayChipProps {
  day: Date; on: boolean; off: boolean; isToday: boolean; weekday: string; month: string; label: string;
  onPick: (d: Date) => void; theme: AppTheme;
}
const DayChip = memo(function DayChip({ day, on, off, isToday, weekday, month, label, onPick, theme }: DayChipProps) {
  return (
    <TouchableOpacity
      disabled={off}
      onPress={() => onPick(day)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled: off }}
      style={[s.day, { backgroundColor: on ? theme.primary : theme.surface, borderColor: on ? theme.primary : theme.border, opacity: off ? 0.3 : 1 }]}
    >
      <Text style={[s.dayW, { color: on ? 'rgba(255,255,255,.8)' : theme.textMuted }]}>{weekday}</Text>
      <Text style={[s.dayN, { color: on ? '#FFFFFF' : isToday ? theme.primary : theme.text }]}>{day.getDate()}</Text>
      <Text style={[s.dayM, { color: on ? 'rgba(255,255,255,.8)' : theme.textSecondary }]}>{month}</Text>
    </TouchableOpacity>
  );
});

interface CalCellProps {
  year: number; month: number; day: number; current: boolean; on: boolean; off: boolean; isToday: boolean;
  size: number; label: string; onPick: (d: Date) => void; theme: AppTheme;
}
const CalCell = memo(function CalCell({ year, month, day, current, on, off, isToday, size, label, onPick, theme }: CalCellProps) {
  return (
    <TouchableOpacity
      disabled={off}
      onPress={() => onPick(new Date(year, month, day))}
      activeOpacity={0.7}
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled: off }}
      style={[
        s.cell, { width: size, height: 36, opacity: off ? 0.3 : 1 },
        on && { backgroundColor: theme.primary, borderRadius: 18 },
        !on && isToday && { borderWidth: 1.5, borderColor: theme.primary, borderRadius: 18 },
      ]}
    >
      <Text style={[s.cellText, { color: on ? '#FFFFFF' : current ? theme.text : theme.textMuted }, on && { fontWeight: '700' }]}>{day}</Text>
    </TouchableOpacity>
  );
});

// ── Public component: a cheap shell; the heavy body only exists while open ───
export function DateTimeSheet(props: DateTimeSheetProps) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose} statusBarTranslucent>
      {props.visible ? <SheetContent {...props} /> : null}
    </Modal>
  );
}

function SheetContent({
  title, value, mode = 'datetime', minDate, maxDate, minuteStep = 5, hour12: hour12Prop,
  confirmLabel, presets = true, defaultView = 'strip', onClose, onConfirm,
}: DateTimeSheetProps) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const hour12 = hour12Prop ?? localeHour12(locale);
  const min = mode === 'time' ? null : minDate ?? null;
  const max = mode === 'time' ? null : maxDate ?? null;
  const names = localNames(locale);
  const periods = dayPeriods(locale);

  // Decide the opening value once (this component is mounted fresh on every open).
  const start = useMemo(() => {
    const now = new Date();
    let v: Date;
    if (mode === 'date') {
      v = value ? new Date(value) : dt.startOfDay(now);
      if (!value) v.setHours(12, 0, 0, 0);
    } else {
      v = value ? dt.roundToStep(value, minuteStep) : dt.ceilToStep(now, minuteStep);
    }
    if (min && dt.rangeError(v, mode, min, max) === 'min') {
      v = mode === 'date' ? dt.withDay(v, min) : dt.ceilToStep(min, minuteStep);
    }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sel, setSel] = useState<Date>(start);
  const [calOpen, setCalOpen] = useState(mode !== 'time' && defaultView === 'calendar');
  const [jump, setJump] = useState(false);
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [ready, setReady] = useState(false);
  const stripStart = useMemo(
    () => (min ? dt.startOfDay(min) : dt.addDays(dt.startOfDay(start), -3)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const stripRef = useRef<ScrollView>(null);

  // Paint the sheet frame first, then build the heavy parts on the next frame.
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, []);

  // The calendar follows the selection when it moves to another month.
  const selY = sel.getFullYear();
  const selM = sel.getMonth();
  useEffect(() => { setView({ y: selY, m: selM }); }, [selY, selM]);

  const err = dt.rangeError(sel, mode, min, max);
  const wheel = useMemo(() => ({ hour12, step: minuteStep }), [hour12, minuteStep]);
  const idx = dt.wheelIndexes(sel, wheel);
  const hourItems = useMemo(
    () => (hour12 ? Array.from({ length: 12 }, (_, i) => String(i + 1)) : Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))),
    [hour12],
  );
  const minuteItems = useMemo(() => dt.minuteValues(minuteStep).map(m => String(m).padStart(2, '0')), [minuteStep]);

  // ── Text (cached formatters: cheap) ─────────────────────────────────────────
  const thisYear = new Date().getFullYear();
  const dayFmt = (withYear: boolean) => formatter(locale, withYear ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtDay = (d: Date) => dayFmt(d.getFullYear() !== thisYear).format(d);
  const timeFmt = formatter(locale, { hour: 'numeric', minute: '2-digit', hour12 });
  const fmtTime = (d: Date) => timeFmt.format(d);
  const weekdayFmt = formatter(locale, { weekday: 'short' });

  const relText = () => {
    const r = dt.relativeParts(sel);
    if (r.dir === 'now') return t('date.relNow');
    const parts: string[] = [];
    if (r.days) parts.push(`${r.days} ${t('date.unitD')}`);
    if (r.hours) parts.push(`${r.hours} ${t('date.unitH')}`);
    if (!r.days && r.minutes) parts.push(`${r.minutes} ${t('date.unitMin')}`);
    return t(r.dir === 'in' ? 'date.relIn' : 'date.relAgo', { when: parts.join(' ') });
  };
  const dayRel = () => {
    const n = dt.dayDelta(sel);
    return n === 0 ? t('date.today') : n === 1 ? t('date.tomorrow') : n === -1 ? t('date.yesterday') : n > 0 ? t('date.inDays', { n }) : t('date.daysAgo', { n: -n });
  };
  const big = mode === 'time' ? fmtTime(sel) : fmtDay(sel);
  const sub = mode === 'datetime' ? fmtTime(sel) : mode === 'date' ? String(sel.getFullYear()) : t('date.timeOfDay');
  const rel = mode === 'date' ? dayRel() : mode === 'datetime' ? relText() : '';
  const relBad = mode === 'datetime' && sel < new Date();
  const zone = useMemo(() => {
    let name = '';
    try { name = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* unknown */ }
    return `${name} (${dt.gmtOffsetLabel()})`.trim();
  }, []);

  // ── Day strip ───────────────────────────────────────────────────────────────
  const days = useMemo(() => dt.buildDayStrip(stripStart, STRIP_DAYS, sel), [stripStart, sel]);
  const today = new Date();
  useEffect(() => {
    if (!ready || calOpen || mode === 'time') return;
    const i = days.findIndex(d => dt.sameDay(d, sel));
    if (i < 0) return;
    const id = setTimeout(() => stripRef.current?.scrollTo({ x: Math.max(0, i * (DAY_W + DAY_GAP) - width / 2 + DAY_W), animated: true }), 40);
    return () => clearTimeout(id);
  }, [ready, calOpen, mode, days, sel, width]);

  // ── Calendar ────────────────────────────────────────────────────────────────
  const cells = useMemo(() => dt.buildCalendar(view.y, view.m), [view]);
  const CELL = Math.floor((width - 36 - 20) / 7);

  // ── Actions (stable identities so memoised rows do not redraw) ──────────────
  const setDay = useCallback((day: Date) => { tick(); setSel(prev => dt.withDay(prev, day)); }, []);
  const applyPreset = (p: dt.Preset) => {
    tick();
    setSel(prev => (mode === 'date' ? dt.withDay(prev, p.date) : mode === 'time' ? dt.withTime(prev, p.date) : p.date));
  };
  const fixEarliest = () => {
    if (!min) return;
    setSel(prev => (mode === 'date' ? dt.withDay(prev, min) : dt.ceilToStep(min > new Date() ? min : new Date(), minuteStep)));
  };
  const confirm = () => {
    if (err) return;
    onConfirm(sel);
    onClose();
  };
  const onHour = useCallback((i: number) => setSel(prev => dt.applyWheel(prev, 'h', i, wheel)), [wheel]);
  const onMinute = useCallback((i: number) => setSel(prev => dt.applyWheel(prev, 'm', i, wheel)), [wheel]);
  const onPeriod = useCallback((i: number) => setSel(prev => dt.applyWheel(prev, 'p', i, wheel)), [wheel]);

  const presetLabel = (p: dt.Preset) => (PRESET_KEY[p.id] ? t(PRESET_KEY[p.id] as StringKey) : fmtTime(p.date));

  return (
    <View style={s.root}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      <View style={[s.sheet, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <View style={[s.grab, { backgroundColor: theme.border }]} />

        <View style={s.head}>
          <Text style={[s.title, { color: theme.text }]}>{title ?? t('date.select')}</Text>
          <TouchableOpacity onPress={onClose} style={[s.x, { borderColor: theme.border, backgroundColor: theme.inputBg }]} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
            <MaterialIcons name="close" size={16} color={theme.text} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={s.body} contentContainerStyle={{ paddingBottom: 6 }}>
          {/* Summary: cheap, so it shows immediately */}
          <View style={[s.summary, { backgroundColor: theme.primaryBg }]} accessibilityLiveRegion="polite">
            <View style={{ flex: 1 }}>
              <Text style={[s.big, { color: theme.primary }]}>{big}</Text>
              <Text style={[s.sub, { color: theme.textSecondary }]}>{sub}</Text>
            </View>
            {!!rel && (
              <View style={[s.rel, { backgroundColor: theme.surface }]}>
                <Text style={[s.relText, { color: relBad ? theme.expense : theme.primary }]}>{rel}</Text>
              </View>
            )}
          </View>

          {!ready ? (
            <View style={s.loading} testID="sheet-loading" accessibilityRole="progressbar">
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : (
            <>
              {/* Quick picks */}
              {presets && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
                  {dt.buildPresets(mode, new Date(), sel, minuteStep).map(p => {
                    const on = dt.isPresetActive(p, mode, sel);
                    const off = dt.isPresetDisabled(p, mode, min, max);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        disabled={off}
                        onPress={() => applyPreset(p)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: off }}
                        style={[s.chip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryBg : theme.surface, opacity: off ? 0.35 : 1 }]}
                      >
                        <Text style={[s.chipText, { color: on ? theme.primary : theme.text }]}>{presetLabel(p)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Date */}
              {mode !== 'time' && (
                <>
                  <View style={s.sec}>
                    <Text style={[s.secLabel, { color: theme.textMuted }]}>{mode === 'datetime' ? t('date.day') : t('date.dateLabel')}</Text>
                    <TouchableOpacity onPress={() => { setCalOpen(v => !v); setJump(false); }} hitSlop={8} style={s.link} accessibilityRole="button">
                      <MaterialIcons name={calOpen ? 'view-day' : 'calendar-month'} size={15} color={theme.primary} />
                      <Text style={[s.linkText, { color: theme.primary }]}>{calOpen ? t('date.strip') : t('date.calendar')}</Text>
                    </TouchableOpacity>
                  </View>

                  {!calOpen ? (
                    <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
                      {days.map(d => {
                        const isToday = dt.sameDay(d, today);
                        return (
                          <DayChip
                            key={d.getTime()}
                            day={d}
                            on={dt.sameDay(d, sel)}
                            off={dt.isDayDisabled(d, min, max)}
                            isToday={isToday}
                            weekday={isToday ? t('date.today') : weekdayFmt.format(d).replace('.', '')}
                            month={names.months[d.getMonth()].slice(0, 3)}
                            label={fmtDay(d)}
                            onPick={setDay}
                            theme={theme}
                          />
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={[s.cal, { borderColor: theme.border }]}>
                      {jump ? (
                        <>
                          <View style={s.calHead}>
                            <TouchableOpacity style={s.arrow} onPress={() => setView(v => ({ ...v, y: v.y - 1 }))} accessibilityLabel={t('date.prevMonth')}>
                              <MaterialIcons name="chevron-left" size={22} color={theme.text} />
                            </TouchableOpacity>
                            <Text style={[s.calTitle, { color: theme.text }]}>{view.y}</Text>
                            <TouchableOpacity style={s.arrow} onPress={() => setView(v => ({ ...v, y: v.y + 1 }))} accessibilityLabel={t('date.nextMonth')}>
                              <MaterialIcons name="chevron-right" size={22} color={theme.text} />
                            </TouchableOpacity>
                          </View>
                          <View style={s.months}>
                            {names.months.map((name, i) => (
                              <TouchableOpacity
                                key={i}
                                style={[s.monthBtn, i === view.m && { backgroundColor: theme.primary }]}
                                onPress={() => { setView({ y: view.y, m: i }); setJump(false); }}
                              >
                                <Text style={[s.monthText, { color: i === view.m ? '#FFFFFF' : theme.text }]}>{name.slice(0, 3)}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={s.calHead}>
                            <TouchableOpacity style={s.arrow} onPress={() => setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 }))} accessibilityLabel={t('date.prevMonth')}>
                              <MaterialIcons name="chevron-left" size={22} color={theme.text} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setJump(true)} style={s.calTitleBtn} accessibilityRole="button">
                              <Text style={[s.calTitle, { color: theme.text }]}>{names.months[view.m]} {view.y}</Text>
                              <MaterialIcons name="arrow-drop-down" size={20} color={theme.textMuted} />
                            </TouchableOpacity>
                            <TouchableOpacity style={s.arrow} onPress={() => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 }))} accessibilityLabel={t('date.nextMonth')}>
                              <MaterialIcons name="chevron-right" size={22} color={theme.text} />
                            </TouchableOpacity>
                          </View>
                          <View style={s.weekRow}>
                            {names.days.map((w, i) => (
                              <View key={i} style={{ width: CELL, alignItems: 'center' }}>
                                <Text style={[s.weekText, { color: theme.textMuted }]}>{w}</Text>
                              </View>
                            ))}
                          </View>
                          <View style={s.grid}>
                            {cells.map((c, i) => {
                              const day = new Date(c.year, c.month, c.day);
                              return (
                                <CalCell
                                  key={i}
                                  year={c.year} month={c.month} day={c.day} current={c.current}
                                  on={dt.sameDay(day, sel)}
                                  off={dt.isDayDisabled(day, min, max)}
                                  isToday={dt.sameDay(day, today)}
                                  size={CELL}
                                  label={fmtDay(day)}
                                  onPick={setDay}
                                  theme={theme}
                                />
                              );
                            })}
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* Time */}
              {mode !== 'date' && (
                <>
                  <View style={s.sec}>
                    <Text style={[s.secLabel, { color: theme.textMuted }]}>{t('date.time')}</Text>
                    <Text style={[s.secRight, { color: theme.textMuted }]}>{hour12 ? t('date.h12') : t('date.h24')}</Text>
                  </View>
                  <View style={s.wheels}>
                    <WheelPicker items={hourItems} index={idx.h} width={84} label={t('date.hour')} onChange={onHour} />
                    <Text style={[s.colon, { color: theme.textMuted }]}>:</Text>
                    <WheelPicker items={minuteItems} index={idx.m} width={84} label={t('date.minute')} onChange={onMinute} />
                    {hour12 && <WheelPicker items={periods} index={idx.p} width={84} label={t('date.period')} onChange={onPeriod} />}
                  </View>
                </>
              )}

              {/* Problems */}
              {!!err && (
                <View style={[s.msg, { backgroundColor: 'rgba(220,38,38,0.1)' }]} accessibilityRole="alert">
                  <MaterialIcons name="error-outline" size={16} color={theme.expense} />
                  <Text style={[s.msgText, { color: theme.expense }]}>{err === 'min' ? t('date.passed') : t('date.tooLate')}</Text>
                  {err === 'min' && (
                    <TouchableOpacity onPress={fixEarliest} hitSlop={8} accessibilityRole="button">
                      <Text style={[s.msgLink, { color: theme.primary }]}>{t('date.useEarliest')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {mode !== 'date' && (
                <View style={s.tz}>
                  <MaterialIcons name="public" size={13} color={theme.textMuted} />
                  <Text style={[s.tzText, { color: theme.textMuted }]}>{zone}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        <View style={s.foot}>
          <TouchableOpacity style={[s.btn, s.ghost, { backgroundColor: theme.inputBg }]} onPress={onClose} activeOpacity={0.8} accessibilityRole="button">
            <Text style={[s.btnText, { color: theme.textSecondary }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.main, { backgroundColor: theme.primary, opacity: err ? 0.4 : 1 }]}
            onPress={confirm}
            disabled={!!err}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!err }}
          >
            <Text style={[s.btnText, { color: theme.isDark ? '#06222B' : '#FFFFFF' }]}>{confirmLabel ?? t('date.confirm')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, maxHeight: '92%' },
  grab: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '700' },
  x: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flexGrow: 0, marginTop: 4 },

  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginTop: 6, marginBottom: 8 },
  big: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 2 },
  rel: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  relText: { fontSize: 11, fontWeight: '700' },

  loading: { height: 240, alignItems: 'center', justifyContent: 'center' },

  chips: { gap: 6, paddingVertical: 2, paddingRight: 6, marginBottom: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 11.5, fontWeight: '600' },

  sec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 6, marginHorizontal: 2 },
  secLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  secRight: { fontSize: 10, fontWeight: '600' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 11.5, fontWeight: '700' },

  strip: { gap: DAY_GAP, paddingVertical: 4, paddingRight: 8 },
  day: { width: DAY_W, borderRadius: 16, borderWidth: 1, paddingVertical: 8, alignItems: 'center' },
  dayW: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  dayN: { fontSize: 18, fontWeight: '700', marginVertical: 1 },
  dayM: { fontSize: 10 },

  cal: { borderWidth: 1, borderRadius: 16, padding: 8, marginBottom: 8 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calTitleBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  calTitle: { fontSize: 13, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekText: { fontSize: 10, fontWeight: '600', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 12.5 },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 4 },
  monthBtn: { width: '31%', height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 13, fontWeight: '600' },

  wheels: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 6 },
  colon: { fontSize: 22, fontWeight: '700', marginTop: -4 },

  msg: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  msgText: { flex: 1, fontSize: 11.5 },
  msgLink: { fontSize: 11.5, fontWeight: '700' },
  tz: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 2, marginBottom: 6 },
  tzText: { fontSize: 10.5 },

  foot: { flexDirection: 'row', gap: 10, paddingTop: 8 },
  btn: { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  ghost: { width: 100 },
  main: { flex: 1 },
  btnText: { fontSize: 14, fontWeight: '700' },
});
