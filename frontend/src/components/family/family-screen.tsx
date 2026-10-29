// Ported from expo_app/components/family/family-screen.tsx
import React, { type ReactNode } from 'react';
import { ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';

/** The frame of every family screen: a back button, a title and a scrolling body, in the app's colours. */
export function FamilyScreen({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack: () => void; children: ReactNode }) {
  const theme = useAppTheme();
  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <View style={s.header}>
        <TouchableOpacity testID="family-back" onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back"
                          style={[s.round, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MaterialIcons name="arrow-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[s.subtitle, { color: theme.textMuted }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A small section label above a group of rows. */
export function FamilySection({ text }: { text: string }) {
  const theme = useAppTheme();
  return <Text style={[s.section, { color: theme.textMuted }]}>{text}</Text>;
}

/** A framed note: neutral, warning or error. */
export function FamilyNote({ text, tone = 'neutral', testID }: { text: string; tone?: 'neutral' | 'warn' | 'error'; testID?: string }) {
  const theme = useAppTheme();
  const palette = tone === 'error' ? { bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.35)', fg: '#B91C1C' }
    : tone === 'warn' ? { bg: 'rgba(217,119,6,0.10)', border: 'rgba(217,119,6,0.40)', fg: '#92400E' }
    : { bg: theme.primaryBg, border: theme.border, fg: theme.textSecondary };
  return (
    <View testID={testID} style={[s.note, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[s.noteText, { color: palette.fg }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  round: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 1 },
  body: { paddingHorizontal: 20, paddingBottom: 140 },
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  note: { borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 8 },
  noteText: { fontSize: 12.5, lineHeight: 18 },
});
