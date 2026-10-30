// The later History tools (H6): export sheet, saved-views manager, tags and note, advanced filter builder, calendar and chart modes.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { OptionRow, OptionSheet, Tile } from '@/components/add/option-sheet';
import { SheetFrame } from '@/components/history/sheet-frame';
import { CATEGORIES, categoryLabelKey } from '@/constants/categories';
import { annotateRow, getFeed, getTags } from '@/services/history.service';
import type { SavedView } from '@/services/saved-views.service';
import type { Wallet } from '@/services/wallet.service';
import { ZERO_DECIMAL, shortAmount, type FeedKind, type FeedRow, type HistoryFilter } from '@/utils/history';

// ── Export: CSV, Excel or PDF ─────────────────────────────────────────────────

export function ExportSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (format: 'csv' | 'xlsx' | 'pdf') => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const item = (format: 'csv' | 'xlsx' | 'pdf', icon: string) => (
    <OptionRow key={format} testID={`export-${format}`} title={t(`hx.export.${format}` as any)} sub={t(`hx.export.${format}Sub` as any)} tile={<Tile icon={icon} color={theme.primary} bg={theme.primaryBg} />} onPress={() => onPick(format)} />
  );
  return (
    <OptionSheet visible={visible} title={t('hx.export.title')} onClose={onClose}>
      {item('xlsx', 'grid-on')}
      {item('pdf', 'picture-as-pdf')}
      {item('csv', 'description')}
    </OptionSheet>
  );
}

