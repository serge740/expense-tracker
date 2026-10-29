// Ported from expo_app/components/family/member-filter.tsx
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import type { FamilyMemberRow } from '@/services/family.service';

/** "Everyone · Aline · Grace": show only what one family member added. `value` is a member's id, or null for everyone. */
export function MemberFilter({ members, value, onChange }: { members: FamilyMemberRow[]; value: string | null; onChange: (id: string | null) => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  if (members.length < 2) return null;
  const chips: Array<{ id: string | null; label: string }> = [
    { id: null, label: t('family.hist.everyone') },
    ...members.map(m => ({ id: m.clientId, label: m.isYou ? t('family.tx.you') : m.name.split(' ')[0] })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} testID="member-filter">
      {chips.map(c => {
        const on = c.id === value;
        return (
          <TouchableOpacity key={c.id ?? 'everyone'} testID={`member-filter-${c.id ?? 'everyone'}`} onPress={() => onChange(c.id)} activeOpacity={0.85}
                            accessibilityRole="button" accessibilityState={{ selected: on }}
                            style={[s.chip, { backgroundColor: on ? theme.primary : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
            <Text style={[s.text, { color: on ? '#FFFFFF' : theme.textSecondary }]}>{c.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 4, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  text: { fontSize: 12.5, fontWeight: '700' },
});
