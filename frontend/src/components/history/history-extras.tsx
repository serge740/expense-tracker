import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { SheetFrame } from '@/components/history/sheet-frame';
import { KIND_LABEL, StateBlock } from '@/components/history/history-parts';
import { agendaTitle, openAgendaItem, useWhen } from '@/components/home/schedule-cards';
import { ConfirmSheet, type ConfirmItem } from '@/components/schedule/confirm-sheet';
import { OWE, OWED } from '@/components/debt/tone-chip';
import { categoryLabelKey } from '@/constants/categories';
import { getAgenda } from '@/services/home.service';
import { getWaitingDates, skipOccurrence, type WaitingItem } from '@/services/scheduled.service';
import type { Wallet } from '@/services/wallet.service';
import type { FamilyMemberRow } from '@/services/family.service';
import { calendarDays, type AgendaItem } from '@/utils/schedule-agenda';
import { suggest, type SearchContext } from '@/utils/history-search';
import { shortAmount, type Due, type FilterChip, type Group, type HistoryFilter, type Pick, type Sort } from '@/utils/history';

// ── A name for a saved view ──

export function NameDialog({ visible, title, initial, confirmLabel, error, onClose, onConfirm }: { visible: boolean; title: string; initial: string; confirmLabel: string; error: string | null; onClose: () => void; onConfirm: (name: string) => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [name, setName] = useState(initial);
  useEffect(() => { if (visible) setName(initial); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const ink = theme.isDark ? '#07202A' : '#FFFFFF';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={x.dialogBack}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel={t('catsheet.close')} />
        <View testID="name-dialog" style={[x.dialog, { backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>{title}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{t('filter.saveHint')}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 12 }}>{t('filter.saveName')}</Text>
          <TextInput testID="name-input" value={name} onChangeText={setName} maxLength={40} autoFocus onSubmitEditing={() => onConfirm(name)}
                     style={[x.dialogInput, { color: theme.text, borderColor: error ? theme.negative : theme.primary, backgroundColor: theme.inputBg }]} />
          {error ? <Text style={{ color: theme.negative, fontSize: 12, marginTop: 6 }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" style={[x.dialogBtn, { backgroundColor: theme.surface2 }]}><Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{t('common.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity testID="name-confirm" disabled={!name.trim()} onPress={() => onConfirm(name)} accessibilityRole="button" style={[x.dialogBtn, { backgroundColor: theme.primary, opacity: name.trim() ? 1 : 0.45 }]}><Text style={{ color: ink, fontSize: 14, fontWeight: '600' }}>{confirmLabel}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Sort and group ───────────────────────────────────────────────────────────

const SORTS: Sort[] = ['newest', 'oldest', 'largest', 'smallest'];
const groupsFor = (family: boolean): Group[] => (family ? ['day', 'week', 'month', 'category', 'wallet', 'member', 'title', 'none'] : ['day', 'week', 'month', 'category', 'wallet', 'title', 'none']);

export function SortSheet({ visible, sort, group, isFamily, onClose, onApply }: { visible: boolean; sort: Sort; group: Group; isFamily: boolean; onClose: () => void; onApply: (sort: Sort, group: Group) => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [s, setS] = useState(sort);
  const [g, setG] = useState(group);
  useEffect(() => { if (visible) { setS(sort); setG(group); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const flat = s === 'largest' || s === 'smallest';
  const ink = theme.isDark ? '#07202A' : '#FFFFFF';
  return (
    <SheetFrame visible={visible} title={t('sort.title')} onClose={onClose} height="66%" testID="sort-sheet"
                footer={<TouchableOpacity testID="sort-apply" onPress={() => { onApply(s, flat ? 'none' : g); onClose(); }} accessibilityRole="button" style={[x.apply, { backgroundColor: theme.primary }]}><Text style={{ color: ink, fontSize: 15, fontWeight: '600' }}>{t('sort.apply')}</Text></TouchableOpacity>}>
      <Text style={[x.label, { color: theme.textSecondary }]}>{t('sort.by')}</Text>
      {SORTS.map(k => (
        <TouchableOpacity key={k} testID={`sort-${k}`} onPress={() => setS(k)} accessibilityRole="radio" accessibilityState={{ checked: s === k }} style={[x.radio, { borderBottomColor: theme.border }]}>
          <MaterialIcons name={s === k ? 'radio-button-checked' : 'radio-button-unchecked'} size={24} color={s === k ? theme.primary : theme.textMuted} />
          <Text style={{ flex: 1, color: theme.text, fontSize: 14, fontWeight: s === k ? '600' : '500' }}>{t(`sort.${k}` as any)}</Text>
        </TouchableOpacity>
      ))}
      <Text style={[x.label, { color: theme.textSecondary, marginTop: 10 }]}>{t('group.by')}</Text>
      <View style={x.chips}>
        {groupsFor(isFamily).map(k => {
          const on = (flat ? 'none' : g) === k;
          return (
            <TouchableOpacity key={k} testID={`group-${k}`} disabled={flat && k !== 'none'} onPress={() => setG(k)} accessibilityRole="button" accessibilityState={{ selected: on, disabled: flat && k !== 'none' }}
                              style={[x.chip, { backgroundColor: on ? theme.primaryBg : theme.surface, borderColor: on ? theme.primary : theme.border, opacity: flat && k !== 'none' ? 0.4 : 1 }]}>
              {on ? <MaterialIcons name="check" size={16} color={theme.primary} /> : null}
              <Text style={{ fontSize: 13, fontWeight: on ? '600' : '500', color: on ? theme.primary : theme.text }}>{t(`group.${k}` as any)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {flat ? <View style={x.note}><MaterialIcons name="info" size={16} color={theme.textSecondary} /><Text style={{ flex: 1, color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>{t('sort.note')}</Text></View> : null}
    </SheetFrame>
  );
}

// ── The filters that are on, one chip each ───────────────────────────────────

export function ActiveBar({ filter, chips, wallets, members, scheduleNames, onRemove, onClear, onOpen }: {
  filter: HistoryFilter; chips: FilterChip[]; wallets: Wallet[]; members: FamilyMemberRow[]; scheduleNames: Record<string, string>; onRemove: (c: FilterChip) => void; onClear: () => void; onOpen: () => void;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  if (!chips.length) return null;
  const catName = (slug: string) => t(categoryLabelKey(slug, 'EXPENSE') as any);
  const pickText = (p: Pick) => (p.s ? `${catName(p.c)} › ${p.s}` : p.none ? t('filter.noSub', { cat: catName(p.c) }) : catName(p.c));
  const label = (c: FilterChip): string => {
    switch (c.kind) {
      case 'kind': return t(KIND_LABEL[c.ref as keyof typeof KIND_LABEL]);
      case 'wallet': return wallets.find(w => w.id === c.ref)?.name ?? '…';
      case 'member': return members.find(m => m.clientId === c.ref)?.name.split(' ')[0] ?? '…';
      case 'category': return c.exclude ? t('filter.chipNot', { name: pickText(c.ref as Pick) }) : pickText(c.ref as Pick);
      case 'amount': {
        const a = filter.minAmount, b = filter.maxAmount;
        return a !== null && b !== null ? t('filter.chipBetween', { a: shortAmount(a), b: shortAmount(b) }) : a !== null ? t('filter.chipOver', { n: shortAmount(a) }) : t('filter.chipUnder', { n: shortAmount(b ?? 0) });
      }
      case 'receipt': return t(c.ref === 'with' ? 'filter.chipReceiptWith' : 'filter.chipReceiptWithout');
      case 'source': return t(`filter.src.${c.ref}` as any);
      case 'loans': return t('history.loansOff');
      case 'schedule': return scheduleNames[String(c.ref)] ?? '…';
      case 'mode': return t(`filter.mode.${c.ref}` as any);
      case 'flag': return t(`filter.flag.${c.ref}` as any);
      case 'phase': return t(c.ref === 'upcoming' ? 'filter.chipPhaseUpcoming' : 'filter.chipPhasePast');
      case 'due': return t(`filter.due.${c.ref}` as any);
    }
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={x.rowScroll} contentContainerStyle={x.activeRow} testID="active-bar">
      {chips.map(c => (
        <View key={c.key} testID="active-chip" style={[x.achip, c.exclude ? { borderColor: theme.negative, borderStyle: 'dashed', backgroundColor: 'transparent' } : { backgroundColor: theme.primaryBg, borderColor: 'transparent' }]}>
          <TouchableOpacity onPress={onOpen} accessibilityRole="button" style={x.achipLabel}>
            {c.exclude ? <MaterialIcons name="block" size={15} color={theme.negative} /> : null}
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.exclude ? theme.negative : theme.primary }} numberOfLines={1}>{label(c)}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="active-chip-x" onPress={() => onRemove(c)} accessibilityRole="button" accessibilityLabel={`${label(c)} ✕`} style={x.achipX}><MaterialIcons name="close" size={18} color={c.exclude ? theme.negative : theme.primary} /></TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity testID="active-clear" onPress={onClear} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}><Text style={{ color: theme.primary, fontSize: 12.5, fontWeight: '600' }}>{t('filter.clearAll')}</Text></TouchableOpacity>
    </ScrollView>
  );
}

// ── Search: before typing (recent, things to try) and while typing (matching wallets and categories) ──

export function SearchPanel({ query, ctx, recent, onRecent, onClearRecent, onTry, onWallet, onCategory, views = [], onView, titles = [], people = [], onText }: {
  query: string; ctx: SearchContext; recent: string[]; onRecent: (text: string) => void; onClearRecent: () => void;
  onTry: (id: 'biggest' | 'noReceipt' | 'other') => void; onWallet: (id: string) => void; onCategory: (slug: string) => void;
  views?: Array<{ id: string; name: string }>; onView?: (id: string) => void; titles?: Array<{ title: string; count: number }>; people?: string[]; onText?: (text: string) => void;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const typing = query.trim().length > 0;
  const sug = suggest(query, ctx);
  const group = (title: string, children: React.ReactNode) => (<><Text style={[x.sugHead, { color: theme.textSecondary }]}>{title}</Text><View style={[x.sugCard, { backgroundColor: theme.surface }]}>{children}</View></>);

  if (!typing) {
    return (
      <View testID="search-idle" style={x.panel}>
        {recent.length ? (
          <>
            <View style={x.recentHead}><Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{t('search.recent')}</Text><TouchableOpacity onPress={onClearRecent} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.primary, fontSize: 12.5 }}>{t('search.clear')}</Text></TouchableOpacity></View>
            <View style={[x.sugCard, { backgroundColor: theme.surface }]}>
              {recent.map((r, i) => (
                <TouchableOpacity key={r} testID="recent-search" onPress={() => onRecent(r)} accessibilityRole="button" style={[x.sugRow, i < recent.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                  <MaterialIcons name="history" size={20} color={theme.textSecondary} /><Text style={{ color: theme.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
        {views.length ? (
          <>
            <Text style={[x.sugHead, { color: theme.text, marginTop: 8 }]}>{t('search.saved')}</Text>
            <View style={x.chips}>
              {views.map(v => (
                <TouchableOpacity key={v.id} testID="saved-view-chip" onPress={() => onView?.(v.id)} accessibilityRole="button" style={[x.try, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><MaterialIcons name="bookmark" size={18} color={theme.primary} /><Text style={{ color: theme.text, fontSize: 13, fontWeight: '500' }}>{v.name}</Text></View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
        <Text style={[x.sugHead, { color: theme.text, marginTop: 8 }]}>{t('search.try')}</Text>
        <View style={x.chips}>
          {([['biggest', 'search.tryBiggest'], ['noReceipt', 'search.tryNoReceipt'], ['other', 'search.tryOther']] as const).map(([id, key]) => (
            <TouchableOpacity key={id} testID={`try-${id}`} onPress={() => onTry(id)} accessibilityRole="button" style={[x.try, { backgroundColor: theme.primaryBg }]}><Text style={{ color: theme.primary, fontSize: 13, fontWeight: '500' }}>{t(key)}</Text></TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  const has = sug.wallets.length > 0 || sug.categories.length > 0 || titles.length > 0 || people.length > 0;
  return (
    <View testID="search-typing" style={x.panel}>
      {sug.wallets.length ? group(t('search.wallets'), sug.wallets.map((w, i) => (
        <TouchableOpacity key={w.id} testID="suggest-wallet" onPress={() => onWallet(w.id)} accessibilityRole="button" style={[x.sugRow, i < sug.wallets.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
          <MaterialIcons name="account-balance-wallet" size={20} color={theme.primary} /><Text style={{ color: theme.text, fontSize: 14, flex: 1 }}>{w.name}</Text>
        </TouchableOpacity>
      ))) : null}
      {sug.categories.length ? group(t('search.cats'), sug.categories.map((c, i) => (
        <TouchableOpacity key={c.slug} testID="suggest-category" onPress={() => onCategory(c.slug)} accessibilityRole="button" style={[x.sugRow, i < sug.categories.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
          <MaterialIcons name="category" size={20} color={theme.primary} /><Text style={{ color: theme.text, fontSize: 14, flex: 1 }}>{c.name}</Text>
        </TouchableOpacity>
      ))) : null}
      {titles.length || people.length ? group(t('search.titles') + (people.length ? ' · ' + t('search.people') : ''), (
        <>
          {people.map(p => (
            <TouchableOpacity key={'p' + p} testID="suggest-person" onPress={() => onText?.(p)} accessibilityRole="button" style={[x.sugRow, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
              <MaterialIcons name="person" size={20} color={theme.primary} /><Text style={{ color: theme.text, fontSize: 14, flex: 1 }}>{p}</Text>
            </TouchableOpacity>
          ))}
          {titles.map((tt, i) => (
            <TouchableOpacity key={'t' + tt.title} testID="suggest-title" onPress={() => onText?.(tt.title)} accessibilityRole="button" style={[x.sugRow, i < titles.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
              <MaterialIcons name="receipt-long" size={20} color={theme.primary} /><Text style={{ color: theme.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{tt.title}</Text><Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>{t('search.times', { n: tt.count })}</Text>
            </TouchableOpacity>
          ))}
        </>
      )) : null}
      <View style={[x.shortcuts, { backgroundColor: theme.primaryBg, marginTop: has ? 12 : 0 }]}>
        <Text style={{ color: theme.text, fontSize: 12, lineHeight: 20 }}><Text style={{ fontWeight: '600' }}>{t('search.shortcuts')}</Text> · wallet:momo  cat:food  type:income  receipt:no  &gt;5000  &lt;200  -cat:rent</Text>
      </View>
    </View>
  );
}

// ── Upcoming: what is due soon, with Confirm / Skip, folded away by default ──

export function UpcomingSection({ hidden, onChanged, due = [], schedules = [], forceOpen = false, showEmpty = false }: { hidden: boolean; onChanged: () => void; due?: Due[]; schedules?: string[]; forceOpen?: boolean; showEmpty?: boolean }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const when = useWhen();
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmItem | null>(null);

  const load = useCallback(() => {
    Promise.all([getAgenda(), getWaitingDates()]).then(([a, w]) => {
      // Due within a week, or already late or waiting for an answer.
      setItems(a.items.filter(i => i.overdue || i.waiting || i.failed || calendarDays(i.dueAt) <= 7));
      setWaiting(w);
    }).catch(() => undefined);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // The "Due and outcome" chips and the chosen schedules narrow what is shown (a loan date has no schedule, so it drops out when schedules are chosen).
  const dueOk = (i: AgendaItem) => !due.length || due.some(d => (d === 'overdue' ? i.overdue : d === 'today' ? calendarDays(i.dueAt) === 0 : d === 'week' ? calendarDays(i.dueAt) >= 0 && calendarDays(i.dueAt) <= 7 : i.failed));
  const shown = items.filter(i => dueOk(i) && (!schedules.length || (i.source === 'SCHEDULED' && schedules.includes(i.refId))));
  if (!shown.length) return showEmpty ? <StateBlock testID="upcoming-empty" icon="event-available" title={t('upcoming.empty')} body={t('upcoming.emptyBody')} /> : null;
  const isOpen = forceOpen || open;
  const late = shown.filter(i => i.overdue).length;
  const money = (i: AgendaItem) => (i.amount == null ? '' : `${i.direction === 'IN' ? '+' : ''}${formatMoney(i.amount, i.currency || 'RWF', { hidden })}`);
  const skip = (i: AgendaItem) => Alert.alert(t('sched.skipTitle'), t('sched.skipMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('sched.skip'), onPress: async () => { try { await skipOccurrence(i.occurrenceId!); load(); onChanged(); } catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave')); } } },
  ]);
  const confirm = (i: AgendaItem) => {
    const w = waiting.find(x => x.id === i.occurrenceId);
    setConfirming({ occurrenceId: i.occurrenceId!, title: i.title, type: i.direction === 'IN' ? 'INCOME' : 'EXPENSE', amount: i.amount ?? 0, currency: i.currency, walletId: w?.walletId ?? null });
  };

  return (
    <View testID="upcoming">
      <TouchableOpacity testID="upcoming-toggle" onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={[x.upHead, { backgroundColor: theme.surface }]}>
        <MaterialIcons name="event" size={20} color={theme.primary} />
        <Text style={{ flex: 1, color: theme.text, fontSize: 13, fontWeight: '600' }}>{t('upcoming.title', { n: shown.length })}</Text>
        {late ? <View style={[x.late, { backgroundColor: theme.negativeTint }]}><MaterialIcons name="error" size={14} color={theme.negative} /><Text style={{ color: theme.negative, fontSize: 11.5, fontWeight: '600' }}>{t('upcoming.overdue', { n: late })}</Text></View> : null}
        <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={22} color={theme.textMuted} />
      </TouchableOpacity>
      {isOpen ? (
        <View style={[x.upList, { backgroundColor: theme.surface }]}>
          {shown.map((i, idx) => {
            const tint = i.overdue ? OWE : i.direction === 'IN' ? OWED : theme.primary;
            return (
              <View key={i.key} testID="upcoming-row" style={[x.upRow, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <TouchableOpacity onPress={() => openAgendaItem(i)} accessibilityRole="button" style={x.upMain}>
                  <View style={[x.upIcon, { backgroundColor: `${tint}1F` }]}><MaterialIcons name={i.source === 'SCHEDULED' ? 'event-repeat' : i.source === 'DEBT' ? 'north-east' : 'south-west'} size={17} color={tint} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>{agendaTitle(i, t)}</Text>
                    <Text style={{ color: i.overdue ? OWE : theme.textSecondary, fontSize: 12 }} numberOfLines={1}>{when(i.dueAt)}</Text>
                  </View>
                  <Text style={{ color: i.direction === 'IN' ? OWED : theme.text, fontSize: 14, fontWeight: '600' }}>{money(i)}</Text>
                </TouchableOpacity>
                {i.failed ? (
                  <View testID="upcoming-failed" style={[x.failBox, { backgroundColor: theme.negativeTint }]}>
                    <MaterialIcons name="error" size={16} color={theme.negative} />
                    <Text style={{ flex: 1, color: theme.negative, fontSize: 12, lineHeight: 16 }}>{i.failReason ? t('upcoming.failed', { reason: i.failReason }) : t('upcoming.failedNoReason')}</Text>
                  </View>
                ) : null}
                <View style={x.upActs}>
                  {i.waiting && i.occurrenceId ? (
                    <>
                      <TouchableOpacity testID="upcoming-confirm" onPress={() => confirm(i)} accessibilityRole="button" style={[x.act, { backgroundColor: theme.primaryBg }]}><MaterialIcons name={i.failed ? 'refresh' : 'check'} size={17} color={theme.primary} /><Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>{t(i.failed ? 'upcoming.retry' : 'upcoming.confirm')}</Text></TouchableOpacity>
                      <TouchableOpacity testID="upcoming-skip" onPress={() => skip(i)} accessibilityRole="button" style={[x.act, { backgroundColor: theme.surface2 }]}><MaterialIcons name="skip-next" size={17} color={theme.text} /><Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{t('upcoming.skip')}</Text></TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => openAgendaItem(i)} accessibilityRole="button" style={[x.act, { backgroundColor: theme.surface2 }]}><MaterialIcons name="open-in-new" size={17} color={theme.text} /><Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{t('upcoming.open')}</Text></TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      <Modal visible={!!confirming} transparent animationType="fade" onRequestClose={() => setConfirming(null)}>
        {confirming ? <ConfirmSheet item={confirming} onClose={() => setConfirming(null)} onDone={() => { setConfirming(null); load(); onChanged(); }} /> : null}
      </Modal>
    </View>
  );
}

void router;

const x = StyleSheet.create({
  rowScroll: { flexGrow: 0, flexShrink: 0 },
  label: { fontSize: 12.5, fontWeight: '600', minHeight: 32, paddingTop: 8 },
  radio: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  note: { flexDirection: 'row', gap: 6, marginTop: 12 },
  apply: { flex: 1, minHeight: 52, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },

  activeRow: { gap: 6, paddingHorizontal: 12, paddingTop: 2, paddingBottom: 8, alignItems: 'center' },
  achip: { minHeight: 34, borderRadius: 99, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center' },
  achipLabel: { minHeight: 34, paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 190 },
  achipX: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  panel: { paddingHorizontal: 16, paddingTop: 4 },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  sugHead: { fontSize: 12, fontWeight: '600', minHeight: 32, paddingTop: 8 },
  sugCard: { borderRadius: 18, paddingHorizontal: 14 },
  sugRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  try: { minHeight: 40, paddingHorizontal: 14, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  shortcuts: { borderRadius: 16, padding: 12 },

  upHead: { marginHorizontal: 12, marginTop: 6, minHeight: 44, paddingLeft: 14, paddingRight: 6, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  late: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  upList: { marginHorizontal: 12, marginTop: 6, borderRadius: 18, paddingHorizontal: 14 },
  upRow: { paddingVertical: 10 },
  upMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  upIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  upActs: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dialogBack: { flex: 1, backgroundColor: 'rgba(5,12,16,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 26, padding: 20 },
  dialogInput: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, marginTop: 4, fontSize: 15, outlineStyle: 'none' as any },
  dialogBtn: { flex: 1, minHeight: 48, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  failBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, padding: 8, borderRadius: 12 },
  act: { minHeight: 44, paddingHorizontal: 16, borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 4 },
});
