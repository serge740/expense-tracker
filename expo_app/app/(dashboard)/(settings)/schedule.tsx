import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePreferences, MeetingApp } from '@/context/preferences-context';
import { SettingsScreen, Section, Row, Chips, OptionBlock, Stepper, Hint } from '@/components/settings/ui';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STEP = 30; // minutes

export default function ScheduleScreen() {
  const { prefs, setPref, formatTime } = usePreferences();

  const shift = (key: 'workStart' | 'workEnd', delta: number) => {
    const next = Math.max(0, Math.min(24 * 60 - STEP, prefs[key] + delta));
    if (key === 'workStart' && next >= prefs.workEnd) return;
    if (key === 'workEnd' && next <= prefs.workStart) return;
    setPref(key, next);
  };

  const toggleDay = (d: number) => {
    const has = prefs.workDays.includes(d);
    if (has && prefs.workDays.length === 1) return; // keep at least one day
    setPref('workDays', has ? prefs.workDays.filter(x => x !== d) : [...prefs.workDays, d].sort());
  };

  const hours = ((prefs.workEnd - prefs.workStart) / 60) * prefs.workDays.length;

  return (
    <SettingsScreen title="Meetings & schedule" subtitle="Defaults for meetings and your work week">
      <Section title="MEETINGS">
        <OptionBlock icon="timer" title="Default duration" sub="Used when you create a new meeting">
          <Chips
            value={prefs.meetingDuration}
            onChange={v => setPref('meetingDuration', v)}
            options={[15, 30, 45, 60, 90].map(m => ({ label: m < 60 ? `${m} min` : `${m / 60}${m % 60 ? '.5' : ''} h`, value: m }))}
          />
        </OptionBlock>
        <OptionBlock icon="alarm" title="Reminder" sub="Notify me before a meeting starts">
          <Chips
            value={prefs.meetingReminder}
            onChange={v => setPref('meetingReminder', v)}
            options={[
              { label: 'Off', value: 0 }, { label: '5 min', value: 5 }, { label: '10 min', value: 10 },
              { label: '15 min', value: 15 }, { label: '30 min', value: 30 }, { label: '1 h', value: 60 },
            ]}
          />
        </OptionBlock>
        <OptionBlock icon="videocam" title="Meeting type" sub="Default location for new meetings">
          <Chips<MeetingApp>
            value={prefs.meetingApp}
            onChange={v => setPref('meetingApp', v)}
            options={[
              { label: 'Google Meet', value: 'meet' }, { label: 'Zoom', value: 'zoom' },
              { label: 'Teams', value: 'teams' }, { label: 'In person', value: 'in-person' },
            ]}
          />
        </OptionBlock>
      </Section>

      <Section title="WORKING HOURS">
        <OptionBlock icon="schedule" title="Hours" sub={`${formatTime(prefs.workStart)} – ${formatTime(prefs.workEnd)}`}>
          <StepRow
            start={<Stepper label={formatTime(prefs.workStart)} onMinus={() => shift('workStart', -STEP)} onPlus={() => shift('workStart', STEP)} />}
            end={<Stepper label={formatTime(prefs.workEnd)} onMinus={() => shift('workEnd', -STEP)} onPlus={() => shift('workEnd', STEP)} />}
          />
        </OptionBlock>
        <OptionBlock icon="date-range" title="Work days" sub={`${prefs.workDays.length} days · ${hours} h per week`}>
          <DayPicker selected={prefs.workDays} onToggle={toggleDay} />
        </OptionBlock>
      </Section>

      <Section title="FOCUS">
        <Row icon="do-not-disturb-on" title="Focus time" sub="Silence non-urgent alerts during focus blocks"
             toggle={{ value: prefs.focusTime, onChange: v => setPref('focusTime', v) }} />
        <Row icon="event-busy" title="Decline outside work hours" sub="Auto-decline invites outside your hours"
             toggle={{ value: prefs.autoDecline, onChange: v => setPref('autoDecline', v) }} />
      </Section>
      <Hint>These defaults are saved on this device.</Hint>
    </SettingsScreen>
  );
}

// ── Local helpers ─────────────────────────────────────────────────────────

function StepRow({ start, end }: { start: React.ReactNode; end: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={s.stepRow}>
      <View style={{ flex: 1 }}>
        <Text style={[s.stepCaption, { color: theme.textMuted }]}>START</Text>
        {start}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.stepCaption, { color: theme.textMuted }]}>END</Text>
        {end}
      </View>
    </View>
  );
}

function DayPicker({ selected, onToggle }: { selected: number[]; onToggle: (d: number) => void }) {
  const theme = useAppTheme();
  return (
    <View style={s.days}>
      {DAYS.map((d, i) => {
        const on = selected.includes(i);
        return (
          <TouchableOpacity
            key={i}
            onPress={() => onToggle(i)}
            activeOpacity={0.8}
            style={[s.day, { backgroundColor: on ? theme.primary : theme.inputBg, borderColor: on ? theme.primary : theme.border }]}
          >
            <Text style={[s.dayText, { color: on ? '#FFFFFF' : theme.textSecondary }]}>{d}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  stepRow:     { flexDirection: 'row', gap: 10 },
  stepCaption: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 5, marginLeft: 2 },
  days:        { flexDirection: 'row', justifyContent: 'space-between' },
  day:         { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayText:     { fontSize: 12, fontWeight: '700' },
});
