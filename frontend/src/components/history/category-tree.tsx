import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { CATEGORIES, categoryLabelKey, categoryOf, type CategorySlug } from '@/constants/categories';
import { cyclePick, mergeKinds, pickState, visibleSubs, type Facets, type FacetCategory, type HistoryFilter, type PickState } from '@/utils/history';

const ICON: Record<PickState, string> = { none: 'check-box-outline-blank', include: 'check-box', some: 'indeterminate-check-box', exclude: 'block' };

/**
 * The category filter: the categories this person has used (with counts that follow their other filters), their
 * sub-categories with the last time each was used, tri-state boxes, "tap again to leave out", and a switch to see all.
 */
export function CategoryTree({ facets, loading, filter, onChange }: { facets: Facets | null; loading: boolean; filter: HistoryFilter; onChange: (f: HistoryFilter) => void }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState<Record<string, boolean>>({});

  const used = useMemo(() => mergeKinds(facets?.categories ?? []), [facets]);
  const rows = useMemo(() => {
    const have = new Set(used.map(c => c.category));
    const unused: FacetCategory[] = showAll
      ? CATEGORIES.filter(c => !c.system && !have.has(c.id)).map(c => ({ category: c.id, kind: c.for.includes('EXPENSE') ? 'EXPENSE' : 'INCOME', count: 0, lastUsed: null, noSub: 0, subs: [] }))
      : [];
    return [...used, ...unused];
  }, [used, showAll]);
  const nameOf = (c: FacetCategory) => t(categoryLabelKey(c.category, c.kind) as any);
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter(c => nameOf(c).toLowerCase().includes(q) || c.subs.some(s => s.name.toLowerCase().includes(q))) : rows;
  const allCount = CATEGORIES.filter(c => !c.system).length;

  return (
    <View testID="category-tree">
      <View style={s.top}>
        <View style={[s.toggle, { backgroundColor: theme.surface2 }]}>
          <TouchableOpacity testID="cats-used" onPress={() => setShowAll(false)} accessibilityRole="button" accessibilityState={{ selected: !showAll }} style={[s.toggleBtn, !showAll && { backgroundColor: theme.primary }]}>
            <Text style={[s.toggleText, { color: !showAll ? (theme.isDark ? '#07202A' : '#FFFFFF') : theme.textSecondary }]}>{t('filter.used', { n: used.length })}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="cats-all" onPress={() => setShowAll(true)} accessibilityRole="button" accessibilityState={{ selected: showAll }} style={[s.toggleBtn, showAll && { backgroundColor: theme.primary }]}>
            <Text style={[s.toggleText, { color: showAll ? (theme.isDark ? '#07202A' : '#FFFFFF') : theme.textSecondary }]}>{t('filter.allCats', { n: allCount })}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={[s.search, { backgroundColor: theme.surface2 }]}>
        <MaterialIcons name="search" size={20} color={theme.textSecondary} />
        <TextInput value={query} onChangeText={setQuery} placeholder={t('filter.findCat')} placeholderTextColor={theme.textMuted} style={[s.searchInput, { color: theme.text }]} />
      </View>
      <View style={s.hint}><MaterialIcons name="touch-app" size={14} color={theme.textSecondary} /><Text style={{ color: theme.textSecondary, fontSize: 11.5, flex: 1, lineHeight: 15 }}>{t('filter.hint')}</Text></View>

      {loading && !facets ? <Text style={{ color: theme.textMuted, fontSize: 12.5, paddingVertical: 12 }}>…</Text> : null}
      {!loading && shown.length === 0 ? <Text style={{ color: theme.textMuted, fontSize: 12.5, paddingVertical: 12 }}>{t('filter.noCats')}</Text> : null}

      {shown.map(c => {
        const def = categoryOf(c.category as CategorySlug);
        const state = pickState(filter, { c: c.category });
        const isOpen = q ? true : (open[c.category] ?? (state === 'some' || state === 'include'));
        const { shown: subs, hidden } = visibleSubs(q ? c.subs.filter(x => x.name.toLowerCase().includes(q) || nameOf(c).toLowerCase().includes(q)) : c.subs, !!more[c.category]);
        const color = state === 'exclude' ? theme.negative : state === 'none' ? theme.textMuted : theme.primary;
        return (
          <View key={c.category} testID={`cat-${c.category}`}>
            <View style={[s.row, { borderBottomColor: theme.border, opacity: c.count === 0 ? 0.5 : 1 }]}>
              <TouchableOpacity testID={`cat-box-${c.category}`} onPress={() => onChange(cyclePick(filter, { c: c.category }))} accessibilityRole="checkbox" accessibilityState={{ checked: state === 'include' }} accessibilityLabel={nameOf(c)} style={s.box}>
                <MaterialIcons name={ICON[state]} size={24} color={color} />
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setOpen(o => ({ ...o, [c.category]: !isOpen }))} accessibilityRole="button" style={s.rowMain}>
                <View style={[s.dot, { backgroundColor: `${def.color}26` }]}><MaterialIcons name={def.icon} size={16} color={def.color} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.name, { color: state === 'exclude' ? theme.negative : theme.text }]} numberOfLines={1}>{nameOf(c)}{state === 'exclude' ? ' ✕' : ''}</Text>
                  {c.kind === 'INCOME' ? <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{t('filter.incomeCat')}</Text> : c.count === 0 ? <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{t('filter.unused')}</Text> : null}
                </View>
                <Text style={[s.count, { color: theme.textSecondary }]}>{c.count}</Text>
                {c.subs.length || c.noSub ? <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={20} color={theme.textMuted} /> : null}
              </TouchableOpacity>
            </View>
            {isOpen ? (
              <View>
                {subs.map(sub => {
                  const p = { c: c.category, s: sub.name };
                  const st = pickState(filter, p);
                  return (
                    <View key={sub.name} testID={`sub-${c.category}-${sub.name}`} style={[s.row, s.subRow, { borderBottomColor: theme.border }]}>
                      <TouchableOpacity onPress={() => onChange(cyclePick(filter, p))} accessibilityRole="checkbox" accessibilityState={{ checked: st === 'include' }} accessibilityLabel={sub.name} style={s.box}>
                        <MaterialIcons name={ICON[st]} size={24} color={st === 'exclude' ? theme.negative : st === 'none' ? theme.textMuted : theme.primary} />
                      </TouchableOpacity>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: st === 'exclude' ? theme.negative : theme.text, fontSize: 13.5 }} numberOfLines={1}>{sub.name}{st === 'exclude' ? ' ✕' : ''}</Text>
                        {sub.lastUsed ? <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{t('filter.lastUsed', { date: formatDate(sub.lastUsed, { day: 'numeric', month: 'short' }) })}</Text> : null}
                      </View>
                      <Text style={[s.count, { color: theme.textSecondary }]}>{sub.count}</Text>
                    </View>
                  );
                })}
                {c.noSub > 0 && !q ? (() => {
                  const p = { c: c.category, none: true };
                  const st = pickState(filter, p);
                  return (
                    <View style={[s.row, s.subRow, { borderBottomColor: theme.border }]}>
                      <TouchableOpacity onPress={() => onChange(cyclePick(filter, p))} accessibilityRole="checkbox" accessibilityState={{ checked: st === 'include' }} style={s.box}>
                        <MaterialIcons name={ICON[st]} size={24} color={st === 'exclude' ? theme.negative : st === 'none' ? theme.textMuted : theme.primary} />
                      </TouchableOpacity>
                      <Text style={{ flex: 1, color: theme.text, fontSize: 13.5 }} numberOfLines={1}>{t('filter.noSub', { cat: nameOf(c) })}</Text>
                      <Text style={[s.count, { color: theme.textSecondary }]}>{c.noSub}</Text>
                    </View>
                  );
                })() : null}
                {hidden > 0 ? (
                  <TouchableOpacity onPress={() => setMore(m => ({ ...m, [c.category]: true }))} accessibilityRole="button" style={[s.row, s.subRow, { borderBottomColor: theme.border }]}>
                    <View style={s.box} /><Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>{t('filter.showMore', { n: hidden })}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  toggle: { flexDirection: 'row', padding: 3, borderRadius: 99 },
  toggleBtn: { height: 32, paddingHorizontal: 12, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 12, fontWeight: '600' },
  search: { minHeight: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, borderWidth: 0, backgroundColor: 'transparent', paddingVertical: 8, outlineStyle: 'none' as any },
  hint: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 8, marginBottom: 4 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  subRow: { paddingLeft: 30 },
  box: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13.5, fontWeight: '600' },
  count: { fontSize: 12, minWidth: 24, textAlign: 'right' },
});
