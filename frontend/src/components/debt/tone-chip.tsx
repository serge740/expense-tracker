// Ported from expo_app/components/debt/tone-chip.tsx
import React from 'react';
import { StyleSheet, View } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { Tone } from '@/utils/debt';

export const OWE = '#DC2626';
export const OWED = '#16A34A';
const AMBER = '#D97706';

/** Foreground colour for a tone. */
export function toneColor(tone: Tone, primary: string, muted: string) {
  return tone === 'green' ? OWED : tone === 'red' ? OWE : tone === 'amber' ? AMBER : tone === 'blue' ? primary : muted;
}

/** Small rounded status label (Paid, Overdue, Borrowed…). */
export function ToneChip({ label, tone }: { label: string; tone: Tone }) {
  const theme = useAppTheme();
  const color = toneColor(tone, theme.primary, theme.textMuted);
  return (
    <View style={[s.chip, { backgroundColor: tone === 'muted' ? theme.inputBg : `${color}1F` }]}>
      <Text style={[s.text, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start' },
  text: { fontSize: 10, fontWeight: '700' },
});
