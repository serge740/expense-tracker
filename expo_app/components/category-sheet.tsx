import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, TouchableOpacity, TextInput, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { CategoryDef, CategorySlug, categoryLabelKey } from '@/constants/categories';
import { groupKey, groupsOf } from '@/constants/category-catalog';
import {
  Kind, MySubCategory, asMySubCategories, categoriesFor, cleanSubCategory, fold, frequentCategories, isOwnName, itemsOf, mineFor, searchEverything, searchWithin,
} from '@/utils/category-search';

interface Props {
  visible: boolean;
  kind: Kind;
  category: CategorySlug;
  subCategory: string | null;
  /** The person's own list (what they typed or picked before). */
  mine: MySubCategory[];
  /** Open on the subcategory step for the current category (when one is already chosen) instead of the category grid. */
  startOnSub?: boolean;
  onClose: () => void;
  onSelect: (category: CategorySlug, subCategory: string | null) => void;
  /** Take one off their own list. */
  onForget: (row: MySubCategory) => void;
}

/**
 * Two steps in one bottom sheet: pick a category (all of them on one screen), then pick what it was (group tabs, search,
 * and the person's own items first). Anything typed is saved to their private list by the server when the transaction is saved.
 */
export function CategorySheet({ visible, kind, category, subCategory, mine: given, startOnSub, onClose, onSelect, onForget }: Props) {
  const mine = useMemo(() => asMySubCategories(given), [given]);
  const theme = useAppTheme();
  const { t } = useI18n();
  const [view, setView] = useState<'main' | 'sub'>('main');
  const [picked, setPicked] = useState<CategorySlug>(category);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState(0);
  const [edit, setEdit] = useState(false);

  // Every time it opens it starts fresh: on the current category's items if one is chosen, otherwise on the grid.
  useEffect(() => {
    if (!visible) return;
    setView(startOnSub ? 'sub' : 'main');
    setPicked(category);
    setQuery(''); setDraft(''); setTab(0); setEdit(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (slug: CategorySlug) => t(categoryLabelKey(slug, kind) as any);
  const cats = useMemo(() => categoriesFor(kind), [kind]);
  const def: CategoryDef = cats.find(c => c.id === picked) ?? cats[0];
  const tile = (c: CategoryDef, size: number, icon: number) => (
    <View style={[s.tile, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: `${c.color}22` }]}>
      <MaterialIcons name={c.icon} size={icon} color={c.color} />
    </View>
  );

  const choose = (slug: CategorySlug, sub: string | null) => onSelect(slug, sub);

  // ── step 1: the categories ────────────────────────────────────────────────
  const hits = useMemo(() => searchEverything(kind, query, mine, label), [kind, query, mine, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const frequent = useMemo(() => frequentCategories(kind, mine), [kind, mine]);

  const mainView = (
    <>
      <View style={s.headRow}>
        <Text style={[s.h, { color: theme.text }]}>{t('catsheet.title')}</Text>
        <CloseButton onPress={onClose} />
      </View>
      <View style={[s.search, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
        <MaterialIcons name="search" size={19} color={theme.textMuted} />
        <TextInput
          value={query} onChangeText={setQuery} placeholder={t('catsheet.search')} placeholderTextColor={theme.textMuted}
          style={[s.searchInput, { color: theme.text }]} autoCorrect={false} accessibilityLabel={t('catsheet.search')}
        />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={s.body}>
        {query.trim() ? (
          <>
            <Text style={[s.sec, { color: theme.textMuted }]}>{t('catsheet.results')}</Text>
            {hits.length === 0 ? <Text style={[s.empty, { color: theme.textMuted }]}>{t('catsheet.noMatch')}</Text> : hits.map((h, i) => {
              const c = cats.find(x => x.id === h.category)!;
              return (
                <TouchableOpacity key={`${h.category}-${h.sub}-${i}`} style={[s.rowBtn, { borderBottomColor: theme.border }]} activeOpacity={0.7}
                                  onPress={() => (h.sub ? choose(h.category, h.sub) : (setPicked(h.category), setDraft(''), setTab(0), setEdit(false), setView('sub')))}>
                  {tile(c, 34, 19)}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>
                      {h.sub ?? label(h.category)}{h.alias ? <Text style={{ color: theme.textMuted, fontWeight: '500' }}>{`  ·  ${h.alias}`}</Text> : null}
                    </Text>
                    <Text style={[s.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>
                      {h.sub ? `${label(h.category)}${h.group && h.group !== 'all' ? ` · ${t(groupKey(h.category, h.group) as any)}` : ''}` : t('add.category')}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <>
            {frequent.length > 0 && (
              <>
                <Text style={[s.sec, { color: theme.textMuted }]}>{t('catsheet.frequent')}</Text>
                <View style={s.pills}>
                  {frequent.map(c => (
                    <TouchableOpacity key={c.id} activeOpacity={0.8} onPress={() => { setPicked(c.id); setDraft(''); setTab(0); setEdit(false); setView('sub'); }}
                                      style={[s.pill, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
                      {tile(c, 24, 15)}
                      <Text style={[s.pillText, { color: theme.text }]}>{label(c.id)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <Text style={[s.sec, { color: theme.textMuted }]}>{t('catsheet.all')}</Text>
            <View style={s.grid}>
              {cats.map(c => {
                const on = c.id === category;
                return (
                  <TouchableOpacity key={c.id} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={label(c.id)}
                                    onPress={() => { setPicked(c.id); setDraft(''); setTab(0); setEdit(false); setView('sub'); }}
                                    style={[s.cell, on && { borderColor: theme.primary, backgroundColor: theme.primaryBg }]}>
                    {tile(c, 44, 23)}
                    <Text style={[s.cellText, { color: on ? theme.text : theme.textSecondary }]} numberOfLines={2}>{label(c.id)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );

  // ── step 2: what was it ───────────────────────────────────────────────────
  const groups = groupsOf(kind, picked).filter(g => g.id !== 'all');
  const own = mineFor(mine, kind, picked);
  const typed = draft.trim();
  const found = typed ? searchWithin(kind, picked, draft, mine) : null;
  const exampleItem = itemsOf(kind, picked)[3] ?? itemsOf(kind, picked)[0];
  const group = groups[Math.min(tab, Math.max(groups.length - 1, 0))];

  const addTyped = () => {
    const name = cleanSubCategory(draft);
    if (!name) return;
    // Typing something that is already there uses that spelling.
    const existing = itemsOf(kind, picked).find(i => fold(i.name) === fold(name))?.name ?? own.find(m => fold(m.name) === fold(name))?.name;
    choose(picked, existing ?? name);
  };

  const Chip = ({ name, mine: row, extra }: { name: string; mine?: MySubCategory; extra?: string }) => {
    const on = subCategory !== null && fold(subCategory) === fold(name) && category === picked;
    const custom = !!row && isOwnName(kind, picked, name);
    return (
      <View style={[s.chip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryBg : theme.inputBg }]}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => choose(picked, name)} accessibilityRole="button" accessibilityLabel={name} style={s.chipMain}>
          {custom ? <MaterialIcons name="person" size={14} color={theme.primary} /> : null}
          <Text style={[s.chipText, { color: on ? theme.primary : theme.text, fontWeight: on ? '700' : '500' }]}>{name}</Text>
          {extra ? <Text style={[s.chipExtra, { color: theme.textMuted }]}>{extra}</Text> : null}
        </TouchableOpacity>
        {edit && row ? (
          <TouchableOpacity onPress={() => onForget(row)} hitSlop={8} accessibilityLabel={t('catsheet.remove', { name })}>
            <MaterialIcons name="cancel" size={16} color="#DC2626" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const subView = (
    <>
      <View style={s.headRow}>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]} onPress={() => setView('main')} accessibilityLabel={t('catsheet.back')}>
          <MaterialIcons name="arrow-back" size={18} color={theme.text} />
        </TouchableOpacity>
        {tile(def, 34, 19)}
        <View style={{ flex: 1 }}>
          <Text style={[s.catName, { color: theme.text }]} numberOfLines={1}>{label(def.id)}</Text>
          <Text style={[s.step, { color: theme.textSecondary }]}>{t('catsheet.step2')}</Text>
        </View>
        <CloseButton onPress={onClose} />
      </View>

      <View style={[s.typed, { backgroundColor: theme.inputBg, borderColor: theme.primary }]}>
        <MaterialIcons name="search" size={19} color={theme.primary} />
        <TextInput
          value={draft} onChangeText={setDraft} maxLength={40} autoCorrect={false} returnKeyType="done" onSubmitEditing={addTyped}
          placeholder={exampleItem ? t('catsheet.typeHint', { example: exampleItem.name }) : t('catsheet.typeOwn')} placeholderTextColor={theme.textMuted}
          style={[s.searchInput, { color: theme.text }]} accessibilityLabel={t('catsheet.typeOwn')}
        />
        <TouchableOpacity disabled={!typed} onPress={addTyped} activeOpacity={0.85} accessibilityRole="button"
                          style={[s.addBtn, { backgroundColor: theme.buttonBg }, !typed && { opacity: 0.35 }]}>
          <Text style={s.addBtnText}>{found?.exact ? t('catsheet.use') : t('catsheet.add')}</Text>
        </TouchableOpacity>
      </View>

      {!typed && groups.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
          {groups.map((g, i) => (
            <TouchableOpacity key={g.id} onPress={() => setTab(i)} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: i === tab }}
                              style={[s.tab, { borderColor: i === tab ? theme.primary : theme.border, backgroundColor: i === tab ? theme.buttonBg : theme.inputBg }]}>
              <Text style={[s.tabText, { color: i === tab ? '#fff' : theme.textSecondary }]}>{t(groupKey(picked, g.id) as any)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={s.body}>
        {found ? (
          <>
            {found.yours.length > 0 && (<><Text style={[s.sec, { color: theme.textMuted }]}>{t('catsheet.yours')}</Text><View style={s.chips}>{found.yours.map(m => <Chip key={m.id} name={m.name} mine={m} />)}</View></>)}
            {found.found.length > 0 && (
              <>
                <Text style={[s.sec, { color: theme.textMuted }]}>{t('catsheet.found')}</Text>
                <View style={s.chips}>
                  {found.found.map(f => <Chip key={f.item.name} name={f.item.name} extra={[f.alias, f.group !== 'all' ? t(groupKey(picked, f.group) as any) : null].filter(Boolean).join(' · ')} />)}
                </View>
              </>
            )}
            {!found.exact && (
              <TouchableOpacity activeOpacity={0.85} onPress={addTyped} style={[s.newRow, { borderColor: theme.primary, backgroundColor: theme.primaryBg }]} accessibilityRole="button">
                <MaterialIcons name="add-circle" size={21} color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>{t('catsheet.addRow', { name: cleanSubCategory(draft) })}</Text>
                  <Text style={[s.rowSub, { color: theme.textSecondary }]}>{t('catsheet.addSub', { category: label(picked) })}</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {own.length > 0 && (
              <>
                <View style={s.secRow}>
                  <Text style={[s.secInline, { color: theme.textMuted }]}>{t('catsheet.yours')}</Text>
                  <TouchableOpacity onPress={() => setEdit(v => !v)} hitSlop={8}><Text style={[s.link, { color: theme.primary }]}>{edit ? t('catsheet.done') : t('catsheet.edit')}</Text></TouchableOpacity>
                </View>
                <View style={s.chips}>{own.slice(0, 8).map(m => <Chip key={m.id} name={m.name} mine={m} />)}</View>
              </>
            )}
            {group && group.items.length > 0 ? (
              <>
                <Text style={[s.sec, { color: theme.textMuted }]}>{t(groupKey(picked, group.id) as any).toUpperCase()}</Text>
                <View style={s.chips}>{group.items.map(i => <Chip key={i.name} name={i.name} />)}</View>
              </>
            ) : groups.length === 0 && itemsOf(kind, picked).length > 0 ? (
              <View style={s.chips}>{itemsOf(kind, picked).map(i => <Chip key={i.name} name={i.name} />)}</View>
            ) : own.length === 0 ? (
              <Text style={[s.empty, { color: theme.textMuted }]}>{t('catsheet.noSuggestions')}</Text>
            ) : null}
          </>
        )}
        <View style={s.privacy}>
          <MaterialIcons name="lock" size={15} color={theme.primary} />
          <Text style={[s.privacyText, { color: theme.textSecondary }]}>{t('catsheet.privacy')}</Text>
        </View>
      </ScrollView>

      <TouchableOpacity style={[s.skip, { borderColor: theme.border }]} activeOpacity={0.8} onPress={() => choose(picked, null)} accessibilityRole="button">
        <Text style={[s.skipText, { color: theme.textSecondary }]}>{t('catsheet.skip')}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel={t('catsheet.close')} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav} pointerEvents="box-none">
          <View style={[s.sheet, { backgroundColor: theme.surface }]}>
            <View style={[s.grab, { backgroundColor: theme.border }]} />
            {view === 'main' ? mainView : subView}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  function CloseButton({ onPress }: { onPress: () => void }) {
    return (
      <TouchableOpacity style={[s.iconBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]} onPress={onPress} accessibilityLabel={t('catsheet.close')}>
        <MaterialIcons name="close" size={18} color={theme.text} />
      </TouchableOpacity>
    );
  }
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,20,26,0.5)', justifyContent: 'flex-end' },
  kav: { maxHeight: '88%' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, height: 640, maxHeight: '100%' },
  grab: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  h: { flex: 1, fontSize: 15, fontWeight: '700' },
  iconBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 21, borderWidth: 1, paddingHorizontal: 14, marginTop: 10 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  body: { flex: 1, marginTop: 2 },
  sec: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 14, marginBottom: 7, marginLeft: 2 },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 7, marginHorizontal: 2 },
  secInline: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  link: { fontSize: 11, fontWeight: '700' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 18, paddingVertical: 5, paddingLeft: 6, paddingRight: 11 },
  pillText: { fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '25%', alignItems: 'center', gap: 5, paddingTop: 8, paddingBottom: 6, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent' },
  cellText: { fontSize: 10.5, fontWeight: '600', textAlign: 'center', minHeight: 14 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  rowBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1 },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  rowSub: { fontSize: 11 },
  catName: { fontSize: 14, fontWeight: '700' },
  step: { fontSize: 11 },
  typed: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, borderWidth: 1.5, paddingLeft: 14, paddingRight: 8, marginTop: 10 },
  addBtn: { height: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tabs: { flexGrow: 0, marginTop: 12 },
  tab: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 6 },
  tabText: { fontSize: 12, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 17, paddingVertical: 7, paddingHorizontal: 13 },
  chipMain: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontSize: 12.5 },
  chipExtra: { fontSize: 10.5 },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed' },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, marginHorizontal: 2 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 16 },
  empty: { fontSize: 12, textAlign: 'center', paddingVertical: 18 },
  skip: { height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  skipText: { fontSize: 12.5, fontWeight: '600' },
});
