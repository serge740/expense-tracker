import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { OWE, OWED } from '@/components/debt/tone-chip';
import { agendaTitle, openAgendaItem, useWhen } from '@/components/home/schedule-cards';
import { getAgenda } from '@/services/home.service';
import type { AgendaItem } from '@/utils/schedule-agenda';

/** A reminder is missed when its date has passed and nobody has confirmed, paid or skipped it yet. */
export const missedOf = (items: AgendaItem[]): AgendaItem[] => items.filter(i => i.overdue);

/** The missed reminders, refreshed whenever the screen comes into view. Empty (and quiet) if they cannot be loaded. */
export function useMissed(enabled = true): AgendaItem[] {
  const [items, setItems] = useState<AgendaItem[]>([]);
  useFocusEffect(useCallback(() => {
    if (!enabled) { setItems([]); return undefined; }
    let live = true;
    getAgenda().then(a => { if (live) setItems(missedOf(a.items)); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [enabled]));
  return items;
}

/** The Home stats card. Nothing at all when there is nothing missed. */
export function MissedCard({ items }: { items: AgendaItem[] }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <TouchableOpacity testID="missed-card" activeOpacity={0.85} onPress={() => router.push('/(dashboard)/scheduled?status=overdue' as any)} accessibilityRole="button"
                      style={[s.card, { backgroundColor: `${OWE}14`, borderColor: `${OWE}55` }]}>
      <View style={[s.badge, { backgroundColor: `${OWE}22` }]}><MaterialIcons name="alarm" size={18} color={OWE} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: theme.text }]}>{t('missed.title')}</Text>
        <Text style={[s.sub, { color: theme.textSecondary }]} numberOfLines={2}>{t('missed.count', { n: items.length })} · {t('missed.hint')}</Text>
      </View>
      <Text style={[s.num, { color: OWE }]}>{items.length}</Text>
      <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

/** History: a "Missed" chip that opens the list of missed reminders. Hidden when there are none. */
export function MissedFilter({ items, hidden }: { items: AgendaItem[]; hidden: boolean }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const when = useWhen();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <View style={s.wrap}>
      <TouchableOpacity testID="chip-missed" onPress={() => setOpen(o => !o)} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: open }}
                        style={[s.chip, { backgroundColor: open ? OWE : `${OWE}14`, borderColor: open ? OWE : `${OWE}55` }]}>
        <MaterialIcons name="alarm" size={15} color={open ? '#FFFFFF' : OWE} />
        <Text style={[s.chipText, { color: open ? '#FFFFFF' : OWE }]}>{t('missed.chip')} · {items.length}</Text>
      </TouchableOpacity>
      {open ? (
        <View testID="missed-list" style={[s.list, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {items.map((i, idx) => (
            <TouchableOpacity key={i.key} testID="missed-row" activeOpacity={0.8} onPress={() => openAgendaItem(i)} accessibilityRole="button"
                              style={[s.row, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>{agendaTitle(i, t)}</Text>
                <Text style={[s.sub, { color: OWE }]} numberOfLines={1}>{when(i.dueAt)} · {formatDate(i.dueAt, { day: 'numeric', month: 'short' })}</Text>
              </View>
              {i.amount != null ? <Text style={[s.rowAmount, { color: i.direction === 'IN' ? OWED : theme.text }]}>{i.direction === 'IN' ? '+' : ''}{formatMoney(i.amount, i.currency || 'RWF', { hidden })}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  num: { fontSize: 22, fontWeight: '800' },
  wrap: { paddingHorizontal: 16, paddingTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, minHeight: 36 },
  chipText: { fontSize: 13, fontWeight: '700' },
  list: { borderWidth: 1, borderRadius: 14, marginTop: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowAmount: { fontSize: 13, fontWeight: '700' },
});
