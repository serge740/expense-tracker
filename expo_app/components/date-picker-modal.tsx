import React, { useEffect, useState } from 'react';
import {
  Modal, View, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/text';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

interface CalendarDay {
  day: number;
  month: number; // 0-indexed
  year: number;
  current: boolean;
}

function buildCalendar(year: number, month: number): CalendarDay[] {
  const firstWeekday  = new Date(year, month, 1).getDay();
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const daysInPrev    = new Date(year, month, 0).getDate();
  const prevMonth     = month === 0 ? 11 : month - 1;
  const prevYear      = month === 0 ? year - 1 : year;
  const nextMonth     = month === 11 ? 0 : month + 1;
  const nextYear      = month === 11 ? year + 1 : year;

  const cells: CalendarDay[] = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, month: prevMonth, year: prevYear, current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month, year, current: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, month: nextMonth, year: nextYear, current: false });
  }

  return cells;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export interface DatePickerModalProps {
  visible: boolean;
  title?: string;
  value?: Date | null;
  showTime?: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}

export function DatePickerModal({
  visible,
  title = 'Select Date',
  value,
  showTime = true,
  onClose,
  onConfirm,
}: DatePickerModalProps) {
  const theme = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();

  const today = new Date();

  const initFrom = (v: Date | null | undefined) => ({
    y: v ? v.getFullYear() : today.getFullYear(),
    mo: v ? v.getMonth() : today.getMonth(),
    d: v ? v.getDate() : today.getDate(),
    h: v ? v.getHours() : today.getHours(),
    mi: v ? v.getMinutes() : 0,
  });

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [selDay,    setSelDay]    = useState(today.getDate());
  const [selMonth,  setSelMonth]  = useState(today.getMonth());
  const [selYear,   setSelYear]   = useState(today.getFullYear());
  const [hour,      setHour]      = useState(today.getHours());
  const [minute,    setMinute]    = useState(0);

  useEffect(() => {
    if (visible) {
      const init = initFrom(value ?? null);
      setViewYear(init.y); setViewMonth(init.mo);
      setSelDay(init.d); setSelMonth(init.mo); setSelYear(init.y);
      setHour(init.h); setMinute(init.mi);
    }
  }, [visible]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (cell: CalendarDay) => {
    setSelDay(cell.day); setSelMonth(cell.month); setSelYear(cell.year);
    if (!cell.current) {
      setViewYear(cell.year); setViewMonth(cell.month);
    }
  };

  const isSelected = (cell: CalendarDay) =>
    cell.day === selDay && cell.month === selMonth && cell.year === selYear;

  const isToday = (cell: CalendarDay) =>
    cell.day === today.getDate() &&
    cell.month === today.getMonth() &&
    cell.year === today.getFullYear();

  const handleConfirm = () => {
    const date = new Date(selYear, selMonth, selDay, hour, minute, 0, 0);
    onConfirm(date);
    onClose();
  };

  const cells = buildCalendar(viewYear, viewMonth);
  const CELL_SIZE = Math.floor((screenWidth * 0.85 - 32) / 7);

  const formatTime = (h: number, m: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />

      <View style={s.centeredWrap} pointerEvents="box-none">
        <View style={[s.card, { backgroundColor: theme.surface, width: screenWidth * 0.9 }]}>

          {/* Header */}
          <View style={[s.cardHeader, { borderBottomColor: theme.border }]}>
            <Text style={[s.cardTitle, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
              <MaterialIcons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Month navigation */}
          <View style={s.monthNav}>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: theme.background }]} onPress={prevMonth} activeOpacity={0.7}>
              <MaterialIcons name="chevron-left" size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={[s.monthLabel, { color: theme.text }]}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: theme.background }]} onPress={nextMonth} activeOpacity={0.7}>
              <MaterialIcons name="chevron-right" size={22} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={s.weekRow}>
            {WEEKDAYS.map(wd => (
              <View key={wd} style={[s.cell, { width: CELL_SIZE, height: CELL_SIZE * 0.75 }]}>
                <Text style={[s.weekdayText, { color: theme.textMuted }]}>{wd}</Text>
              </View>
            ))}
          </View>

          {/* Calendar grid — 6 rows × 7 cols */}
          <View style={s.calGrid}>
            {cells.map((cell, idx) => {
              const sel = isSelected(cell);
              const tod = isToday(cell);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    s.cell,
                    { width: CELL_SIZE, height: CELL_SIZE },
                    sel && { backgroundColor: theme.primary, borderRadius: CELL_SIZE / 2 },
                    !sel && tod && { borderWidth: 1.5, borderColor: theme.primary, borderRadius: CELL_SIZE / 2 },
                  ]}
                  onPress={() => selectDay(cell)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    s.dayText,
                    { color: sel ? '#FFFFFF' : cell.current ? theme.text : theme.textMuted },
                    sel && { fontWeight: '700' },
                    tod && !sel && { color: theme.primary, fontWeight: '700' },
                  ]}>
                    {cell.day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Selected date display */}
          <View style={[s.selectedRow, { backgroundColor: theme.primaryBg }]}>
            <MaterialIcons name="calendar-today" size={14} color={theme.primary} />
            <Text style={[s.selectedText, { color: theme.primary }]}>
              {new Date(selYear, selMonth, selDay).toLocaleDateString('en-US', {
                weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>

          {/* Time picker */}
          {showTime && (
            <View style={[s.timeSection, { borderTopColor: theme.border }]}>
              <Text style={[s.timeSectionLabel, { color: theme.textMuted }]}>TIME</Text>
              <View style={s.timeRow}>

                {/* Hour */}
                <View style={s.timePart}>
                  <TouchableOpacity
                    style={[s.timeBtn, { backgroundColor: theme.background }]}
                    onPress={() => setHour(h => clamp(h + 1, 0, 23))}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="keyboard-arrow-up" size={20} color={theme.text} />
                  </TouchableOpacity>
                  <View style={[s.timeDisplay, { backgroundColor: theme.background }]}>
                    <Text style={[s.timeValue, { color: theme.text }]}>
                      {String(hour > 12 ? hour - 12 : hour === 0 ? 12 : hour).padStart(2, '0')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[s.timeBtn, { backgroundColor: theme.background }]}
                    onPress={() => setHour(h => clamp(h - 1, 0, 23))}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="keyboard-arrow-down" size={20} color={theme.text} />
                  </TouchableOpacity>
                </View>

                <Text style={[s.timeSep, { color: theme.text }]}>:</Text>

                {/* Minute */}
                <View style={s.timePart}>
                  <TouchableOpacity
                    style={[s.timeBtn, { backgroundColor: theme.background }]}
                    onPress={() => setMinute(m => m >= 55 ? 0 : m + 5)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="keyboard-arrow-up" size={20} color={theme.text} />
                  </TouchableOpacity>
                  <View style={[s.timeDisplay, { backgroundColor: theme.background }]}>
                    <Text style={[s.timeValue, { color: theme.text }]}>
                      {String(minute).padStart(2, '0')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[s.timeBtn, { backgroundColor: theme.background }]}
                    onPress={() => setMinute(m => m <= 4 ? 55 : m - 5)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="keyboard-arrow-down" size={20} color={theme.text} />
                  </TouchableOpacity>
                </View>

                {/* AM/PM */}
                <View style={s.ampmCol}>
                  <TouchableOpacity
                    style={[s.ampmBtn, hour < 12 && { backgroundColor: theme.primary }]}
                    onPress={() => setHour(h => h >= 12 ? h - 12 : h)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.ampmText, { color: hour < 12 ? '#FFFFFF' : theme.textMuted }]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.ampmBtn, hour >= 12 && { backgroundColor: theme.primary }]}
                    onPress={() => setHour(h => h < 12 ? h + 12 : h)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.ampmText, { color: hour >= 12 ? '#FFFFFF' : theme.textMuted }]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[s.timePreview, { color: theme.textSecondary }]}>{formatTime(hour, minute)}</Text>
            </View>
          )}

          {/* Confirm */}
          <TouchableOpacity
            style={[s.confirmBtn, { backgroundColor: theme.primary }]}
            onPress={handleConfirm}
            activeOpacity={0.85}
          >
            <MaterialIcons name="check" size={18} color="#FFFFFF" />
            <Text style={s.confirmText}>Confirm</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  centeredWrap:{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  card: { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  cardTitle:  { fontSize: 16, fontWeight: '700' },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  monthNav:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  monthLabel: { fontSize: 15, fontWeight: '700' },
  navBtn:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  weekRow:    { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 2 },
  calGrid:    { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
  cell:       { alignItems: 'center', justifyContent: 'center' },

  weekdayText:{ fontSize: 11, fontWeight: '600' },
  dayText:    { fontSize: 13 },

  selectedRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 10, marginBottom: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  selectedText: { fontSize: 13, fontWeight: '600' },

  timeSection:      { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  timeSectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  timeRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },

  timePart:    { alignItems: 'center', gap: 4 },
  timeBtn:     { width: 36, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  timeDisplay: { width: 52, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timeValue:   { fontSize: 22, fontWeight: '700' },
  timeSep:     { fontSize: 24, fontWeight: '700', marginBottom: 8 },

  ampmCol:  { gap: 4 },
  ampmBtn:  { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  ampmText: { fontSize: 13, fontWeight: '700' },

  timePreview: { fontSize: 12, textAlign: 'center', marginTop: 8 },

  confirmBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 16, marginTop: 12, marginBottom: 16, borderRadius: 14, paddingVertical: 14 },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
