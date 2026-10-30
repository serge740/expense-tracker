import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { PeriodSheet, usePeriodLabel } from '@/components/home/period-sheet';
import { SheetFrame } from '@/components/history/sheet-frame';
import { CategoryTree } from '@/components/history/category-tree';
import { getFacets, getTags, getFeedSummary } from '@/services/history.service';
import { NameDialog } from '@/components/history/history-extras';
import type { SavedView } from '@/services/saved-views.service';
import type { Scheduled } from '@/services/scheduled.service';
import type { Wallet } from '@/services/wallet.service';
import { clearFilter, parseMoney, toggleKind, type Due, type Facets, type FeedKind, type Flag, type HistoryFilter, type Phase, type Receipt, type SchedMode, type Source } from '@/utils/history';
import { matchPreset } from '@/utils/period';

const TYPES: Array<{ k: FeedKind; label: any }> = [
  { k: 'income', label: 'home.vIncome' }, { k: 'expense', label: 'home.vExpense' }, { k: 'transfer', label: 'history.vTransfer' },
  { k: 'debt', label: 'home.vDebt' }, { k: 'credit', label: 'home.vCredit' }, { k: 'scheduled', label: 'home.vScheduled' },
];
const FAMILY_TYPES: FeedKind[] = ['income', 'expense', 'transfer'];
const SOURCES: Source[] = ['any', 'schedule', 'hand', 'debt', 'transfer'];

