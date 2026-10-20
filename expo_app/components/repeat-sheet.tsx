import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { DateTimeSheet } from '@/components/datetime-sheet';
import {
  blankRule, normalizeRule, occurrences, RepeatRule, Unit, Wall, wallOfDate, weekdayOf,
} from '@/utils/recurrence';
import { dateText, describeRule, monthName, TextEnv, timeText, weekdayName } from '@/utils/recurrence-text';
import type { StringKey } from '@/i18n/strings';

const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const FREQ: { id: Unit | 'NONE'; label: StringKey }[] = [
  { id: 'NONE', label: 'rep.fNever' }, { id: 'DAY', label: 'rep.fDay' }, { id: 'WEEK', label: 'rep.fWeek' },
  { id: 'MONTH', label: 'rep.fMonth' }, { id: 'YEAR', label: 'rep.fYear' },
];
const NTH: { n: number; label: StringKey }[] = [
  { n: 1, label: 'rep.chip1' }, { n: 2, label: 'rep.chip2' }, { n: 3, label: 'rep.chip3' }, { n: 4, label: 'rep.chip4' }, { n: -1, label: 'rep.chipLast' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Add or remove one value, never leaving the list empty (an empty list means "use the start date's"). */
function toggle(list: number[], value: number, fallback: number[]): number[] {
  const current = list.length ? list : fallback;
  const next = current.includes(value) ? current.filter(x => x !== value) : [...current, value];
  return next.length ? next : current;
}

export interface RepeatSheetProps {
  visible: boolean;
  /** The first date and time of the item: fixes the time of day and the defaults. */
  start: Date;
  value: RepeatRule | null;
  onClose: () => void;
  onConfirm: (rule: RepeatRule | null) => void;
}

/** Bottom sheet that edits how a scheduled transaction repeats. */
export function RepeatSheet(props: RepeatSheetProps) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      {props.visible && <RepeatBody {...props} />}
    </Modal>
  );
}

