// History: what happened to my money. Rebuilt on the web from the design (design/Home screen redesign review): one summary
// card with the period and per-currency totals, kind chips, filters, a wallet strip, Upcoming, and a paged list grouped by day.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect, useLocalSearchParams } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { useCurrency } from '@/context/currency-context';
import { usePreferences } from '@/context/preferences-context';
import { storage } from '@/lib/storage';
import { ScopePill } from '@/components/family/scope-switcher';
import { MemberFilter } from '@/components/family/member-filter';
import { OptionRow, OptionSheet, Tile } from '@/components/add/option-sheet';
import { PeriodSheet, usePeriodLabel } from '@/components/home/period-sheet';
import { DateTimeSheet } from '@/components/datetime-sheet';
import { HistoryRow, clock } from '@/components/history/history-row';
import { PeekSheet, ResultSheet, SelectBar, Snackbar, SwipeRow, type PeekAction } from '@/components/history/history-select';
import { takePendingUndo } from '@/utils/pending-undo';
import { DayHeader, GroupHeader, StatementCard, KindChips, ListFooter, OfflineBanner, SkeletonRows, StateBlock, SummaryCard, WalletStrip, type SummaryTab } from '@/components/history/history-parts';
import { ActiveBar, SearchPanel, SortSheet, UpcomingSection } from '@/components/history/history-extras';
import { FilterSheet } from '@/components/history/filter-sheet';
import { getFeed, getFeedSummary, getGroups, getStatement, getSuggestions, type Statement } from '@/services/history.service';
import { createSavedView, deleteSavedView, getSavedViews, renameSavedView, type SavedView } from '@/services/saved-views.service';
import { getScheduledList, type Scheduled } from '@/services/scheduled.service';
import { getWallets, type Wallet } from '@/services/wallet.service';
import { bulkChange, restoreTrash, type BulkAction } from '@/services/transaction.service';
import { getMembers, type FamilyMemberRow } from '@/services/family.service';
import { CATEGORIES, canonicalCategory, categoryLabelKey, categoryOf, type CategorySlug } from '@/constants/categories';
import { detailParams } from '@/utils/tx-nav';
import { canGoNext, fromDay, includesToday, shiftPeriod, thisMonth, type Period } from '@/utils/period';
import {
  activeFilterCount, clearFilter, deleteEffect, duplicateParams, emptyFilter, isLocked, recurringParams, similarRows, shortAmount, ZERO_DECIMAL, emptyKind, filterChips, groupByKey, groupRows, groupShare, isFiltered, isKindOn, isServerGroup, removeChip, setKind,
  type FeedKind, type FeedRow, type FeedSummary, type GroupSummary, type HistoryFilter,
} from '@/utils/history';
import { FILTER_KEYS, filterFromQuery, filterToQuery, fromStored, hasFilterQuery, toStored } from '@/utils/history-url';
import { applySearchTokens, rememberSearch, type SearchContext } from '@/utils/history-search';

const ALL_KINDS: FeedKind[] = ['all', 'income', 'expense', 'transfer', 'debt', 'credit', 'scheduled'];
const FAMILY_KINDS: FeedKind[] = ['all', 'income', 'expense', 'transfer'];
const asKind = (v: unknown): FeedKind => (ALL_KINDS.includes(v as FeedKind) ? (v as FeedKind) : 'all');
const RECENT_KEY = '@aby_history_recent';

/** The period a link asks for ("See all" on Home sends the days it was showing); otherwise this month. */
function periodFromParams(p: { from?: string; to?: string; all?: string }): Period {
  if (p.all === 'true') return { kind: 'all' };
  if (p.from && p.to && fromDay(p.from) && fromDay(p.to)) return { kind: 'range', from: p.from, to: p.to };
  return thisMonth();
}