function Seg<T extends string>({ value, options, onChange, testID }: { value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void; testID: string }) {
  const theme = useAppTheme();
  return (
    <View testID={testID} style={[s.seg, { backgroundColor: theme.surface2 }]}>
      {options.map(o => (
        <TouchableOpacity key={o.v} testID={`${testID}-${o.v}`} onPress={() => onChange(o.v)} accessibilityRole="button" accessibilityState={{ selected: value === o.v }}
                          style={[s.segBtn, value === o.v && { backgroundColor: theme.primary }]}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: value === o.v ? (theme.isDark ? '#07202A' : '#FFFFFF') : theme.textSecondary }}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * The one filter sheet: kinds, wallets, period, categories with counts, amount, receipt, source and the loans switch.
 * It works on a copy; "Show N results" applies it, and the number is the real count for what is chosen so far.
 */
export function FilterSheet({ visible, filter, onClose, onApply, wallets, isFamily, fallbackCurrency, schedules, views, onSaveView, onApplyView, onRenameView, onDeleteView }: {
  visible: boolean; filter: HistoryFilter; onClose: () => void; onApply: (f: HistoryFilter) => void; wallets: Wallet[]; isFamily: boolean; fallbackCurrency: string;
  schedules: Scheduled[]; views: SavedView[]; onSaveView: (name: string, f: HistoryFilter) => Promise<string | null>; onApplyView: (v: SavedView) => void;
  onRenameView: (v: SavedView, name: string) => Promise<string | null>; onDeleteView: (v: SavedView) => void;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const periodName = usePeriodLabel();
  const [draft, setDraft] = useState(filter);
  const [count, setCount] = useState<number | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [tagChoices, setTagChoices] = useState<string[]>([]);
  useEffect(() => { if (visible) getTags().then(r => setTagChoices([...new Set([...r.items.map(x => x.tag), ...filter.tags])])).catch(() => setTagChoices(filter.tags)); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const [periodOpen, setPeriodOpen] = useState(false);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [naming, setNaming] = useState<null | { rename: SavedView | null }>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const req = useRef(0);

  // Start from what the page is showing every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setDraft(filter);
    setMinText(filter.minAmount === null ? '' : String(filter.minAmount));
    setMaxText(filter.maxAmount === null ? '' : String(filter.maxAmount));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // The number on the button and the counts in the category list follow what is chosen, a moment after each change.
  const key = JSON.stringify(draft);
  useEffect(() => {
    if (!visible) return;
    const id = ++req.current;
    setCount(null); setFacetsLoading(true);
    const timer = setTimeout(() => {
      getFeedSummary(draft, { fallbackCurrency }).then(r => { if (id === req.current) setCount(r.count); }).catch(() => { if (id === req.current) setCount(null); });
      getFacets(draft).then(r => { if (id === req.current) { setFacets(r); setFacetsLoading(false); } }).catch(() => { if (id === req.current) setFacetsLoading(false); });
    }, 250);
    return () => clearTimeout(timer);
  }, [key, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<HistoryFilter>) => setDraft(d => ({ ...d, ...patch }));
  const types = TYPES.filter(x => !isFamily || FAMILY_TYPES.includes(x.k));
  const usable = wallets.filter(w => !w.archived), archived = wallets.filter(w => w.archived);
  const toggleWallet = (id: string) => set({ walletIds: draft.walletIds.includes(id) ? draft.walletIds.filter(x => x !== id) : [...draft.walletIds, id] });
  const cur = (draft.walletIds.length === 1 ? wallets.find(w => w.id === draft.walletIds[0])?.currency : null) ?? fallbackCurrency;
  const ink = theme.isDark ? '#07202A' : '#FFFFFF';
  const preset = matchPreset(draft.period);
  const periodText = preset ? t(`preset.${preset}` as any) : periodName(draft.period);
  const button = count === null ? '…' : count === 0 ? t('filter.showNone') : count === 1 ? t('filter.showOne') : t('filter.show', { n: count });

  const wallet = (w: Wallet) => {
    const on = draft.walletIds.includes(w.id);
    return (
      <TouchableOpacity key={w.id} testID={`fwallet-${w.id}`} onPress={() => toggleWallet(w.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                        style={[s.walletRow, { backgroundColor: on ? theme.primaryBg : theme.surface, borderColor: on ? theme.primary : theme.border, opacity: w.archived ? 0.6 : 1 }]}>
        <MaterialIcons name={on ? 'check-box' : 'check-box-outline-blank'} size={24} color={on ? theme.primary : theme.textMuted} />
        <View style={[s.dot, { backgroundColor: w.archived ? '#9AA8AE' : w.color }]} />
        <Text style={{ flex: 1, color: theme.text, fontSize: 13.5, fontWeight: '500' }} numberOfLines={1}>{w.name}{w.archived ? ` · ${t('filter.archivedTag')}` : ''}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{w.currency}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <SheetFrame visible={visible} title={t('filter.title')} onClose={onClose} onReset={() => { setDraft(clearFilter(draft)); setMinText(''); setMaxText(''); }} resetLabel={t('filter.reset')} testID="filter-sheet"
                  footer={
                    <>
                    <TouchableOpacity testID="filter-save" onPress={() => { setNameError(null); setNaming({ rename: null }); }} accessibilityRole="button" style={[s.saveBtn, { backgroundColor: theme.primaryBg }]}>
                      <MaterialIcons name="bookmark-add" size={20} color={theme.primary} /><Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>{t('filter.save')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID="filter-apply" onPress={() => { onApply(draft); onClose(); }} accessibilityRole="button" style={[s.apply, { backgroundColor: theme.primary }]}>
                      <Text style={{ color: ink, fontSize: 15, fontWeight: '600' }}>{button}</Text>
                    </TouchableOpacity>
                    </>
                  }>
        <View style={s.labelRow}>
          <Text style={[s.label, { color: theme.textSecondary }]}>{t('filter.saved')}</Text>
          {views.length ? <TouchableOpacity testID="views-manage" onPress={() => setManage(m => !m)} accessibilityRole="button" accessibilityLabel={t('filter.renameBtn')} style={{ width: 44, height: 32, alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name={manage ? 'done' : 'edit'} size={18} color={theme.primary} /></TouchableOpacity> : null}
        </View>
        {views.length ? (
          <View style={s.chips} testID="saved-views">
            {views.map(v => (
              <View key={v.id} style={[s.viewChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <TouchableOpacity testID="view-chip" onPress={() => { if (manage) { setNameError(null); setNaming({ rename: v }); } else { onApplyView(v); onClose(); } }} accessibilityRole="button" style={s.viewChipMain}>
                  <MaterialIcons name={v.mine ? 'bookmark' : 'groups'} size={17} color={theme.primary} />
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{v.name}</Text>
                </TouchableOpacity>
                {manage ? <TouchableOpacity testID="view-delete" onPress={() => onDeleteView(v)} accessibilityRole="button" accessibilityLabel={`${t('filter.deleteView')} ${v.name}`} style={s.viewChipX}><MaterialIcons name="close" size={18} color={theme.negative} /></TouchableOpacity> : null}
              </View>
            ))}
          </View>
        ) : <Text style={{ color: theme.textMuted, fontSize: 12 }}>{t('filter.noViews')}</Text>}

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('filter.type')}</Text>
        <View style={s.chips}>
          {types.map(x => {
            const on = draft.kinds.includes(x.k);
            return (
              <TouchableOpacity key={x.k} testID={`ftype-${x.k}`} onPress={() => setDraft(toggleKind(draft, x.k))} accessibilityRole="button" accessibilityState={{ selected: on }}
                                style={[s.chip, { backgroundColor: on ? theme.primaryBg : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                {on ? <MaterialIcons name="check" size={16} color={theme.primary} /> : null}
                <Text style={{ fontSize: 13, fontWeight: on ? '600' : '500', color: on ? theme.primary : theme.text }}>{t(x.label)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.labelRow}>
          <Text style={[s.label, { color: theme.textSecondary }]}>{t('filter.wallets')}</Text>
          {draft.walletIds.length ? <Text style={{ color: theme.textSecondary, fontSize: 12.5 }}>{t('filter.nSelected', { n: draft.walletIds.length })}</Text> : null}
        </View>
        <View style={{ gap: 6 }}>{[...usable, ...archived].map(wallet)}</View>

        <TouchableOpacity testID="filter-period" onPress={() => setPeriodOpen(true)} accessibilityRole="button" style={[s.collRow, { backgroundColor: theme.surface2 }]}>
          <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '600' }}>{t('filter.period')}</Text>
          <Text style={{ flex: 1, textAlign: 'right', color: theme.primary, fontSize: 12.5 }} numberOfLines={1}>{periodText}</Text>
          <MaterialIcons name="expand-more" size={22} color={theme.textMuted} />
        </TouchableOpacity>

        <View style={s.labelRow}><Text style={[s.heading, { color: theme.text }]}>{t('filter.categories')}</Text></View>
        <CategoryTree facets={facets} loading={facetsLoading} filter={draft} onChange={setDraft} />

        <Text style={[s.heading, { color: theme.text, marginTop: 16 }]}>{t('filter.amount')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ id: 'min', text: minText, set: setMinText, label: t('filter.min', { cur }), key: 'minAmount' as const }, { id: 'max', text: maxText, set: setMaxText, label: t('filter.max', { cur }), key: 'maxAmount' as const }].map(f => (
            <View key={f.id} style={[s.money, { borderColor: f.text ? theme.primary : theme.border }]}>
              <Text style={{ fontSize: 10.5, color: theme.textSecondary }}>{f.label}</Text>
              <TextInput testID={`famount-${f.id}`} value={f.text} placeholder={t('filter.noLimit')} placeholderTextColor={theme.textMuted} keyboardType="decimal-pad"
                         onChangeText={v => { f.set(v); set({ [f.key]: parseMoney(v) } as Partial<HistoryFilter>); }} style={[s.moneyInput, { color: theme.text }]} />
            </View>
          ))}
        </View>
        <Text style={{ color: theme.textSecondary, fontSize: 11.5, marginTop: 4 }}>{t('filter.amountNote')}</Text>

        <Text style={[s.heading, { color: theme.text, marginTop: 14 }]}>{t('filter.receipt')}</Text>
        <Seg testID="freceipt" value={draft.receipt} onChange={(v: Receipt) => set({ receipt: v })} options={[{ v: 'any', label: t('filter.any') }, { v: 'with', label: t('filter.with') }, { v: 'without', label: t('filter.without') }]} />

        <Text style={[s.heading, { color: theme.text, marginTop: 14 }]}>{t('filter.source')}</Text>
        <View style={s.chips}>
          {SOURCES.filter(x => !isFamily || x === 'any' || x === 'hand' || x === 'transfer').map(src => {
            const on = draft.source === src;
            return (
              <TouchableOpacity key={src} testID={`fsource-${src}`} onPress={() => set({ source: src })} accessibilityRole="button" accessibilityState={{ selected: on }}
                                style={[s.chip, { backgroundColor: on ? theme.primaryBg : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                {on ? <MaterialIcons name="check" size={16} color={theme.primary} /> : null}
                <Text style={{ fontSize: 12.5, fontWeight: on ? '600' : '500', color: on ? theme.primary : theme.text }}>{t(`filter.src.${src}` as any)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!isFamily ? (
          <>
            <Text style={[s.heading, { color: theme.text, marginTop: 14 }]}>{t('filter.scheduled')}</Text>
            <Seg testID="fphase" value={draft.phase} onChange={(v: Phase) => set({ phase: v })} options={[{ v: 'past', label: t('filter.phase.past') }, { v: 'upcoming', label: t('filter.phase.upcoming') }, { v: 'both', label: t('filter.phase.both') }]} />
            {schedules.length ? (
              <>
                <Text style={[s.label, { color: theme.textSecondary }]}>{t('filter.schedules')}</Text>
                <View style={[s.checkList, { backgroundColor: theme.surface2 }]}>
                  {schedules.map((sc, i) => {
                    const on = draft.schedules.includes(sc.id);
                    return (
                      <TouchableOpacity key={sc.id} testID={`fsched-${sc.id}`} onPress={() => set({ schedules: on ? draft.schedules.filter(x => x !== sc.id) : [...draft.schedules, sc.id] })} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                                        style={[s.checkRow, i < schedules.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                        <MaterialIcons name={on ? 'check-box' : 'check-box-outline-blank'} size={22} color={on ? theme.primary : theme.textMuted} />
                        <Text style={{ flex: 1, color: theme.text, fontSize: 13.5, fontWeight: '500' }} numberOfLines={1}>{sc.title}</Text>
                        <View style={[s.status, { backgroundColor: sc.status === 'ACTIVE' ? theme.positiveTint : theme.surface }]}><Text style={{ fontSize: 11, fontWeight: '600', color: sc.status === 'ACTIVE' ? theme.positive : theme.textSecondary }}>{t(`filter.schedStatus.${sc.status}` as any)}</Text></View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
            <Text style={[s.label, { color: theme.textSecondary }]}>{t('filter.mode')}</Text>
            <View style={s.chips}>
              {(['any', 'auto', 'confirm'] as SchedMode[]).map(m => {
                const on = draft.schedMode === m;
                return (
                  <TouchableOpacity key={m} testID={`fmode-${m}`} onPress={() => set({ schedMode: m })} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, { backgroundColor: on ? theme.primaryBg : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                    {on ? <MaterialIcons name="check" size={16} color={theme.primary} /> : null}
                    <Text style={{ fontSize: 12.5, fontWeight: on ? '600' : '500', color: on ? theme.primary : theme.text }}>{t(`filter.mode.${m}` as any)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[s.label, { color: theme.textSecondary }]}>{t('filter.due')}</Text>
            <View style={s.chips}>
              {(['overdue', 'today', 'week', 'failed'] as Due[]).map(d => {
                const on = draft.due.includes(d);
                return (
                  <TouchableOpacity key={d} testID={`fdue-${d}`} onPress={() => set({ due: on ? draft.due.filter(x => x !== d) : [...draft.due, d] })} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, { backgroundColor: on ? theme.primaryBg : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                    {on ? <MaterialIcons name="check" size={16} color={theme.primary} /> : null}
                    <Text style={{ fontSize: 12.5, fontWeight: on ? '600' : '500', color: on ? theme.primary : theme.text }}>{t(`filter.due.${d}` as any)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {tagChoices.length ? (
          <>
            <Text style={[s.heading, { color: theme.text, marginTop: 14 }]}>{t('hx.tags.tags')}</Text>
            <View style={s.chips}>
              {tagChoices.map(tg => {
                const on = draft.tags.includes(tg);
                return (
                  <TouchableOpacity key={tg} testID={`ftag-${tg}`} onPress={() => set({ tags: on ? draft.tags.filter(x => x !== tg) : [...draft.tags, tg] })} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, { backgroundColor: on ? theme.primaryBg : theme.surface2, borderColor: on ? theme.primary : theme.border }]}>
                    <Text style={{ fontSize: 12.5, fontWeight: on ? '600' : '500', color: on ? theme.primary : theme.text }}>#{tg}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={[s.heading, { color: theme.text, marginTop: 14 }]}>{t('filter.flags')}</Text>
        <View style={s.chips}>
          {(['duplicates', 'uncategorised'] as Flag[]).map(fl => {
            const on = draft.flags.includes(fl);
            return (
              <TouchableOpacity key={fl} testID={`fflag-${fl}`} onPress={() => set({ flags: on ? draft.flags.filter(x => x !== fl) : [...draft.flags, fl] })} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, { backgroundColor: on ? theme.primaryBg : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                {on ? <MaterialIcons name="check" size={16} color={theme.primary} /> : null}
                <Text style={{ fontSize: 12.5, fontWeight: on ? '600' : '500', color: on ? theme.primary : theme.text }}>{t(`filter.flag.${fl}` as any)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!isFamily ? (
          <View style={s.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: '600' }}>{t('filter.loans')}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>{t('filter.loansSub')}</Text>
            </View>
            <Switch value={draft.includeLoans} onValueChange={v => set({ includeLoans: v })} trackColor={{ true: theme.primary, false: theme.border }} thumbColor="#FFFFFF" accessibilityLabel={t('filter.loans')} />
          </View>
        ) : null}
      </SheetFrame>
      <NameDialog visible={naming !== null} title={t(naming?.rename ? 'filter.renameBtn' : 'filter.saveTitle')} initial={naming?.rename?.name ?? ''} confirmLabel={t(naming?.rename ? 'filter.renameBtn' : 'filter.saveBtn')} error={nameError}
                  onClose={() => setNaming(null)}
                  onConfirm={async name => { const err = naming?.rename ? await onRenameView(naming.rename, name) : await onSaveView(name, draft); if (err) setNameError(err); else { setNaming(null); setNameError(null); } }} />
      <PeriodSheet visible={periodOpen} period={draft.period} onClose={() => setPeriodOpen(false)} onChange={p => set({ period: p })} presets />
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12.5, fontWeight: '600', minHeight: 32, textAlignVertical: 'center' as any, paddingTop: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  heading: { fontSize: 15, fontWeight: '600', minHeight: 40, paddingTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  walletRow: { minHeight: 48, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  collRow: { marginTop: 12, minHeight: 52, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 99 },
  segBtn: { flex: 1, height: 38, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  money: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 4 },
  moneyInput: { fontSize: 14, fontWeight: '600', borderWidth: 0, backgroundColor: 'transparent', padding: 0, outlineStyle: 'none' as any },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, marginTop: 12 },
  apply: { flex: 1, minHeight: 52, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { minHeight: 52, paddingHorizontal: 16, borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewChip: { minHeight: 38, borderRadius: 99, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  viewChipMain: { minHeight: 38, paddingLeft: 10, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  viewChipX: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' },
  checkList: { borderRadius: 16, paddingHorizontal: 12 },
  checkRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
});
