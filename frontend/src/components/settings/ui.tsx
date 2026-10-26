// Ported from expo_app/components/settings/ui.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Switch, ViewStyle, StyleProp } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { useSettingsBack } from '@/hooks/use-settings-back';
import { Text } from '@/components/text';
import { useAppTheme, AppTheme } from '@/hooks/use-app-theme';

export type IconName = string;

// ── Screen shell with back header ─────────────────────────────────────────
export function SettingsScreen({
  title, subtitle, right, children,
}: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const theme = useAppTheme();
  const goBack = useSettingsBack();
  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <View style={s.header}>
        <TouchableOpacity
          style={[s.back, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={goBack}
          activeOpacity={0.7}
          hitSlop={6}
        >
          <MaterialIcons name="arrow-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.text }]}>{title}</Text>
          {subtitle ? <Text style={[s.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Grouped section ───────────────────────────────────────────────────────
/** The small grey heading used above a group, for groups made of custom panels instead of rows. */
export function SectionTitle({ title }: { title: string }) {
  const theme = useAppTheme();
  return <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{title}</Text>;
}

export function Section({ title, children, style }: { title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useAppTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ marginBottom: 18 }, style]}>
      {title ? <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{title}</Text> : null}
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < items.length - 1 && <View style={[s.sep, { backgroundColor: theme.border }]} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────
export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';
export function Badge({ label, tone = 'muted' }: { label: string; tone?: BadgeTone }) {
  const theme = useAppTheme();
  const c = toneColors(tone, theme);
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <Text style={[s.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function toneColors(tone: BadgeTone, theme: AppTheme) {
  switch (tone) {
    case 'ok':     return { fg: theme.isDark ? '#4ADE80' : '#15803D', bg: theme.isDark ? 'rgba(74,222,128,0.14)' : '#DCFCE7' };
    case 'warn':   return { fg: theme.isDark ? '#FBBF24' : '#B45309', bg: theme.isDark ? 'rgba(251,191,36,0.14)' : '#FEF3C7' };
    case 'danger': return { fg: theme.isDark ? '#F87171' : '#B91C1C', bg: theme.isDark ? 'rgba(248,113,113,0.14)' : '#FEE2E2' };
    case 'info':   return { fg: theme.primary, bg: theme.primaryBg };
    default:       return { fg: theme.textSecondary, bg: theme.isDark ? 'rgba(255,255,255,0.06)' : '#EEF3F5' };
  }
}

// ── Row ───────────────────────────────────────────────────────────────────
type RowProps = {
  icon: IconName;
  title: string;
  sub?: string;
  value?: string;
  badge?: { label: string; tone?: BadgeTone };
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };
  danger?: boolean;
  iconColor?: string;
  /** Replaces the icon tile content (e.g. a brand logo). */
  leading?: React.ReactNode;
};

export function Row({ icon, title, sub, value, badge, onPress, toggle, danger, iconColor, leading }: RowProps) {
  const theme = useAppTheme();
  const accent = danger ? (theme.isDark ? '#F87171' : '#DC2626') : iconColor ?? theme.primary;
  const body = (
    <View style={s.row}>
      <View style={[s.iconTile, { backgroundColor: danger ? toneColors('danger', theme).bg : theme.primaryBg }]}>
        {leading ?? <MaterialIcons name={icon} size={17} color={accent} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, { color: danger ? accent : theme.text }]}>{title}</Text>
        {sub ? <Text style={[s.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {badge && <Badge label={badge.label} tone={badge.tone} />}
      {value ? <Text style={[s.value, { color: theme.textSecondary }]}>{value}</Text> : null}
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          disabled={toggle.disabled}
          trackColor={{ false: theme.isDark ? '#2A3A40' : '#D5DFE3', true: theme.primary }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={theme.isDark ? '#2A3A40' : '#D5DFE3'}
        />
      ) : onPress ? (
        <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
      ) : null}
    </View>
  );
  if (!onPress || toggle) return body;
  return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{body}</TouchableOpacity>;
}

// ── Choice chips (for small option sets) ──────────────────────────────────
export function Chips<T extends string | number>({
  options, value, onChange,
}: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  const theme = useAppTheme();
  return (
    <View style={s.chips}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            activeOpacity={0.8}
            style={[s.chip, {
              backgroundColor: active ? theme.primary : theme.surface,
              borderColor: active ? theme.primary : theme.border,
            }]}
          >
            <Text style={[s.chipText, { color: active ? '#FFFFFF' : theme.text }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Labeled block inside a Section for chips / steppers. */
export function OptionBlock({ icon, title, sub, children }: { icon: IconName; title: string; sub?: string; children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={s.optionBlock}>
      <View style={[s.row, { paddingHorizontal: 0, paddingVertical: 0, marginBottom: 10 }]}>
        <View style={[s.iconTile, { backgroundColor: theme.primaryBg }]}>
          <MaterialIcons name={icon} size={17} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowTitle, { color: theme.text }]}>{title}</Text>
          {sub ? <Text style={[s.rowSub, { color: theme.textSecondary }]}>{sub}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** − value + stepper. */
export function Stepper({ label, onMinus, onPlus }: { label: string; onMinus: () => void; onPlus: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={[s.stepper, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
      <TouchableOpacity onPress={onMinus} hitSlop={8} style={s.stepBtn}>
        <MaterialIcons name="remove" size={16} color={theme.primary} />
      </TouchableOpacity>
      <Text style={[s.stepLabel, { color: theme.text }]}>{label}</Text>
      <TouchableOpacity onPress={onPlus} hitSlop={8} style={s.stepBtn}>
        <MaterialIcons name="add" size={16} color={theme.primary} />
      </TouchableOpacity>
    </View>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  return <Text style={[s.hint, { color: theme.textMuted }]}>{children}</Text>;
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  back:   { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:  { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },

  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 7, marginLeft: 4 },
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  sep:  { height: 1, marginLeft: 58 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  iconTile: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13, fontWeight: '600' },
  rowSub:   { fontSize: 11, marginTop: 1 },
  value:    { fontSize: 12 },

  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  optionBlock: { paddingHorizontal: 14, paddingVertical: 12 },
  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: '600' },

  stepper:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, height: 34, paddingHorizontal: 6 },
  stepBtn:   { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 12, fontWeight: '600', minWidth: 64, textAlign: 'center' },

  hint: { fontSize: 11, lineHeight: 16, marginTop: -10, marginBottom: 18, marginHorizontal: 4 },
});