function RepeatBody({ start, value, onClose, onConfirm }: RepeatSheetProps) {
  const theme = useAppTheme();
  const { t, locale, language } = useI18n();
  const env: TextEnv = useMemo(() => ({ t, locale, language }), [t, locale, language]);
  const startWall: Wall = useMemo(() => wallOfDate(start), [start]);
  const startWd = weekdayOf(startWall.y, startWall.m, startWall.d);

  const [draft, setDraft] = useState<RepeatRule | null>(() => (value ? { ...value, ends: { ...value.ends } } : null));
  const [mode, setMode] = useState<'days' | 'nth'>(value?.nth ? 'nth' : 'days');
  const [pickEnd, setPickEnd] = useState(false);

  const set = (patch: Partial<RepeatRule>) => setDraft(d => (d ? { ...d, ...patch } : d));
  const first = draft ? occurrences(draft, startWall, 1)[0] ?? startWall : startWall;
  const next = draft ? occurrences(draft, startWall, 5) : [];

  const chooseFreq = (id: Unit | 'NONE') => {
    if (id === 'NONE') return setDraft(null);
    setDraft(d => (d ? { ...d, unit: id, weekdays: [], monthDays: [], nth: null, months: [] } : blankRule(id)));
    setMode('days');
  };

  const unitWord = (u: Unit, n: number): string => t(({ DAY: n === 1 ? 'rep.uDay' : 'rep.uDays', WEEK: n === 1 ? 'rep.uWeek' : 'rep.uWeeks', MONTH: n === 1 ? 'rep.uMonth' : 'rep.uMonths', YEAR: n === 1 ? 'rep.uYear' : 'rep.uYears' } as const)[u]);

  const Chip = ({ label, on, onPress, a11y }: { label: string; on: boolean; onPress: () => void; a11y?: string }) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a11y ?? label}
                      style={[s.chip, { backgroundColor: on ? theme.primary : theme.inputBg, borderColor: on ? theme.primary : theme.border }]}>
      <Text style={[s.chipText, { color: on ? '#FFFFFF' : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const Circle = ({ label, on, onPress, a11y }: { label: string; on: boolean; onPress: () => void; a11y: string }) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={a11y}
                      style={[s.circ, { backgroundColor: on ? theme.primary : theme.inputBg, borderColor: on ? theme.primary : theme.border }]}>
      <Text style={[s.circText, { color: on ? '#FFFFFF' : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const Stepper = ({ n, unit, onLess, onMore }: { n: number; unit: string; onLess: () => void; onMore: () => void }) => (
    <View style={[s.stepper, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
      <TouchableOpacity onPress={onLess} style={s.stepBtn} accessibilityRole="button" accessibilityLabel={t('rep.less')}><Text style={[s.stepSign, { color: theme.primary }]}>−</Text></TouchableOpacity>
      <Text style={[s.stepVal, { color: theme.text }]}><Text style={s.stepN}>{n}</Text> {unit}</Text>
      <TouchableOpacity onPress={onMore} style={s.stepBtn} accessibilityRole="button" accessibilityLabel={t('rep.more')}><Text style={[s.stepSign, { color: theme.primary }]}>+</Text></TouchableOpacity>
    </View>
  );

  const Section = ({ title, note }: { title: string; note?: string }) => (
    <View style={s.secRow}>
      <Text style={[s.sec, { color: theme.textMuted }]}>{title}</Text>
      {note ? <Text style={[s.secNote, { color: theme.textMuted }]}>{note}</Text> : null}
    </View>
  );

  const selDays = draft?.monthDays.length ? draft.monthDays : [startWall.d];
  const selWeekdays = draft?.weekdays.length ? draft.weekdays : [startWd];
  const selMonths = draft?.months.length ? draft.months : [startWall.m];
  const nth = draft?.nth ?? { n: 1, weekday: startWd };

  const endDefault = (() => { const d = new Date(start); d.setFullYear(d.getFullYear() + 1); return d; })();
  const endDateStr = draft?.ends.type === 'on' ? draft.ends.date : isoDay(endDefault);
  const endWall = (() => { const [y, m, d] = endDateStr.split('-').map(Number); return { y, m, d }; })();

  return (
    <View style={s.backdrop}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      <View style={[s.sheet, { backgroundColor: theme.surface }]}>
        <View style={[s.grabber, { backgroundColor: theme.border }]} />
        <View style={s.head}>
          <Text style={[s.title, { color: theme.text }]}>{t('rep.title')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
            <MaterialIcons name="close" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[s.summary, { backgroundColor: theme.primaryBg }]}>
            <Text style={[s.summaryBig, { color: theme.text }]} testID="repeat-summary">{describeRule(draft, startWall, env)}</Text>
            <Text style={[s.summarySub, { color: theme.textMuted }]}>
              {t('rep.firstOn', { date: dateText(first, locale, true), time: timeText(first, locale) })}
            </Text>
          </View>

          <View style={[s.seg, { backgroundColor: theme.inputBg }]}>
            {FREQ.map(f => {
              const on = (draft?.unit ?? 'NONE') === f.id;
              return (
                <TouchableOpacity key={f.id} onPress={() => chooseFreq(f.id)} style={[s.segBtn, on && { backgroundColor: theme.surface }]}
                                  accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[s.segText, { color: on ? theme.primary : theme.textMuted }]} numberOfLines={1}>{t(f.label)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!draft ? (
            <Text style={[s.hint, { color: theme.textMuted }]}>{t('rep.onceHint')}</Text>
          ) : (
            <>
              <Section title={t('rep.secEvery')} />
              <Stepper n={draft.every} unit={unitWord(draft.unit, draft.every)}
                       onLess={() => set({ every: Math.max(1, draft.every - 1) })} onMore={() => set({ every: Math.min(99, draft.every + 1) })} />

              {draft.unit === 'WEEK' && (
                <>
                  <Section title={t('rep.secOn')} note={t('rep.pickDays')} />
                  <View style={s.wrapRow}>
                    {MON_FIRST.map(d => (
                      <Circle key={d} label={weekdayName(d, locale, 'narrow')} a11y={weekdayName(d, locale)} on={selWeekdays.includes(d)}
                              onPress={() => set({ weekdays: toggle(draft.weekdays, d, [startWd]) })} />
                    ))}
                  </View>
                </>
              )}

              {draft.unit === 'YEAR' && (
                <>
                  <Section title={t('rep.secIn')} note={t('rep.pickMonths')} />
                  <View style={s.wrapRow}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <Chip key={m} label={monthName(m, locale, 'short')} on={selMonths.includes(m)} a11y={monthName(m, locale)}
                            onPress={() => set({ months: toggle(draft.months, m, [startWall.m]) })} />
                    ))}
                  </View>
                </>
              )}

              {draft.unit === 'MONTH' && (
                <View style={[s.seg, { backgroundColor: theme.inputBg, marginTop: 12 }]}>
                  {(['days', 'nth'] as const).map(m => (
                    <TouchableOpacity key={m} style={[s.segBtn, mode === m && { backgroundColor: theme.surface }]} accessibilityRole="button" accessibilityState={{ selected: mode === m }}
                                      onPress={() => { setMode(m); set({ nth: m === 'nth' ? draft.nth ?? { n: 1, weekday: startWd } : null }); }}>
                      <Text style={[s.segText, { color: mode === m ? theme.primary : theme.textMuted }]} numberOfLines={1}>{t(m === 'days' ? 'rep.modeDays' : 'rep.modeNth')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {(draft.unit === 'YEAR' || (draft.unit === 'MONTH' && mode === 'days')) && (
                <>
                  <Section title={t('rep.secOnDay')} note={t('rep.pickOne')} />
                  <View style={s.wrapRow}>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <TouchableOpacity key={d} onPress={() => set({ monthDays: toggle(draft.monthDays, d, [startWall.d]) })} accessibilityRole="button"
                                        accessibilityState={{ selected: selDays.includes(d) }} accessibilityLabel={String(d)}
                                        style={[s.dcell, { backgroundColor: selDays.includes(d) ? theme.primary : theme.inputBg, borderColor: selDays.includes(d) ? theme.primary : theme.border }]}>
                        <Text style={[s.dcellText, { color: selDays.includes(d) ? '#FFFFFF' : theme.text }]}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[s.wrapRow, { marginTop: 8 }]}>
                    <Chip label={t('rep.lastDayChip')} on={selDays.includes(-1)} onPress={() => set({ monthDays: toggle(draft.monthDays, -1, [startWall.d]) })} />
                  </View>
                </>
              )}

              {draft.unit === 'MONTH' && mode === 'nth' && (
                <>
                  <Section title={t('rep.secWhich')} />
                  <View style={s.wrapRow}>
                    {NTH.map(o => <Chip key={o.n} label={t(o.label)} on={nth.n === o.n} onPress={() => set({ nth: { ...nth, n: o.n } })} />)}
                  </View>
                  <View style={[s.wrapRow, { marginTop: 8 }]}>
                    {MON_FIRST.map(d => (
                      <Circle key={d} label={weekdayName(d, locale, 'narrow')} a11y={weekdayName(d, locale)} on={nth.weekday === d}
                              onPress={() => set({ nth: { ...nth, weekday: d } })} />
                    ))}
                  </View>
                </>
              )}

              <Section title={t('rep.secEnds')} />
              <View style={[s.seg, { backgroundColor: theme.inputBg }]}>
                {([['never', 'rep.eNever'], ['on', 'rep.eOn'], ['after', 'rep.eAfter']] as const).map(([k, label]) => (
                  <TouchableOpacity key={k} accessibilityRole="button" accessibilityState={{ selected: draft.ends.type === k }}
                                    style={[s.segBtn, draft.ends.type === k && { backgroundColor: theme.surface }]}
                                    onPress={() => set({ ends: k === 'never' ? { type: 'never' } : k === 'on' ? { type: 'on', date: endDateStr } : { type: 'after', count: draft.ends.type === 'after' ? draft.ends.count : 12 } })}>
                    <Text style={[s.segText, { color: draft.ends.type === k ? theme.primary : theme.textMuted }]} numberOfLines={1}>{t(label)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {draft.ends.type === 'on' && (
                <TouchableOpacity onPress={() => setPickEnd(true)} style={[s.dateLine, { backgroundColor: theme.inputBg, borderColor: theme.border }]} accessibilityRole="button">
                  <Text style={[s.dateLineLabel, { color: theme.textMuted }]}>{t('rep.endsLastDay')}</Text>
                  <Text style={[s.dateLineValue, { color: theme.text }]}>{dateText(endWall, locale, true)}</Text>
                </TouchableOpacity>
              )}
              {draft.ends.type === 'after' && (
                <View style={{ marginTop: 8 }}>
                  <Stepper n={draft.ends.count} unit={t(draft.ends.count === 1 ? 'rep.uTime' : 'rep.uTimes')}
                           onLess={() => set({ ends: { type: 'after', count: Math.max(1, (draft.ends as { count: number }).count - 1) } })}
                           onMore={() => set({ ends: { type: 'after', count: Math.min(999, (draft.ends as { count: number }).count + 1) } })} />
                </View>
              )}

              <Section title={t('rep.secNext')}
                       note={draft.ends.type === 'never' ? t('rep.foreverNote') : draft.ends.type === 'on' ? t('rep.untilNote') : t('rep.totalNote', { n: draft.ends.count })} />
              <View style={[s.next, { backgroundColor: theme.inputBg }]}>
                {next.length === 0 ? (
                  <Text style={[s.nextEmpty, { color: theme.textMuted }]}>{t('rep.noDates')}</Text>
                ) : next.map((w, i) => (
                  <View key={i} style={s.nextRow} testID="repeat-next">
                    <Text style={[s.nextIdx, { backgroundColor: theme.primaryBg, color: theme.primary }]}>{i + 1}</Text>
                    <Text style={[s.nextDate, { color: theme.text }]}>{dateText(w, locale, true)}</Text>
                    <Text style={[s.nextTime, { color: theme.textMuted }]}>{timeText(w, locale)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <View style={s.actions}>
          <TouchableOpacity style={[s.btn, { backgroundColor: theme.primaryBg }]} onPress={onClose} accessibilityRole="button">
            <Text style={[s.btnText, { color: theme.primary }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: theme.buttonBg }]} accessibilityRole="button"
                            onPress={() => onConfirm(draft ? normalizeRule(draft) : null)}>
            <Text style={[s.btnText, { color: '#FFFFFF' }]}>{t('rep.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <DateTimeSheet visible={pickEnd} title={t('rep.endsLastDay')} mode="date" value={new Date(endWall.y, endWall.m - 1, endWall.d, 12)}
                     minDate={start} onClose={() => setPickEnd(false)}
                     onConfirm={d => { set({ ends: { type: 'on', date: isoDay(d) } }); setPickEnd(false); }} />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:    { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 22, maxHeight: '90%' },
  grabber:  { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 8 },
  head:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title:    { fontSize: 16, fontWeight: '800' },

  summary:    { borderRadius: 16, padding: 12 },
  summaryBig: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  summarySub: { fontSize: 11, marginTop: 3 },

  seg:     { flexDirection: 'row', borderRadius: 14, padding: 3, marginTop: 12 },
  segBtn:  { flex: 1, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  segText: { fontSize: 11.5, fontWeight: '700' },
  hint:    { fontSize: 12, marginTop: 14, lineHeight: 17 },

  secRow:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  sec:     { fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  secNote: { fontSize: 10.5, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 8 },

  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  chipText:{ fontSize: 12, fontWeight: '700' },
  circ:    { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  circText:{ fontSize: 13, fontWeight: '800' },
  dcell:   { width: 40, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dcellText: { fontSize: 12, fontWeight: '700' },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 46, borderRadius: 14, borderWidth: 1 },
  stepBtn: { width: 52, height: 46, alignItems: 'center', justifyContent: 'center' },
  stepSign:{ fontSize: 22, fontWeight: '700' },
  stepVal: { fontSize: 13, fontWeight: '600' },
  stepN:   { fontSize: 18, fontWeight: '800' },

  dateLine:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, marginTop: 8 },
  dateLineLabel: { fontSize: 12 },
  dateLineValue: { fontSize: 13, fontWeight: '700' },

  next:      { borderRadius: 14, paddingVertical: 4, paddingHorizontal: 12 },
  nextEmpty: { fontSize: 12, paddingVertical: 12 },
  nextRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  nextIdx:   { width: 20, height: 20, borderRadius: 10, textAlign: 'center', lineHeight: 20, fontSize: 10.5, fontWeight: '800', overflow: 'hidden' },
  nextDate:  { flex: 1, fontSize: 13, fontWeight: '600' },
  nextTime:  { fontSize: 12 },

  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn:     { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '700' },
});