/** Saves a file the server made (base64) through the browser. */
export function saveBase64(base64: string, filename: string, type: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Saved views: apply, rename, delete ────────────────────────────────────────

export function SavedViewsSheet({ visible, views, onClose, onApply, onRename, onDelete }: {
  visible: boolean; views: SavedView[]; onClose: () => void; onApply: (v: SavedView) => void;
  onRename: (v: SavedView, name: string) => Promise<string | null>; onDelete: (v: SavedView) => void;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!visible) { setEditing(null); setError(null); } }, [visible]);
  const save = async (v: SavedView) => {
    if (!name.trim()) return;
    const err = await onRename(v, name);
    if (err) setError(err); else { setEditing(null); setError(null); }
  };
  return (
    <SheetFrame visible={visible} title={t('hx.views.title')} onClose={onClose} height="75%" testID="views-sheet">
      <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginBottom: 10 }}>{t('hx.views.hint')}</Text>
      {views.length === 0 ? <Text testID="views-empty" style={{ color: theme.textMuted, fontSize: 13, paddingVertical: 24, textAlign: 'center' }}>{t('hx.views.none')}</Text> : null}
      {views.map(v => (
        <View key={v.id} testID="view-row" style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 12, marginBottom: 8 }}>
          {editing === v.id ? (
            <View>
              <TextInput testID="view-name" value={name} onChangeText={setName} maxLength={40} autoFocus placeholderTextColor={theme.textMuted}
                         style={{ minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 14, color: theme.text, fontSize: 14 }} />
              {error ? <Text style={{ color: theme.negative, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity testID="view-save" onPress={() => save(v)} accessibilityRole="button" style={{ flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('allow.save')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { setEditing(null); setError(null); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}><Text style={{ color: theme.textSecondary, fontWeight: '600' }}>{t('common.cancel')}</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity testID="view-apply" onPress={() => onApply(v)} accessibilityRole="button" style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{v.name}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 11.5 }}>{t(v.mine ? 'hx.views.mine' : 'hx.views.shared')}</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="view-rename" onPress={() => { setEditing(v.id); setName(v.name); setError(null); }} accessibilityRole="button" accessibilityLabel={t('hx.views.rename')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="edit" size={20} color={theme.textSecondary} /></TouchableOpacity>
              <TouchableOpacity testID="view-delete" onPress={() => onDelete(v)} accessibilityRole="button" accessibilityLabel={t('filter.deleteView')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="delete-outline" size={22} color={theme.negative} /></TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </SheetFrame>
  );
}

// ── Tags and a private note ───────────────────────────────────────────────────

export function AnnotateSheet({ row, onClose, onSaved }: { row: FeedRow | null; onClose: () => void; onSaved: (id: string, tags: string[], note: string | null) => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [known, setKnown] = useState<Array<{ tag: string; count: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!row) return;
    setTags(row.tags ?? []); setNote(row.note ?? ''); setDraft(''); setError(null);
    getTags().then(r => setKnown(r.items)).catch(() => setKnown([]));
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#+/, '').replace(/[\s|,]+/g, '-').slice(0, 24);
    if (!tag || tags.length >= 10 || tags.some(x => x.toLowerCase() === tag.toLowerCase())) { setDraft(''); return; }
    setTags(l => [...l, tag]); setDraft('');
  };
  const save = async () => {
    if (!row) return;
    setBusy(true); setError(null);
    try {
      const pending = draft.trim() ? [...tags, draft.trim().replace(/^#+/, '')] : tags;
      const r = await annotateRow(row.id, { tags: pending, note });
      onSaved(row.id, r.tags, r.note); onClose();
    } catch (e: any) { setError(e?.response?.data?.message || t('add.errSave')); } finally { setBusy(false); }
  };
  const suggestions = known.filter(k => !tags.some(x => x.toLowerCase() === k.tag.toLowerCase())).slice(0, 8);
  return (
    <SheetFrame visible={!!row} title={t('hx.tags.title')} onClose={onClose} height="80%" testID="annotate-sheet"
                footer={<TouchableOpacity testID="annotate-save" onPress={save} disabled={busy} accessibilityRole="button" style={{ flex: 1, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{t('allow.save')}</Text>}</TouchableOpacity>}>
      <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{row?.title}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginTop: 14, marginBottom: 6 }}>{t('hx.tags.tags')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tags.map(tag => (
          <TouchableOpacity key={tag} testID={`tag-${tag}`} onPress={() => setTags(l => l.filter(x => x !== tag))} accessibilityRole="button" accessibilityLabel={`${t('hx.tags.remove')} ${tag}`}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingLeft: 12, paddingRight: 8, borderRadius: 18, backgroundColor: theme.primaryBg }}>
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>#{tag}</Text><MaterialIcons name="close" size={16} color={theme.primary} />
          </TouchableOpacity>
        ))}
      </View>
      <TextInput testID="tag-input" value={draft} onChangeText={v => (/[,\n]$/.test(v) ? addTag(v.slice(0, -1)) : setDraft(v))} onSubmitEditing={() => addTag(draft)} placeholder={t('hx.tags.placeholder')} placeholderTextColor={theme.textMuted} autoCapitalize="none" maxLength={24}
                 style={{ minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 16, color: theme.text, fontSize: 14, marginTop: 10 }} />
      {suggestions.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {suggestions.map(k => (
            <TouchableOpacity key={k.tag} onPress={() => addTag(k.tag)} accessibilityRole="button" style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.textSecondary, fontSize: 12.5 }}>#{k.tag} · {k.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginTop: 18, marginBottom: 6 }}>{t('hx.tags.note')}</Text>
      <TextInput testID="note-input" value={note} onChangeText={setNote} multiline maxLength={1000} placeholder={t('hx.tags.notePlaceholder')} placeholderTextColor={theme.textMuted}
                 style={{ minHeight: 110, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 16, paddingVertical: 12, color: theme.text, fontSize: 14, textAlignVertical: 'top' as any }} />
      <Text style={{ color: theme.textMuted, fontSize: 11.5, marginTop: 6 }}>{t('hx.tags.private')}</Text>
      {error ? <Text style={{ color: theme.negative, fontSize: 12.5, marginTop: 8 }}>{error}</Text> : null}
    </SheetFrame>
  );
}

// ── Advanced filter builder ───────────────────────────────────────────────────

type Field = 'text' | 'amountMin' | 'amountMax' | 'category' | 'categoryNot' | 'wallet' | 'tag' | 'kind' | 'from' | 'to';
interface Cond { id: number; field: Field; value: string }
const FIELDS: Field[] = ['text', 'amountMin', 'amountMax', 'category', 'categoryNot', 'wallet', 'tag', 'kind', 'from', 'to'];
const KIND_CHOICES: FeedKind[] = ['income', 'expense', 'transfer'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The rows the builder starts with: what the current filter already says, one condition per piece. */
export function condsFromFilter(f: HistoryFilter): Cond[] {
  const out: Cond[] = [];
  let id = 1;
  const add = (field: Field, value: string) => out.push({ id: id++, field, value });
  if (f.search.trim()) add('text', f.search.trim());
  if (f.minAmount !== null) add('amountMin', String(f.minAmount));
  if (f.maxAmount !== null) add('amountMax', String(f.maxAmount));
  for (const p of f.include) if (!p.s && !p.none) add('category', p.c);
  for (const p of f.exclude) if (!p.s && !p.none) add('categoryNot', p.c);
  for (const w of f.walletIds) add('wallet', w);
  for (const tg of f.tags) add('tag', tg);
  for (const k of f.kinds) add('kind', k);
  if (f.period.kind === 'range') { add('from', f.period.from); add('to', f.period.to); }
  return out;
}

/** The filter the conditions describe. Everything the builder controls is replaced; the rest (sort, group, loans, receipts…) stays. */
export function filterFromConds(base: HistoryFilter, conds: Cond[]): HistoryFilter {
  const get = (field: Field) => conds.filter(c => c.field === field && c.value.trim()).map(c => c.value.trim());
  const num = (field: Field, pick: (a: number, b: number) => number): number | null => {
    const v = get(field).map(Number).filter(n => Number.isFinite(n) && n >= 0);
    return v.length ? v.reduce(pick) : null;
  };
  const from = get('from').find(d => DAY.test(d)), to = get('to').find(d => DAY.test(d));
  const today = new Date();
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let min = num('amountMin', Math.max), max = num('amountMax', Math.min);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const keepsPicks = (list: HistoryFilter['include']) => list.filter(p => p.s || p.none);
  return {
    ...base,
    search: get('text').join(' '),
    minAmount: min, maxAmount: max,
    include: [...keepsPicks(base.include), ...get('category').map(c => ({ c }))],
    exclude: [...keepsPicks(base.exclude), ...get('categoryNot').map(c => ({ c }))],
    walletIds: [...new Set(get('wallet'))],
    tags: [...new Set(get('tag').map(x => x.replace(/^#+/, '')))].slice(0, 10),
    kinds: [...new Set(get('kind'))] as FeedKind[],
    period: from || to ? { kind: 'range', from: from ?? '2000-01-01', to: to ?? (from && from > todayText ? from : todayText) } : base.period,
  };
}

export function AdvancedSheet({ visible, filter, wallets, onClose, onApply }: { visible: boolean; filter: HistoryFilter; wallets: Wallet[]; onClose: () => void; onApply: (f: HistoryFilter) => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [conds, setConds] = useState<Cond[]>([]);
  const [next, setNext] = useState(100);
  useEffect(() => { if (visible) setConds(condsFromFilter(filter)); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (id: number, p: Partial<Cond>) => setConds(l => l.map(c => (c.id === id ? { ...c, ...p } : c)));
  const preview = filterFromConds(filter, conds);
  const chip = (on: boolean, label: string, onPress: () => void, testID?: string) => (
    <TouchableOpacity key={label} testID={testID} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center', backgroundColor: on ? theme.primary : theme.surface2, borderWidth: 1, borderColor: on ? theme.primary : theme.border }}>
      <Text style={{ color: on ? '#FFFFFF' : theme.text, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
  const input = (c: Cond) => {
    const box = { minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 14, color: theme.text, fontSize: 14, marginTop: 8 } as const;
    if (c.field === 'category' || c.field === 'categoryNot') {
      return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{CATEGORIES.filter(x => !x.system).map(x => chip(c.value === x.id, t(categoryLabelKey(x.id, x.for.includes('EXPENSE') ? 'EXPENSE' : 'INCOME') as any), () => set(c.id, { value: x.id }), `adv-${c.field}-${x.id}`))}</View>;
    }
    if (c.field === 'wallet') return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{wallets.filter(w => !w.archived).map(w => chip(c.value === w.id, w.name, () => set(c.id, { value: w.id }), `adv-wallet-${w.id}`))}</View>;
    if (c.field === 'kind') return <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>{KIND_CHOICES.map(k => chip(c.value === k, t(`hx.adv.kind.${k}` as any), () => set(c.id, { value: k }), `adv-kind-${k}`))}</View>;
    const numeric = c.field === 'amountMin' || c.field === 'amountMax';
    const day = c.field === 'from' || c.field === 'to';
    return <TextInput testID={`adv-value-${c.field}`} value={c.value} onChangeText={v => set(c.id, { value: v })} keyboardType={numeric ? 'numeric' : 'default'} autoCapitalize="none" placeholder={t(day ? 'hx.adv.dayHint' : numeric ? 'hx.adv.amountHint' : 'hx.adv.textHint')} placeholderTextColor={theme.textMuted} style={box} />;
  };
  return (
    <SheetFrame visible={visible} title={t('hx.adv.title')} onClose={onClose} onReset={() => setConds([])} resetLabel={t('filter.reset')} testID="advanced-sheet"
                footer={<TouchableOpacity testID="adv-apply" onPress={() => onApply(preview)} accessibilityRole="button" style={{ flex: 1, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary }}><Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{t('hx.adv.apply')}</Text></TouchableOpacity>}>
      <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginBottom: 10 }}>{t('hx.adv.hint')}</Text>
      {conds.map(c => (
        <View key={c.id} testID="adv-row" style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 12, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {FIELDS.map(f => chip(c.field === f, t(`hx.adv.f.${f}` as any), () => set(c.id, { field: f, value: '' }), `adv-field-${c.id}-${f}`))}
            </View>
            <TouchableOpacity testID="adv-remove" onPress={() => setConds(l => l.filter(x => x.id !== c.id))} accessibilityRole="button" accessibilityLabel={t('hx.tags.remove')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="close" size={20} color={theme.textMuted} /></TouchableOpacity>
          </View>
          {input(c)}
        </View>
      ))}
      <TouchableOpacity testID="adv-add" onPress={() => { setConds(l => [...l, { id: next, field: 'text', value: '' }]); setNext(n => n + 1); }} accessibilityRole="button"
                        style={{ minHeight: 46, borderRadius: 23, borderWidth: 1, borderStyle: 'dashed' as any, borderColor: theme.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <MaterialIcons name="add" size={20} color={theme.primary} /><Text style={{ color: theme.primary, fontWeight: '600' }}>{t('hx.adv.add')}</Text>
      </TouchableOpacity>
    </SheetFrame>
  );
}

// ── Calendar and chart modes ──────────────────────────────────────────────────

const ROW_CAP = 1500;
/** Every row of a filter (up to a cap), page after page. */
export async function loadRows(f: HistoryFilter, fallbackCurrency: string): Promise<{ rows: FeedRow[]; truncated: boolean }> {
  const rows: FeedRow[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: { items: FeedRow[]; nextCursor: string | null } = await getFeed({ ...f, sort: 'newest', group: 'none' }, { cursor, limit: 200, fallbackCurrency });
    rows.push(...page.items);
    if (!page.nextCursor) return { rows, truncated: false };
    if (rows.length >= ROW_CAP) return { rows: rows.slice(0, ROW_CAP), truncated: true };
    cursor = page.nextCursor;
  }
}

/** The person's own calendar day of a moment, as YYYY-MM-DD. */
export const localDay = (iso: string | Date): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Money in, money out and net per local day, for one currency (transfers move nothing in or out). */
export function dayTotals(rows: FeedRow[], currency: string, fallback: string): Map<string, { in: number; out: number }> {
  const out = new Map<string, { in: number; out: number }>();
  for (const r of rows) {
    if (r.type === 'TRANSFER' || (r.currency ?? fallback) !== currency) continue;
    const key = localDay(r.date);
    const cur = out.get(key) ?? { in: 0, out: 0 };
    if (r.amount >= 0) cur.in += r.amount; else cur.out += -r.amount;
    out.set(key, cur);
  }
  return out;
}

/** Spending per category for one currency, largest first. */
export function categoryTotals(rows: FeedRow[], currency: string, fallback: string): Array<{ category: string; total: number }> {
  const sums = new Map<string, number>();
  for (const r of rows) {
    if (r.type !== 'EXPENSE' || r.debtRole || (r.currency ?? fallback) !== currency) continue;
    sums.set(r.category, (sums.get(r.category) ?? 0) + -r.amount);
  }
  return [...sums.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

function useRows(f: HistoryFilter, fallback: string) {
  const [data, setData] = useState<{ rows: FeedRow[]; truncated: boolean } | null>(null);
  const [error, setError] = useState(false);
  const key = JSON.stringify(f);
  useEffect(() => {
    let live = true;
    setData(null); setError(false);
    loadRows(f, fallback).then(r => { if (live) setData(r); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [key, fallback]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error };
}

function CurrencyChips({ currencies, value, onChange }: { currencies: string[]; value: string; onChange: (c: string) => void }) {
  const theme = useAppTheme();
  if (currencies.length < 2) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
      {currencies.map(c => (
        <TouchableOpacity key={c} testID={`cur-${c}`} onPress={() => onChange(c)} accessibilityRole="button" accessibilityState={{ selected: c === value }}
                          style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: c === value ? theme.primary : theme.surface }}>
          <Text style={{ color: c === value ? '#FFFFFF' : theme.text, fontSize: 12.5, fontWeight: '600' }}>{c}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const currenciesOf = (rows: FeedRow[], fallback: string) => {
  const count = new Map<string, number>();
  for (const r of rows) if (r.type !== 'TRANSFER') count.set(r.currency ?? fallback, (count.get(r.currency ?? fallback) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
};

/** One month as a grid: each day shows its net (green in, red out). Tap a day to see just that day in the list. */
export function HistoryCalendar({ filter, fallback, hidden, firstDay, onPickDay }: { filter: HistoryFilter; fallback: string; hidden: boolean; firstDay: 'monday' | 'sunday'; onPickDay: (day: string) => void }) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const base = filter.period.kind === 'month' ? { y: filter.period.year, m: filter.period.month - 1 } : (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();
  const [shown, setShown] = useState(base);
  const [cur, setCur] = useState<string | null>(null);
  useEffect(() => { setShown(base); }, [filter.period.kind === 'month' ? `${filter.period.year}-${filter.period.month}` : 'x']); // eslint-disable-line react-hooks/exhaustive-deps
  const monthFilter: HistoryFilter = useMemo(() => ({ ...filter, period: { kind: 'month', month: shown.m + 1, year: shown.y }, search: filter.search }), [filter, shown.m, shown.y]);
  const { data, error } = useRows(monthFilter, fallback);
  const currencies = data ? currenciesOf(data.rows, fallback) : [];
  const currency = cur && currencies.includes(cur) ? cur : currencies[0] ?? fallback;
  const totals = data ? dayTotals(data.rows, currency, fallback) : new Map();
  const first = new Date(shown.y, shown.m, 1);
  const offset = (first.getDay() - (firstDay === 'monday' ? 1 : 0) + 7) % 7;
  const days = new Date(shown.y, shown.m + 1, 0).getDate();
  const cells: Array<number | null> = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, (firstDay === 'monday' ? 1 : 7) + i).toLocaleDateString(locale, { weekday: 'narrow' }));
  const title = first.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const money = (n: number) => (hidden ? '•••' : shortAmount(Math.abs(n), ZERO_DECIMAL.has(currency)));
  const today = localDay(new Date());
  return (
    <View testID="history-calendar" style={{ marginHorizontal: 12, marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <TouchableOpacity testID="cal-prev" onPress={() => setShown(s => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }))} accessibilityRole="button" accessibilityLabel={t('hx.cal.prev')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="chevron-left" size={26} color={theme.text} /></TouchableOpacity>
        <Text testID="cal-title" style={{ flex: 1, textAlign: 'center', color: theme.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        <TouchableOpacity testID="cal-next" onPress={() => setShown(s => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }))} accessibilityRole="button" accessibilityLabel={t('hx.cal.next')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="chevron-right" size={26} color={theme.text} /></TouchableOpacity>
      </View>
      <CurrencyChips currencies={currencies} value={currency} onChange={setCur} />
      {error ? <Text testID="cal-error" style={{ color: theme.negative, textAlign: 'center', padding: 20 }}>{t('history.errorBody')}</Text> : null}
      {!data && !error ? <ActivityIndicator color={theme.primary} style={{ margin: 24 }} /> : null}
      {data ? (
        <View style={{ backgroundColor: theme.surface, borderRadius: 18, padding: 8 }}>
          <View style={{ flexDirection: 'row' }}>{weekdays.map((w, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: theme.textMuted, fontSize: 11.5, paddingVertical: 4 }}>{w}</Text>)}</View>
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} style={{ flexDirection: 'row' }}>
              {cells.slice(row * 7, row * 7 + 7).map((day, i) => {
                if (!day) return <View key={i} style={{ flex: 1, minHeight: 58 }} />;
                const key = `${shown.y}-${String(shown.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const t2 = totals.get(key);
                const net = t2 ? t2.in - t2.out : 0;
                return (
                  <TouchableOpacity key={i} testID={`cal-day-${key}`} disabled={!t2} onPress={() => onPickDay(key)} accessibilityRole="button" accessibilityLabel={key}
                                    style={{ flex: 1, minHeight: 58, margin: 1, borderRadius: 12, alignItems: 'center', paddingTop: 5, backgroundColor: t2 ? theme.surface2 : 'transparent', borderWidth: key === today ? 1.5 : 0, borderColor: theme.primary }}>
                    <Text style={{ color: t2 ? theme.text : theme.textMuted, fontSize: 12.5, fontWeight: '600' }}>{day}</Text>
                    {t2 ? <Text style={{ color: net < 0 ? theme.negative : theme.positive, fontSize: 10.5, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>{net < 0 ? '−' : '+'}{money(net)}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
      {data?.truncated ? <Text style={{ color: theme.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 6 }}>{t('hx.cal.truncated')}</Text> : null}
    </View>
  );
}

/** Spending per day as bars, and per category as bars, for the filter's period. */
export function HistoryChart({ filter, fallback, hidden }: { filter: HistoryFilter; fallback: string; hidden: boolean }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { data, error } = useRows(filter, fallback);
  const [cur, setCur] = useState<string | null>(null);
  const currencies = data ? currenciesOf(data.rows, fallback) : [];
  const currency = cur && currencies.includes(cur) ? cur : currencies[0] ?? fallback;
  const byDay = data ? [...dayTotals(data.rows, currency, fallback).entries()].sort((a, b) => a[0].localeCompare(b[0])) : [];
  const byCat = data ? categoryTotals(data.rows, currency, fallback) : [];
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v.out));
  const maxCat = Math.max(1, ...byCat.map(c => c.total));
  const money = (n: number) => (hidden ? '•••' : shortAmount(n, ZERO_DECIMAL.has(currency)));
  const shown = byDay.slice(-31);
  return (
    <View testID="history-chart" style={{ marginHorizontal: 12, marginTop: 8 }}>
      <CurrencyChips currencies={currencies} value={currency} onChange={setCur} />
      {error ? <Text testID="chart-error" style={{ color: theme.negative, textAlign: 'center', padding: 20 }}>{t('history.errorBody')}</Text> : null}
      {!data && !error ? <ActivityIndicator color={theme.primary} style={{ margin: 24 }} /> : null}
      {data && byDay.length === 0 && byCat.length === 0 ? <Text testID="chart-empty" style={{ color: theme.textMuted, textAlign: 'center', padding: 24 }}>{t('hx.chart.empty')}</Text> : null}
      {data && byDay.length > 0 ? (
        <View style={{ backgroundColor: theme.surface, borderRadius: 18, padding: 14, marginBottom: 12 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', marginBottom: 10 }}>{t('hx.chart.perDay')}</Text>
          <View testID="chart-days" style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 3 }}>
            {shown.map(([day, v]) => (
              <View key={day} testID="chart-day" accessibilityLabel={`${day}: ${money(v.out)} ${currency}`} style={{ flex: 1, height: Math.max(3, Math.round((v.out / maxDay) * 116)), borderRadius: 3, backgroundColor: v.out ? theme.primary : theme.border }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>{shown[0]?.[0].slice(5)}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>{t('hx.chart.max', { amount: `${money(maxDay)} ${currency}` })}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>{shown[shown.length - 1]?.[0].slice(5)}</Text>
          </View>
        </View>
      ) : null}
      {data && byCat.length > 0 ? (
        <View style={{ backgroundColor: theme.surface, borderRadius: 18, padding: 14 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600', marginBottom: 10 }}>{t('hx.chart.perCategory')}</Text>
          {byCat.slice(0, 8).map(c => (
            <View key={c.category} testID="chart-cat" style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.text, fontSize: 13 }} numberOfLines={1}>{t(categoryLabelKey(c.category, 'EXPENSE') as any)}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{money(c.total)} {currency}</Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.surface2, marginTop: 4, overflow: 'hidden' }}><View style={{ width: `${Math.round((c.total / maxCat) * 100)}%`, height: 8, backgroundColor: theme.primary }} /></View>
            </View>
          ))}
        </View>
      ) : null}
      {data?.truncated ? <Text style={{ color: theme.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 6 }}>{t('hx.cal.truncated')}</Text> : null}
    </View>
  );
}

/** List | Calendar | Chart. */
export type ViewMode = 'list' | 'calendar' | 'chart';
export function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const items: Array<[ViewMode, string]> = [['list', 'view-list'], ['calendar', 'calendar-month'], ['chart', 'bar-chart']];
  return (
    <View testID="view-switch" style={{ flexDirection: 'row', marginHorizontal: 12, marginTop: 6, padding: 3, borderRadius: 22, backgroundColor: theme.surface }}>
      {items.map(([m, icon]) => (
        <TouchableOpacity key={m} testID={`view-${m}`} onPress={() => onChange(m)} accessibilityRole="button" accessibilityState={{ selected: value === m }}
                          style={{ flex: 1, minHeight: 38, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: value === m ? theme.primary : 'transparent' }}>
          <MaterialIcons name={icon} size={18} color={value === m ? '#FFFFFF' : theme.textSecondary} />
          <Text style={{ color: value === m ? '#FFFFFF' : theme.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{t(`hx.mode.${m}` as any)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