const loadRecent = (): string[] => { try { const v = JSON.parse(storage.get(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 6) : []; } catch { return []; } };

export default function HistoryScreen() {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const scope = useScope();
  const isFamily = scope.isFamily;
  const { currency } = useCurrency();
  const fallback = currency.code;
  const { prefs, setPref } = usePreferences();
  const params = useLocalSearchParams<{ openSearch?: string; view?: string; includeLoans?: string; from?: string; to?: string; all?: string; walletId?: string }>();
  const periodName = usePeriodLabel();

  // ── The filter (everything but the search words, which wait a moment before they are sent) ──
  const [core, setCore] = useState<HistoryFilter>(() => {
    const base: HistoryFilter = {
      ...emptyFilter(periodFromParams(params)),
      kinds: asKind(params.view) === 'all' ? [] : [asKind(params.view)],
      includeLoans: params.includeLoans ? params.includeLoans !== 'false' : prefs.includeLoans,
      walletIds: params.walletId ? [params.walletId] : [],
    };
    return hasFilterQuery(params) ? filterFromQuery(params, base) : base;
  });
  const [searchOpen, setSearchOpen] = useState(params.openSearch === 'true');
  const [query, setQuery] = useState(() => (hasFilterQuery(params) ? filterFromQuery(params, emptyFilter(thisMonth())).search : ''));
  const [search, setSearch] = useState(() => (hasFilterQuery(params) ? filterFromQuery(params, emptyFilter(thisMonth())).search : ''));
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [sheet, setSheet] = useState<null | 'filter' | 'sort' | 'period' | 'menu' | 'jump' | 'pickCategory' | 'pickWallet'>(null);
  const [tab, setTab] = useState<SummaryTab | null>(null);
  const searchRef = useRef<TextInput>(null);
  const filter: HistoryFilter = useMemo(() => ({ ...core, memberId: isFamily ? core.memberId : null, search }), [core, isFamily, search]);
  const patch = (p: Partial<HistoryFilter>) => setCore(c => ({ ...c, ...p }));

  // The screen stays mounted as a tab: follow what Home (or a wallet) sends each time, and fall back to this month when nothing is sent.
  const fromLink = useRef(false);
  useEffect(() => {
    if (hasFilterQuery(params)) { setCore(c => filterFromQuery(params, c)); return; }
    setCore(c => {
      let next = c;
      if (params.all === 'true' || (params.from && params.to)) { fromLink.current = true; next = { ...next, period: periodFromParams(params) }; }
      else if (fromLink.current) { fromLink.current = false; next = { ...next, period: thisMonth() }; }
      const kind = asKind(params.view);
      next = { ...next, kinds: kind === 'all' ? [] : [kind], walletIds: params.walletId ? [params.walletId] : [] };
      if (params.includeLoans) next = { ...next, includeLoans: params.includeLoans !== 'false' };
      return next;
    });
    if (params.openSearch === 'true') { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 150); }
  }, [params.all, params.from, params.to, params.view, params.includeLoans, params.walletId, params.openSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing waits a moment before it asks the server.
  useEffect(() => { const id = setTimeout(() => setSearch(query.trim()), 300); return () => clearTimeout(id); }, [query]);
  // Changing space starts from the top of that space.
  // Switching space starts a clean filter (but the first run keeps what the address asked for).
  const spaceKey = useRef(`${scope.family?.id}|${isFamily}`);
  useEffect(() => {
    const now = `${scope.family?.id}|${isFamily}`;
    if (spaceKey.current === now) return;
    spaceKey.current = now;
    setCore(c => ({ ...emptyFilter(c.period), sort: c.sort })); setTab(null); setQuery(''); setSearch('');
  }, [scope.family?.id, isFamily]);

  const filterKey = JSON.stringify(filter);
  const filtered = isFiltered(filter);

  // The address always says what the page shows (a link or a reload then shows the same list). Written quietly: no new history entry.
  useEffect(() => {
    const id = setTimeout(() => {
      // Only the filter keys are rewritten; anything else in the address (mock switches, a Home link's leftovers) stays.
      const merged = new URLSearchParams(window.location.search);
      FILTER_KEYS.forEach(k => merged.delete(k));
      Object.entries(filterToQuery(filter)).forEach(([k, v]) => merged.set(k, v));
      const q = merged.toString();
      const next = window.location.pathname + (q ? '?' + q : '');
      if (next !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', next);
    }, 300);
    return () => clearTimeout(id);
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The list ──
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [refreshing, setRefreshing] = useState(false);
  const [lastOk, setLastOk] = useState<Date | null>(null);
  const listReq = useRef(0);

  const loadFirst = useCallback(async (silent = false) => {
    const id = ++listReq.current;
    if (!silent) { setState('loading'); setMore('idle'); }
    try {
      const r = await getFeed(filter, { fallbackCurrency: fallback });
      if (id !== listReq.current) return;
      setRows(r.items); setCursor(r.nextCursor); setState('ready'); setLastOk(new Date());
    } catch {
      if (id !== listReq.current) return;
      if (!silent) { setRows([]); setCursor(null); }
      setState(prev => (silent && prev === 'ready' ? 'ready' : 'error'));
    } finally { if (id === listReq.current) setRefreshing(false); }
  }, [filterKey, fallback]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!cursor || more === 'loading') return;
    const id = listReq.current;
    setMore('loading');
    try {
      const r = await getFeed(filter, { cursor, fallbackCurrency: fallback });
      if (id !== listReq.current) return;
      setRows(prev => { const seen = new Set(prev.map(x => x.id)); return [...prev, ...r.items.filter(x => !seen.has(x.id))]; });
      setCursor(r.nextCursor); setMore('idle');
    } catch { if (id === listReq.current) setMore('failed'); }
  }, [cursor, more, filterKey, fallback]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The totals ──
  const [summary, setSummary] = useState<FeedSummary | null>(null);
  const [sumState, setSumState] = useState<'loading' | 'ready' | 'error'>('loading');
  const sumReq = useRef(0);
  const wantConverted = tab?.kind === 'converted';
  const loadSummary = useCallback(async () => {
    const id = ++sumReq.current;
    setSumState(s => (s === 'ready' ? 'ready' : 'loading'));
    try {
      const r = await getFeedSummary(filter, { fallbackCurrency: fallback, convertTo: wantConverted ? fallback : undefined });
      if (id !== sumReq.current) return;
      setSummary(r); setSumState('ready');
    } catch { if (id === sumReq.current) setSumState('error'); }
  }, [filterKey, fallback, wantConverted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadFirst(); }, [loadFirst]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  // Coming back from a detail screen (or another tab) shows what changed, without a flash.
  useFocusEffect(useCallback(() => {
    loadFirst(true); loadSummary();
    const p = takePendingUndo();
    if (p) setSnack({ message: p.message, undo: p.trashIds });
  }, [loadFirst, loadSummary]));

  // ── Group headers (category, wallet, member, title): totals for the whole filter ──
  const [groupSums, setGroupSums] = useState<GroupSummary[]>([]);
  const wantsGroups = isServerGroup(core.group) && core.sort !== 'largest' && core.sort !== 'smallest';
  useEffect(() => {
    if (!wantsGroups) { setGroupSums([]); return; }
    let live = true;
    getGroups(filter, { fallbackCurrency: fallback }).then(r => { if (live) setGroupSums(r.groups); }).catch(() => { if (live) setGroupSums([]); });
    return () => { live = false; };
  }, [filterKey, wantsGroups, fallback]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── One wallet chosen: its statement for the period ──
  const oneWallet = core.walletIds.length === 1 ? core.walletIds[0] : null;
  const [statement, setStatement] = useState<Statement | null>(null);
  const [stmtState, setStmtState] = useState<'loading' | 'ready' | 'error'>('loading');
  const loadStatement = useCallback(() => {
    if (!oneWallet) { setStatement(null); return; }
    setStmtState('loading');
    getStatement(filter).then(r => { setStatement(r); setStmtState('ready'); }).catch(() => { setStatement(null); setStmtState('error'); });
  }, [oneWallet, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadStatement(); }, [loadStatement]);

  // ── Schedules (for the filter sheet and its chips) and saved views ──
  const [schedules, setSchedules] = useState<Scheduled[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => {
    if (isFamily) { setSchedules([]); return; }
    Promise.all([getScheduledList(), getScheduledList('ENDED')]).then(([a, b]) => setSchedules([...a, ...b])).catch(() => setSchedules([]));
  }, [isFamily, scope.family?.id]);
  const loadViews = useCallback(() => { getSavedViews().then(setViews).catch(() => setViews([])); }, []);
  useEffect(() => { loadViews(); }, [loadViews, scope.family?.id, isFamily]);
  const nameError = (e: any): string => (e?.response?.status === 409 ? t('filter.viewExists') : e?.response?.data?.message || t('add.errSave'));
  const saveView = async (name: string, f: HistoryFilter): Promise<string | null> => {
    try { await createSavedView(name.trim(), toStored(f, new Date(), prefs.weekStart)); loadViews(); return null; } catch (e) { return nameError(e); }
  };
  const renameView = async (v: SavedView, name: string): Promise<string | null> => {
    try { await renameSavedView(v.id, name.trim()); loadViews(); return null; } catch (e) { return nameError(e); }
  };
  const removeView = (v: SavedView) => Alert.alert(t('filter.deleteView'), t('filter.deleteViewMsg', { name: v.name }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('filter.deleteView'), style: 'destructive', onPress: async () => { try { await deleteSavedView(v.id); loadViews(); } catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave')); } } },
  ]);
  const applyView = (v: SavedView) => { setCore(c => ({ ...fromStored(v.filter, { ...emptyFilter(c.period), memberId: null }, new Date(), prefs.weekStart) })); setQuery(''); setSearch(''); closeSearch(); scroller.current?.scrollTo({ y: 0, animated: false }); };

  // ── Wallets, family members, connection ──
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [members, setMembers] = useState<FamilyMemberRow[]>([]);
  useEffect(() => { getWallets().then(setWallets).catch(() => setWallets([])); }, [scope.family?.id, isFamily]);
  useEffect(() => { if (isFamily && scope.family) getMembers(scope.family.id).then(setMembers).catch(() => setMembers([])); else setMembers([]); }, [isFamily, scope.family?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Search: finished words become filters ──
  const searchCtx: SearchContext = useMemo(() => ({
    wallets: wallets.map(w => ({ id: w.id, name: w.name })),
    categories: CATEGORIES.filter(c => !c.system).map(c => ({ slug: c.id, name: t(categoryLabelKey(c.id, c.for.includes('EXPENSE') ? 'EXPENSE' : 'INCOME') as any) })),
  }), [wallets, t]);
  const typeSearch = (text: string, final = false) => {
    const r = applySearchTokens(text, core, searchCtx, final);
    if (r.applied.length) { setCore(r.filter); setQuery(r.rest ? (final ? r.rest : `${r.rest} `) : ''); } else setQuery(text);
    if (final && r.rest) { const next = rememberSearch(recent, r.rest); setRecent(next); storage.set(RECENT_KEY, JSON.stringify(next)); }
  };
  const closeSearch = () => { setSearchOpen(false); setQuery(''); setSearch(''); };
  // Titles used before and the people someone has loans with, for what is being typed.
  const [suggested, setSuggested] = useState<{ titles: Array<{ title: string; count: number }>; people: string[] }>({ titles: [], people: [] });
  useEffect(() => {
    const q = query.trim();
    if (!searchOpen || q.length < 2 || /[:<>]/.test(q)) { setSuggested({ titles: [], people: [] }); return; }
    let live = true;
    const id = setTimeout(() => { getSuggestions(q).then(r => { if (live) setSuggested(r); }).catch(() => undefined); }, 80);
    return () => { live = false; clearTimeout(id); };
  }, [query, searchOpen]);

  // ── Scrolling and jumping ──
  const scroller = useRef<ScrollView>(null);
  const [showTop, setShowTop] = useState(false);
  const onScroll = (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setShowTop(contentOffset.y > 700);
    if (contentSize.height - (contentOffset.y + layoutMeasurement.height) < 500 && cursor && more === 'idle' && state === 'ready') loadMore();
  };
  const [jump, setJump] = useState<string | null>(null);

  // ── What the screen says ──
  const flat = filter.sort === 'largest' || filter.sort === 'smallest';
  const mode = flat ? 'none' : core.group;
  const serverMode = isServerGroup(mode);
  const groups = useMemo(() => (serverMode ? groupByKey(rows, mode, s => canonicalCategory(s).id) : groupRows(rows, mode, fallback, prefs.weekStart)), [rows, mode, serverMode, fallback, prefs.weekStart]);
  const shareCurrency = tab?.kind === 'currency' ? tab.currency : summary?.currencies[0]?.currency ?? fallback;
  const scheduleNames = useMemo(() => Object.fromEntries(schedules.map(x => [x.id, x.title])), [schedules]);
  const hidden = prefs.hideBalances;
  const kinds = isFamily ? FAMILY_KINDS : ALL_KINDS;
  const chips = filterChips(filter);
  const label = periodName(filter.period);
  const before = shiftPeriod(filter.period, -1);
  const prevLabel = before && filter.period.kind !== 'range' ? periodName(before) : t('history.previousPeriod');
  const empty = state === 'ready' ? emptyKind({ rows: rows.length, hasAny: true, filtered, periodIsAll: filter.period.kind === 'all' }) : null;
  const searching = !!search.trim();
  // While searching, the list stays visible once a search word has become a filter (wallet:momo), not only for plain text.
  const showList = !searchOpen || searching || chips.length > 0;

  // After "Jump to date" loads that month, scroll to the day (or the nearest one before it).
  useEffect(() => {
    if (!jump || state !== 'ready' || !groups.length) return;
    const target = groups.find(g => g.key <= jump) ?? groups[groups.length - 1];
    const el = document.querySelector(`[data-testid="day-${target.key}"]`);
    if (el) { el.scrollIntoView({ block: 'start' }); setJump(null); }
  }, [jump, state, groups]);

  const groupHead = (key: string, first?: FeedRow) => {
    const sum = groupSums.find(x => x.key === key);
    const base = { count: sum?.count ?? 0, totals: sum?.totals ?? [], share: groupShare(sum, groupSums, shareCurrency), hidden };
    if (mode === 'category') { const def = categoryOf(key as CategorySlug); return <GroupHeader {...base} label={t(categoryLabelKey(key, 'EXPENSE') as any)} icon={def.icon} color={def.color} />; }
    if (mode === 'wallet') { const w = wallets.find(x => x.id === key); return <GroupHeader {...base} label={w?.name ?? first?.wallet?.name ?? '—'} icon="account-balance-wallet" color={w?.color} />; }
    if (mode === 'member') { const m = members.find(x => x.clientId === key); return <GroupHeader {...base} label={m ? (m.isYou ? t('family.tx.you') : m.name) : first?.author?.name ?? '—'} icon="person" />; }
    return <GroupHeader {...base} label={first?.title ?? key} icon="receipt-long" />;
  };

  // ── Select mode: choose rows, then delete, change the category or move them to another wallet ──
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [peek, setPeek] = useState<FeedRow | null>(null);      // the row whose quick look is open
  const [single, setSingle] = useState<FeedRow | null>(null);  // the row a category / wallet choice is for (instead of the chosen rows)
  const [result, setResult] = useState<{ done: number; failed: Array<{ title: string; reason: string }> } | null>(null);
  const [snack, setSnack] = useState<{ message: string; undo?: string[] } | null>(null);
  const stopSelecting = () => { setSelecting(false); setPicked([]); };
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const targetRows = single ? [single] : rows.filter(r => picked.includes(r.id));
  const pickedRows = targetRows;
  const reload = () => { loadFirst(true); loadSummary(); loadStatement(); };
  const run = async (change: BulkAction, ids: string[] = targetRows.map(r => r.id)) => {
    setWorking(true); setSheet(null); setPeek(null);
    const origin = single;
    try {
      const res = await bulkChange(ids, change);
      if (res.failed.length) setResult({ done: res.done.length, failed: res.failed.map(x => ({ title: rows.find(y => y.id === x.id)?.title ?? '—', reason: x.reason })) });
      if (res.done.length && (!res.failed.length || change.action === 'delete')) setSnack(change.action === 'delete' ? { message: t('select.deleted', { n: res.done.length }), undo: res.trashIds } : { message: t('select.changed', { n: res.done.length }) });
      stopSelecting(); setSingle(null); reload();
      // One row's category changed: offer the same change for the other rows with that title.
      if (change.action === 'category' && origin && res.done.includes(origin.id)) {
        const more = similarRows(rows, origin, change.category);
        if (more.length) {
          const cat = t(categoryLabelKey(change.category, origin.type === 'INCOME' ? 'INCOME' : 'EXPENSE') as any);
          Alert.alert(t('peek.similarYes'), t('peek.similar', { n: more.length, title: origin.title, category: cat }), [
            { text: t('peek.similarNo'), style: 'cancel' },
            { text: t('peek.similarYes'), onPress: () => run(change, more.map(r => r.id)) },
          ]);
        }
      }
    } catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('select.error')); setSingle(null); }
    finally { setWorking(false); }
  };
  const confirmDelete = () => confirmDeleteRows(targetRows);
  const confirmDeleteRows = (list: FeedRow[]) => {
    const fx = deleteEffect(list, fallback).map(x => `${x.change > 0 ? '+' : '−'}${shortAmount(Math.abs(x.change), ZERO_DECIMAL.has(x.currency))} ${x.currency}`).join(', ');
    Alert.alert(t('select.deleteTitle', { n: list.length }), fx ? t('select.effect', { effect: fx }) : t('select.noEffect'), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => setSingle(null) },
      { text: t('select.delete'), style: 'destructive', onPress: () => run({ action: 'delete' }, list.map(r => r.id)) },
    ]);
  };
  const undoDelete = async (ids: string[]) => {
    try { for (const id of ids) await restoreTrash(id); setSnack({ message: t('select.undone') }); reload(); }
    catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('select.error')); }
  };

  const peekActions = (r: FeedRow): { note: string | null; actions: PeekAction[] } => {
    const locked = isLocked(r), transfer = r.type === 'TRANSFER';
    const go = (params: Record<string, string> | null) => { setPeek(null); if (params) router.push({ pathname: '/(dashboard)/add', params } as any); };
    const act = (id: string, icon: string, label: string, onPress: () => void, danger = false): PeekAction => ({ id, icon, label, onPress, danger });
    const open = act('open', 'open-in-new', t('peek.open'), () => { setPeek(null); router.push({ pathname: '/(dashboard)/transaction-detail', params: detailParams(r as never) } as any); });
    const del = () => { setSingle(r); setPeek(null); confirmDeleteRows([r]); };
    if (locked) return { note: t('peek.locked'), actions: [open] };
    if (transfer) return { note: t('peek.transfer'), actions: [open, act('delete', 'delete', t('peek.delete'), del, true)] };
    return {
      note: null,
      actions: [
        open,
        act('duplicate', 'content-copy', t('peek.duplicate'), () => go(duplicateParams(r))),
        ...(isFamily ? [] : [act('recurring', 'repeat', t('peek.recurring'), () => go(recurringParams(r)))]),
        act('category', 'category', t('peek.category'), () => { setSingle(r); setPeek(null); setSheet('pickCategory'); }),
        act('wallet', 'account-balance-wallet', t('peek.wallet'), () => { setSingle(r); setPeek(null); setSheet('pickWallet'); }),
        act('delete', 'delete', t('peek.delete'), del, true),
      ],
    };
  };
  const startSelecting = (r: FeedRow) => { if (isLocked(r)) return; setSelecting(true); setPicked([r.id]); };
  const openRow = (r: FeedRow) => selecting ? (isLocked(r) ? undefined : toggle(r.id)) : router.push({ pathname: '/(dashboard)/transaction-detail', params: detailParams(r as never) } as any);
  const goTo = (p: Period | null) => { if (p) { patch({ period: p }); scroller.current?.scrollTo({ y: 0, animated: false }); } };
  const toggleLoans = () => { const next = !core.includeLoans; patch({ includeLoans: next }); setPref('includeLoans', next); };
  const tryThis = (id: 'biggest' | 'noReceipt' | 'other') => {
    if (id === 'biggest') patch({ sort: 'largest' });
    else if (id === 'noReceipt') patch({ receipt: 'without' });
    else patch({ include: [{ c: 'other' }] });
    closeSearch();
  };
  const hasUpcoming = !isFamily && !searching && filter.phase !== 'past' && (includesToday(filter.period) || filter.phase === 'upcoming');
  const onlyUpcoming = !isFamily && filter.phase === 'upcoming';

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <PeriodSheet visible={sheet === 'period'} period={filter.period} onClose={() => setSheet(null)} onChange={p => goTo(p)} presets />
      <FilterSheet visible={sheet === 'filter'} filter={filter} onClose={() => setSheet(null)} onApply={f => { setCore({ ...f, search: '' }); scroller.current?.scrollTo({ y: 0, animated: false }); }} wallets={wallets} isFamily={isFamily} fallbackCurrency={fallback}
                   schedules={schedules} views={views} onSaveView={saveView} onApplyView={applyView} onRenameView={renameView} onDeleteView={removeView} />
      <SortSheet visible={sheet === 'sort'} sort={filter.sort} group={mode} isFamily={isFamily} onClose={() => setSheet(null)} onApply={(sort, g) => patch({ sort, group: g })} />
      <DateTimeSheet visible={sheet === 'jump'} mode="date" title={t('history.jumpTitle')} defaultView="calendar" presets={false} maxDate={new Date()} onClose={() => setSheet(null)}
                     onConfirm={d => { setSheet(null); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; patch({ period: { kind: 'month', month: d.getMonth() + 1, year: d.getFullYear() } }); setJump(day); }} />
      <OptionSheet visible={sheet === 'menu'} title={t('history.more')} onClose={() => setSheet(null)}>
        <OptionRow testID="menu-sort" title={t('sort.title')} tile={<Tile icon="swap-vert" color={theme.primary} bg={theme.primaryBg} />} onPress={() => setSheet('sort')} />
        <OptionRow testID="menu-hide-amounts" title={t(hidden ? 'history.showAmounts' : 'history.hideAmounts')} tile={<Tile icon={hidden ? 'visibility' : 'visibility-off'} color={theme.primary} bg={theme.primaryBg} />}
                   onPress={() => { setPref('hideBalances', !hidden); setSheet(null); }} />
        <OptionRow testID="menu-select" title={t('select.start')} tile={<Tile icon="checklist" color={theme.primary} bg={theme.primaryBg} />} onPress={() => { setSheet(null); setSelecting(true); }} />
        <OptionRow testID="menu-activity" title={t('act.menu')} tile={<Tile icon="history" color={theme.primary} bg={theme.primaryBg} />} onPress={() => { setSheet(null); router.push('/(dashboard)/activity' as any); }} />
        <OptionRow testID="menu-trash" title={t('trash.menu')} tile={<Tile icon="delete-outline" color={theme.primary} bg={theme.primaryBg} />} onPress={() => { setSheet(null); router.push('/(dashboard)/trash' as any); }} />
      </OptionSheet>
      <OptionSheet visible={sheet === 'pickCategory'} title={t('select.pickCategory')} onClose={() => { setSheet(null); setSingle(null); }}>
        {CATEGORIES.filter(c => c.for.includes(pickedRows.some(r => r.type === 'INCOME') && !pickedRows.some(r => r.type === 'EXPENSE') ? 'INCOME' : 'EXPENSE')).map(c => (
          <OptionRow key={c.id} testID={`pick-cat-${c.id}`} title={t(categoryLabelKey(c.id, pickedRows.some(r => r.type === 'INCOME') && !pickedRows.some(r => r.type === 'EXPENSE') ? 'INCOME' : 'EXPENSE') as any)} tile={<Tile icon={c.icon} color={c.color} bg={`${c.color}26`} />} onPress={() => run({ action: 'category', category: c.id })} />
        ))}
      </OptionSheet>
      <OptionSheet visible={sheet === 'pickWallet'} title={t('select.pickWallet')} onClose={() => { setSheet(null); setSingle(null); }}>
        {wallets.filter(w => !w.archived).map(w => (
          <OptionRow key={w.id} testID={`pick-wallet-${w.id}`} title={w.name} tile={<Tile icon="account-balance-wallet" color={w.color ?? theme.primary} bg={theme.primaryBg} />} onPress={() => run({ action: 'wallet', walletId: w.id })} />
        ))}
      </OptionSheet>

      <ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={64} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFirst(true); loadSummary(); }} tintColor={theme.primary} />}>
        {!online ? <OfflineBanner since={lastOk ? clock(lastOk, locale, prefs.timeFormat === '12h') : '—'} /> : null}

        {searchOpen ? (
          <View style={s.searchBar}>
            <TouchableOpacity onPress={closeSearch} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Back"><MaterialIcons name="arrow-back" size={24} color={theme.text} /></TouchableOpacity>
            <View style={[s.searchField, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
              <MaterialIcons name="search" size={20} color={theme.textSecondary} />
              <TextInput ref={searchRef} testID="history-search" value={query} onChangeText={v => typeSearch(v)} onSubmitEditing={() => typeSearch(query, true)} placeholder={t('history.searchPlaceholder')} placeholderTextColor={theme.textMuted}
                         autoCapitalize="none" returnKeyType="search" style={[s.searchInput, { color: theme.text }]} />
              {query ? <TouchableOpacity onPress={() => { setQuery(''); setSearch(''); }} accessibilityRole="button" accessibilityLabel={t('history.clearSearch')}><MaterialIcons name="cancel" size={20} color={theme.textSecondary} /></TouchableOpacity> : null}
            </View>
          </View>
        ) : (
          <View style={s.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ alignSelf: 'flex-start' }}><ScopePill /></View>
              <Text testID="history-title" style={[s.title, { color: theme.text }]}>{t('history.title')}</Text>
            </View>
            <TouchableOpacity testID="history-search-btn" onPress={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 150); }} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={t('history.search')}><MaterialIcons name="search" size={24} color={theme.text} /></TouchableOpacity>
            <TouchableOpacity testID="history-filter" onPress={() => setSheet('filter')} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={t('history.filters')}>
              <MaterialIcons name="tune" size={24} color={theme.text} />
              {activeFilterCount(filter) ? <View testID="filter-badge" style={[s.badge, { backgroundColor: theme.primary }]}><Text style={{ color: theme.isDark ? '#07202A' : '#FFFFFF', fontSize: 11, fontWeight: '600' }}>{activeFilterCount(filter)}</Text></View> : null}
            </TouchableOpacity>
            <TouchableOpacity testID="history-more" onPress={() => setSheet('menu')} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={t('history.more')}><MaterialIcons name="more-vert" size={24} color={theme.text} /></TouchableOpacity>
          </View>
        )}

        {searchOpen && !query && chips.length === 0 ? (
          <SearchPanel query={query} ctx={searchCtx} recent={recent} onRecent={r => setQuery(r)} onClearRecent={() => { setRecent([]); storage.set(RECENT_KEY, '[]'); }} onTry={tryThis} onWallet={() => undefined} onCategory={() => undefined} views={views} onView={id => { const v = views.find(x => x.id === id); if (v) applyView(v); }} />
        ) : null}
        {searchOpen && query && !searching ? (
          <SearchPanel query={query} ctx={searchCtx} recent={recent} onRecent={r => setQuery(r)} onClearRecent={() => undefined} onTry={tryThis}
                       onWallet={id => { patch({ walletIds: core.walletIds.includes(id) ? core.walletIds : [...core.walletIds, id] }); setQuery(''); }}
                       onCategory={slug => { patch({ include: [...core.include.filter(p => p.c !== slug), { c: slug }] }); setQuery(''); }}
                       titles={suggested.titles} people={suggested.people} onText={text => setQuery(text)} />
        ) : null}

        {(searching || (searchOpen && chips.length > 0)) && state === 'ready' && summary ? (
          <View testID="results-bar" style={[s.results, { backgroundColor: theme.surface }]}>
            <Text style={{ color: theme.text, fontSize: 12.5 }}><Text style={{ fontWeight: '600' }}>{t(summary.count === 1 ? 'history.resultOne' : 'history.results', { n: summary.count })}</Text>{summary.currencies[0] ? ` · ${summary.currencies[0].currency}` : ''}</Text>
            {summary.currencies[0] ? <Text style={{ color: summary.currencies[0].net < 0 ? theme.negative : theme.positive, fontSize: 12.5, fontWeight: '600' }}>{hidden ? '•••••' : `${summary.currencies[0].net < 0 ? '↘ −' : '↗ +'}${Math.abs(Math.round(summary.currencies[0].net)).toLocaleString('en-US')}`}</Text> : null}
          </View>
        ) : !searchOpen ? (
          <SummaryCard summary={summary} loading={sumState === 'loading'} error={sumState === 'error'} periodLabel={label} prevLabel={prevLabel}
                       canPrev={!!shiftPeriod(filter.period, -1)} canNext={canGoNext(filter.period)} onPrev={() => goTo(shiftPeriod(filter.period, -1))} onNext={() => goTo(shiftPeriod(filter.period, 1))}
                       onOpenPeriod={() => setSheet('period')} tab={tab} onTab={setTab} hidden={hidden} onRetry={loadSummary} convertTo={fallback} />
        ) : null}

        {showList ? (
          <>
            {oneWallet ? (
              <StatementCard statement={statement} loading={stmtState === 'loading'} error={stmtState === 'error'} hidden={hidden} onRetry={loadStatement} onAll={() => patch({ walletIds: [] })}
                             onAdd={() => router.push({ pathname: '/(dashboard)/add', params: { walletId: oneWallet } } as any)}
                             onTransfer={() => router.push({ pathname: '/(dashboard)/transfer', params: { mode: 'transfer', from: oneWallet } } as any)} />
            ) : null}
            <KindChips kinds={kinds} isOn={k => isKindOn(filter, k)} onChange={k => setCore(c => (isKindOn(c, k) && c.kinds.length === 1 ? setKind(c, 'all') : setKind(c, k)))} includeLoans={core.includeLoans} onToggleLoans={toggleLoans} showLoans={!isFamily} />
            <ActiveBar filter={filter} chips={chips} wallets={wallets} members={members} scheduleNames={scheduleNames} onRemove={c => setCore(f => removeChip(f, c))} onClear={() => { setCore(c => clearFilter(c)); setQuery(''); setSearch(''); }} onOpen={() => setSheet('filter')} />
            {isFamily ? <View style={{ paddingTop: 6 }}><MemberFilter members={members} value={core.memberId} onChange={id => patch({ memberId: id })} /></View> : null}
            <WalletStrip wallets={wallets} selected={core.walletIds} onSelect={ids => patch({ walletIds: ids })} hidden={hidden} />
            {hasUpcoming ? <UpcomingSection hidden={hidden} due={filter.due} schedules={filter.schedules} forceOpen={onlyUpcoming} showEmpty={onlyUpcoming} onChanged={() => { loadFirst(true); loadSummary(); }} /> : null}

            {state === 'loading' && !onlyUpcoming ? <SkeletonRows /> : null}

            {!onlyUpcoming && state === 'error' ? (
              <StateBlock testID="list-error" icon="cloud-off" title={t('history.errorTitle')} body={t('history.errorBody')} primary={{ label: t('history.tryAgain'), icon: 'refresh', onPress: () => { loadFirst(); loadSummary(); } }} />
            ) : null}

            {!onlyUpcoming && empty === 'none' ? (
              <StateBlock testID="empty-none" icon="account-balance-wallet" title={t('history.emptyNoneTitle')} body={t('history.emptyNoneBody')}
                          primary={scope.can('tx.add') ? { label: t('history.addFirst'), icon: 'add', onPress: () => router.push('/(dashboard)/add' as any) } : undefined} />
            ) : null}
            {!onlyUpcoming && empty === 'filter' && searching ? (
              <StateBlock testID="empty-search" icon="search-off" title={t('history.noResultsTitle', { q: search.trim() })} body={t('history.noResultsBody')} primary={{ label: t('history.clearSearch'), icon: 'close', onPress: () => { setQuery(''); setSearch(''); } }} />
            ) : null}
            {!onlyUpcoming && empty === 'filter' && !searching ? (
              <StateBlock testID="empty-filter" icon="filter-alt-off" title={t('history.emptyFilterTitle')} body={t('history.emptyFilterBody', { period: label })} primary={{ label: t('history.clearFilters'), icon: 'filter-alt-off', onPress: () => setCore(c => clearFilter(c)) }} />
            ) : null}
            {!onlyUpcoming && empty === 'period' ? (
              <StateBlock testID="empty-period" icon="event-busy" title={t('history.emptyPeriodTitle', { period: label })} body={t('history.emptyPeriodBody')} primary={{ label: t('history.showAllTime'), icon: 'all-inclusive', onPress: () => goTo({ kind: 'all' }) }} />
            ) : null}

            {state === 'ready' && !onlyUpcoming ? groups.map(g => (
              <View key={g.key} testID={`day-${g.key}`}>
                {serverMode ? groupHead(g.key, g.rows[0]) : mode !== 'none' ? <DayHeader group={g} hidden={hidden} mode={mode as 'day' | 'week' | 'month'} /> : <View style={{ height: 8 }} />}
                <View style={[s.dayCard, { backgroundColor: theme.surface }]}>
                  {g.rows.map((r, i) => (
                    <View key={r.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.border } : undefined}>
                      <SwipeRow enabled={!selecting && !isLocked(r)} onRight={() => startSelecting(r)} onLeft={() => setPeek(r)}>
                      <HistoryRow row={r} hidden={hidden} fallbackCurrency={fallback} showWallet={core.walletIds.length !== 1} query={search} onPress={openRow} onWalletPress={id => patch({ walletIds: [id] })} selecting={selecting} selected={picked.includes(r.id)} onLongPress={selecting ? undefined : startSelecting} onMore={setPeek} />
                      </SwipeRow>
                    </View>
                  ))}
                </View>
              </View>
            )) : null}

            {state === 'ready' && !onlyUpcoming && rows.length > 0 ? <ListFooter more={more === 'loading'} failed={more === 'failed'} ended={!cursor} onRetry={loadMore} /> : null}
          </>
        ) : null}
        <View style={{ height: 96 }} />
      </ScrollView>

      {!searchOpen ? (
        <TouchableOpacity testID="jump-to-date" onPress={() => setSheet('jump')} accessibilityRole="button" style={[s.jump, { backgroundColor: theme.surface }]}>
          <MaterialIcons name="calendar-month" size={20} color={theme.primary} /><Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{t('history.jump')}</Text>
        </TouchableOpacity>
      ) : null}
      {showTop ? (
        <TouchableOpacity testID="scroll-top" onPress={() => scroller.current?.scrollTo({ y: 0, animated: true })} accessibilityRole="button" accessibilityLabel={t('history.toTop')}
                          style={[s.top, { backgroundColor: theme.surface }]}><MaterialIcons name="keyboard-arrow-up" size={26} color={theme.text} /></TouchableOpacity>
      ) : null}
      {peek ? <PeekSheet visible title={peek.title} note={peekActions(peek).note} actions={peekActions(peek).actions} onClose={() => setPeek(null)} /> : null}
      <ResultSheet visible={!!result} done={result?.done ?? 0} failed={result?.failed ?? []} onClose={() => setResult(null)} />
      {selecting ? <SelectBar count={picked.length} total={rows.filter(r => !isLocked(r)).length} busy={working} onCancel={stopSelecting}
                              onAll={() => setPicked(p => (p.length === rows.filter(r => !isLocked(r)).length ? [] : rows.filter(r => !isLocked(r)).map(r => r.id)))}
                              onDelete={confirmDelete} onCategory={() => setSheet('pickCategory')} onWallet={() => setSheet('pickWallet')} /> : null}
      {snack && !selecting ? <Snackbar message={snack.message} action={snack.undo?.length ? t('select.undo') : undefined} onAction={() => snack.undo && undoDelete(snack.undo)} onDone={() => setSnack(null)} /> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingTop: 4 },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 16, paddingRight: 8, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '600', lineHeight: 32, marginTop: 2 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 3, right: 2, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 12, paddingBottom: 6 },
  searchField: { flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, borderWidth: 0, backgroundColor: 'transparent', paddingVertical: 8, outlineStyle: 'none' as any },
  results: { marginHorizontal: 12, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dayCard: { marginHorizontal: 12, borderRadius: 18, overflow: 'hidden' },
  jump: { position: 'absolute', left: 16, bottom: 88, minHeight: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 6 },
  top: { position: 'absolute', right: 16, bottom: 88, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 6 },
});
