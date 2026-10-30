import { cardTheme } from '@/constants/card-themes';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import Svg, { Path } from '@/rn/svg';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import type { Wallet } from '@/services/wallet.service';
import { changeOf, dayName, shortAmount, signedAmount, sparkline, ZERO_DECIMAL, type DayGroup, type FeedKind, type FeedSummary } from '@/utils/history';

const MASK = '•••••';

// ── Summary card: the period, the currency tabs, the net, the change, the trend, income and spent ──────────────────────

export type SummaryTab = { kind: 'currency'; currency: string } | { kind: 'converted' };

export function SummaryCard({ summary, loading, error, periodLabel, prevLabel, canPrev, canNext, onPrev, onNext, onOpenPeriod, tab, onTab, hidden, onRetry, convertTo }: {
  summary: FeedSummary | null; loading: boolean; error: boolean; periodLabel: string; prevLabel: string;
  canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void; onOpenPeriod: () => void;
  tab: SummaryTab | null; onTab: (t: SummaryTab) => void; hidden: boolean; onRetry: () => void; convertTo: string;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();

  const nav = (
    <View style={s.nav}>
      <TouchableOpacity testID="period-prev" onPress={onPrev} disabled={!canPrev} style={[s.navBtn, { opacity: canPrev ? 1 : 0.35 }]} accessibilityRole="button" accessibilityLabel="Previous period">
        <MaterialIcons name="chevron-left" size={24} color={theme.text} />
      </TouchableOpacity>
      <TouchableOpacity testID="period-label" onPress={onOpenPeriod} style={s.navLabel} accessibilityRole="button">
        <Text style={[s.navText, { color: theme.text }]} numberOfLines={1}>{periodLabel}</Text>
        <MaterialIcons name="expand-more" size={20} color={theme.text} />
      </TouchableOpacity>
      <TouchableOpacity testID="period-next" onPress={onNext} disabled={!canNext} style={[s.navBtn, { opacity: canNext ? 1 : 0.35 }]} accessibilityRole="button" accessibilityLabel="Next period">
        <MaterialIcons name="chevron-right" size={24} color={theme.text} />
      </TouchableOpacity>
    </View>
  );

  if (loading && !summary) {
    const bar = (w: string, h: number, mt = 0): any => ({ height: h, width: w, borderRadius: 8, backgroundColor: theme.surface2, marginTop: mt });
    return (
      <View key="skeleton" testID="summary-skeleton" style={[s.card, { backgroundColor: theme.surface, minHeight: 238 }]}>
        <View style={{ alignItems: 'center', paddingVertical: 12 }}><View style={bar('46%', 18)} /></View>
        <View style={bar('30%', 12, 8)} /><View style={bar('64%', 34, 10)} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>{[0, 1].map(i => <View key={i} style={{ flex: 1, height: 62, borderRadius: 18, backgroundColor: theme.surface2 }} />)}</View>
      </View>
    );
  }

  if (error && !summary) {
    return (
      <View key="error" testID="summary-error" style={[s.card, { backgroundColor: theme.surface }]}>
        {nav}
        <View style={[s.errBox, { backgroundColor: theme.negativeTint }]}>
          <MaterialIcons name="error" size={24} color={theme.negative} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{t('history.totalsError')}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12.5 }}>{t('history.totalsErrorBody')}</Text>
          </View>
          <TouchableOpacity onPress={onRetry} style={[s.retry, { backgroundColor: theme.primary }]} accessibilityRole="button"><Text style={{ color: theme.isDark ? '#07202A' : '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{t('history.retry')}</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  const currencies = summary?.currencies ?? [];
  const showTabs = currencies.length > 1;
  const converted = tab?.kind === 'converted' ? summary?.converted ?? null : null;
  const current = tab?.kind === 'currency' ? currencies.find(c => c.currency === tab.currency) ?? currencies[0] : tab?.kind === 'converted' ? null : currencies[0];
  const view = converted
    ? { currency: converted.currency, income: converted.income, expense: converted.expense, net: converted.net, series: [] as number[], change: null }
    : current ? { currency: current.currency, income: current.income, expense: current.expense, net: current.net, series: current.series, change: changeOf(current) } : null;
  const zero = view ? ZERO_DECIMAL.has(view.currency) : false;
  const count = summary?.count ?? 0;
  const netText = view ? (hidden ? MASK : shortAmount(view.net, zero)) : '0';
  const netColor = !view || view.net === 0 ? theme.text : view.net > 0 ? theme.positive : theme.negative;
  const path = view ? sparkline(view.series) : '';

  return (
    <View key="card" testID="summary-card" style={[s.card, { backgroundColor: theme.surface }]}>
      {nav}
      {showTabs ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.rowScroll} contentContainerStyle={s.tabs}>
          {currencies.map(c => {
            const on = tab?.kind !== 'converted' && (tab?.kind === 'currency' ? tab.currency === c.currency : currencies[0].currency === c.currency);
            return (
              <TouchableOpacity key={c.currency} testID={`tab-${c.currency}`} onPress={() => onTab({ kind: 'currency', currency: c.currency })} accessibilityRole="button" accessibilityState={{ selected: on }}
                                style={[s.tab, { backgroundColor: on ? theme.primary : theme.surface2 }]}>
                <Text style={[s.tabText, { color: on ? (theme.isDark ? '#07202A' : '#FFFFFF') : theme.text }]}>{c.currency}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity testID="tab-converted" onPress={() => onTab({ kind: 'converted' })} accessibilityRole="button" accessibilityState={{ selected: tab?.kind === 'converted' }}
                            style={[s.tab, { backgroundColor: tab?.kind === 'converted' ? theme.primary : theme.surface2 }]}>
            <Text style={[s.tabText, { color: tab?.kind === 'converted' ? (theme.isDark ? '#07202A' : '#FFFFFF') : theme.text }]}>{t('history.converted', { code: convertTo })}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      <View style={s.netRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.small, { color: theme.textSecondary }]}>{t('history.net')} · {t(count === 1 ? 'history.countOne' : 'history.countN', { n: count })}</Text>
          <View style={s.netLine}>
            {view && view.net !== 0 ? <MaterialIcons name={view.net > 0 ? 'arrow-upward' : 'arrow-downward'} size={26} color={netColor} /> : null}
            <Text testID="summary-net" numberOfLines={1} adjustsFontSizeToFit style={[s.net, { color: netColor }]}>{view && view.net < 0 && !hidden ? '−' : view && view.net > 0 && !hidden ? '+' : ''}{netText}</Text>
            <Text style={[s.code, { color: theme.textSecondary }]}>{view ? view.currency : convertTo}</Text>
          </View>
          {view?.change ? (
            <View style={s.delta}>
              <MaterialIcons name={view.change.dir === 'down' ? 'trending-down' : view.change.dir === 'up' ? 'trending-up' : 'trending-flat'} size={15} color={theme.textSecondary} />
              <Text style={[s.small, { color: theme.textSecondary }]}>{t(view.change.dir === 'up' ? 'history.spendingUp' : view.change.dir === 'down' ? 'history.spendingDown' : 'history.spendingSame', { n: view.change.pct, prev: prevLabel })}</Text>
            </View>
          ) : null}
        </View>
        {path ? <Svg width={84} height={40} viewBox="0 0 84 40"><Path d={path} fill="none" stroke={theme.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
      </View>

      {converted ? (
        <Text style={[s.note, { color: theme.textSecondary }]}>
          {t('history.convertedNote')}{converted.missing.length ? ` ${t('history.missingRates', { codes: converted.missing.join(', ') })}` : ''}
        </Text>
      ) : null}

      <View style={s.tiles}>
        <View style={[s.tile, { backgroundColor: theme.positiveTint }]}>
          <View style={s.tileHead}><MaterialIcons name="south-west" size={16} color={theme.positive} /><Text style={[s.tileLabel, { color: theme.positive }]}>{t('history.income')}</Text></View>
          <Text testID="summary-income" style={[s.tileVal, { color: theme.text }]}>{view ? (hidden ? MASK : signedAmount(view.income, { zeroDecimal: zero }).replace(/^(?!\+)/, view.income === 0 ? '' : '+')) : '0'}</Text>
        </View>
        <View style={[s.tile, { backgroundColor: theme.negativeTint }]}>
          <View style={s.tileHead}><MaterialIcons name="north-east" size={16} color={theme.negative} /><Text style={[s.tileLabel, { color: theme.negative }]}>{t('history.spent')}</Text></View>
          <Text testID="summary-spent" style={[s.tileVal, { color: theme.text }]}>{view ? (hidden ? MASK : view.expense === 0 ? '0' : `−${shortAmount(view.expense, zero)}`) : '0'}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Kind chips and the wallet strip ───────────────────────────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<FeedKind, any> = {
  all: 'home.vAll', income: 'home.vIncome', expense: 'home.vExpense', transfer: 'history.vTransfer', debt: 'home.vDebt', credit: 'home.vCredit', scheduled: 'home.vScheduled',
};

export function KindChips({ kinds, isOn, onChange, includeLoans, onToggleLoans, showLoans }: {
  kinds: FeedKind[]; isOn: (k: FeedKind) => boolean; onChange: (k: FeedKind) => void; includeLoans: boolean; onToggleLoans: () => void; showLoans: boolean;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const ink = theme.isDark ? '#07202A' : '#FFFFFF';
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.rowScroll} contentContainerStyle={s.chips} testID="kind-chips">
      {kinds.map(k => {
        const on = isOn(k);
        return (
          <TouchableOpacity key={k} testID={`chip-${k}`} onPress={() => onChange(k)} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: on }}
                            style={[s.chip, { backgroundColor: on ? theme.primary : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
            {on ? <MaterialIcons name="check" size={16} color={ink} /> : k === 'scheduled' ? <MaterialIcons name="repeat" size={16} color={theme.textSecondary} /> : null}
            <Text style={[s.chipText, { color: on ? ink : theme.text, fontWeight: on ? '600' : '500' }]}>{t(KIND_LABEL[k])}</Text>
          </TouchableOpacity>
        );
      })}
      {showLoans ? (
        <TouchableOpacity testID="chip-loans" onPress={onToggleLoans} activeOpacity={0.85} accessibilityRole="switch" accessibilityState={{ checked: includeLoans }}
                          style={[s.chip, { backgroundColor: includeLoans ? theme.primaryBg : theme.surface, borderColor: includeLoans ? theme.primaryBg : theme.border }]}>
          <MaterialIcons name={includeLoans ? 'toggle-on' : 'toggle-off'} size={20} color={includeLoans ? theme.primary : theme.textMuted} />
          <Text style={[s.chipText, { color: includeLoans ? theme.primary : theme.textSecondary, fontWeight: '600' }]}>{t(includeLoans ? 'history.loansOn' : 'history.loansOff')}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

export function WalletStrip({ wallets, selected, onSelect, hidden }: { wallets: Wallet[]; selected: string[]; onSelect: (ids: string[]) => void; hidden: boolean }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  if (wallets.length === 0) return null;
  const active = wallets.filter(w => !w.archived), archived = wallets.filter(w => w.archived);
  const none = selected.length === 0;
  const card = (key: string, on: boolean, dot: string, name: string, line: string, onPress: () => void, muted = false) => (
    <TouchableOpacity key={key} testID={`wallet-${key}`} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={[s.wallet, { backgroundColor: on ? theme.primaryBg : theme.surface, borderColor: on ? theme.primary : 'transparent', opacity: muted ? 0.65 : 1 }]}>
      <View style={s.walletHead}><View style={[s.dot, { backgroundColor: dot }]} /><Text style={[s.walletName, { color: theme.text }]} numberOfLines={1}>{name}</Text></View>
      <Text style={[s.walletLine, { color: theme.textSecondary }]} numberOfLines={1}>{line}</Text>
    </TouchableOpacity>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.rowScroll} contentContainerStyle={s.strip} testID="wallet-strip">
      {card('all', none, theme.textMuted, selected.length > 1 ? t('history.nWallets', { n: selected.length }) : t('history.allWallets'), t('history.nWallets', { n: active.length }), () => onSelect([]))}
      {[...active, ...archived].map(w => card(w.id, selected.includes(w.id), w.archived ? '#9AA8AE' : w.color, w.name, hidden ? `${w.currency} ${MASK}` : formatMoney(w.balance, w.currency), () => onSelect(selected.length === 1 && selected[0] === w.id ? [] : [w.id]), w.archived))}
    </ScrollView>
  );
}

// ── Day header ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** "Today", "Yesterday" or "Mon 5 Oct" on the left; the day's net per currency on the right ("▲ +837,600 RWF · ▼ −$12.99"). */
export function DayHeader({ group, hidden, mode = 'day' }: { group: DayGroup; hidden: boolean; mode?: 'day' | 'week' | 'month' }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const n = dayName(group.date);
  const end = new Date(group.date.getFullYear(), group.date.getMonth(), group.date.getDate() + 6);
  const label = mode === 'month' ? formatDate(group.date, { month: 'long', year: 'numeric' })
    : mode === 'week' ? `${formatDate(group.date, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short' })}`
    : n.kind === 'today' ? t('sched.today') : n.kind === 'yesterday' ? t('sched.yesterday')
    : formatDate(n.date, n.withYear ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <View testID="day-header" style={[s.day, { backgroundColor: theme.background }]}>
      <Text style={[s.dayLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[s.dayNet, { color: theme.textSecondary }]} numberOfLines={1}>
        {group.net.map(x => `${x.amount > 0 ? '▲' : x.amount < 0 ? '▼' : '•'} ${hidden ? MASK : `${signedAmount(x.amount, { zeroDecimal: ZERO_DECIMAL.has(x.currency) })} ${x.currency}`}`).join(' · ')}
      </Text>
    </View>
  );
}

/** The heading of a category, wallet, member or title group: its name, how many rows, what it came to, and its share of spending. */
export function GroupHeader({ label, icon, color, count, totals, share, hidden }: {
  label: string; icon?: string; color?: string; count: number; totals: Array<{ currency: string; income: number; expense: number }>; share: number | null; hidden: boolean;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <View testID="group-header" style={[s.day, { backgroundColor: theme.background }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
        {icon ? <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color ?? theme.primary}26` }}><MaterialIcons name={icon} size={14} color={color ?? theme.primary} /></View> : null}
        <Text style={[s.dayLabel, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>{label}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 11.5 }}>{count}</Text>
      </View>
      <Text style={[s.dayNet, { color: theme.textSecondary }]} numberOfLines={1}>
        {totals.map(x => { const net = x.income - x.expense; return `${net > 0 ? '▲' : net < 0 ? '▼' : '•'} ${hidden ? MASK : `${signedAmount(net, { zeroDecimal: ZERO_DECIMAL.has(x.currency) })} ${x.currency}`}`; }).join(' · ')}
        {share !== null ? ` · ${t('group.share', { n: share })}` : ''}
      </Text>
    </View>
  );
}

// ── States: empty, error, offline, skeleton rows, footer ──────────────────────────────────────────────────────────────

export function StateBlock({ icon, title, body, primary, secondary, testID }: {
  icon: string; title: string; body: string; testID: string;
  primary?: { label: string; icon: string; onPress: () => void }; secondary?: { label: string; icon: string; onPress: () => void };
}) {
  const theme = useAppTheme();
  const ink = theme.isDark ? '#07202A' : '#FFFFFF';
  return (
    <View testID={testID} style={[s.block, { backgroundColor: theme.surface }]}>
      <View style={[s.blockIcon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name={icon} size={42} color={theme.primary} /></View>
      <Text style={[s.blockTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[s.blockBody, { color: theme.textSecondary }]}>{body}</Text>
      <View style={{ gap: 8, marginTop: 18, alignSelf: 'stretch' }}>
        {primary ? <TouchableOpacity onPress={primary.onPress} accessibilityRole="button" style={[s.blockBtn, { backgroundColor: theme.primary }]}><MaterialIcons name={primary.icon} size={20} color={ink} /><Text style={{ color: ink, fontSize: 14, fontWeight: '600' }}>{primary.label}</Text></TouchableOpacity> : null}
        {secondary ? <TouchableOpacity onPress={secondary.onPress} accessibilityRole="button" style={[s.blockBtn, { backgroundColor: theme.primaryBg }]}><MaterialIcons name={secondary.icon} size={20} color={theme.primary} /><Text style={{ color: theme.primary, fontSize: 14, fontWeight: '600' }}>{secondary.label}</Text></TouchableOpacity> : null}
      </View>
    </View>
  );
}

export function OfflineBanner({ since }: { since: string }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <View testID="offline-banner" style={[s.offline, { backgroundColor: theme.warnTint }]}>
      <MaterialIcons name="cloud-off" size={20} color={theme.warn} />
      <Text style={{ flex: 1, color: theme.text, fontSize: 12.5, lineHeight: 17 }}><Text style={{ fontWeight: '600' }}>{t('history.offline')}</Text> {t('history.offlineBody', { time: since })}</Text>
    </View>
  );
}

export function SkeletonRows({ count = 6 }: { count?: number }) {
  const theme = useAppTheme();
  const widths = [['62%', '40%'], ['48%', '55%'], ['70%', '35%'], ['55%', '45%'], ['66%', '38%'], ['44%', '52%']];
  return (
    <View testID="list-skeleton" style={[s.skel, { backgroundColor: theme.surface }]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={s.skelRow}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface2 }} />
          <View style={{ flex: 1 }}>
            <View style={{ height: 12, width: widths[i % 6][0] as any, borderRadius: 6, backgroundColor: theme.surface2 }} />
            <View style={{ height: 10, width: widths[i % 6][1] as any, borderRadius: 6, backgroundColor: theme.surface2, marginTop: 8 }} />
          </View>
          <View style={{ height: 14, width: 62, borderRadius: 6, backgroundColor: theme.surface2 }} />
        </View>
      ))}
    </View>
  );
}

export function ListFooter({ more, failed, ended, onRetry }: { more: boolean; failed: boolean; ended: boolean; onRetry: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  if (failed) {
    return (
      <View testID="load-more-failed" style={[s.foot, { backgroundColor: theme.surface }]}>
        <MaterialIcons name="wifi-off" size={18} color={theme.warn} />
        <Text style={{ flex: 1, color: theme.text, fontSize: 12.5 }}>{t('history.loadMoreFailed')}</Text>
        <TouchableOpacity onPress={onRetry} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }} accessibilityRole="button"><Text style={{ color: theme.primary, fontWeight: '600', fontSize: 12.5 }}>{t('history.retry')}</Text></TouchableOpacity>
      </View>
    );
  }
  if (more) return <ActivityIndicator color={theme.primary} style={{ marginVertical: 18 }} />;
  if (ended) return <Text testID="end-of-list" style={{ textAlign: 'center', color: theme.textMuted, fontSize: 12, paddingVertical: 18 }}>{t('history.endOfList')}</Text>;
  return null;
}

const s = StyleSheet.create({
  // A sideways row must not grow to fill a short page.
  rowScroll: { flexGrow: 0, flexShrink: 0 },
  card: { marginHorizontal: 12, marginBottom: 10, borderRadius: 26, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14 },
  nav: { flexDirection: 'row', alignItems: 'center' },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navLabel: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  navText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  tabs: { gap: 4, paddingVertical: 4 },
  tab: { height: 32, paddingHorizontal: 12, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12.5, fontWeight: '600' },
  netRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  small: { fontSize: 12, lineHeight: 16 },
  netLine: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  net: { fontSize: 28, fontWeight: '700', lineHeight: 36, flexShrink: 1 },
  code: { fontSize: 14, fontWeight: '600' },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  note: { fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tile: { flex: 1, minWidth: 0, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileLabel: { fontSize: 12, fontWeight: '500' },
  tileVal: { fontSize: 17, fontWeight: '600', marginTop: 2 },
  errBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18 },
  retry: { minHeight: 44, paddingHorizontal: 14, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },

  chips: { gap: 6, paddingHorizontal: 12, paddingVertical: 4 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: { fontSize: 13 },
  strip: { gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  wallet: { minWidth: 104, maxWidth: 150, minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5 },
  walletHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 3 },
  walletName: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  walletLine: { fontSize: 11.5, marginTop: 2 },

  day: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8, position: 'sticky' as any, top: 0, zIndex: 2 },
  dayLabel: { fontSize: 13, fontWeight: '600' },
  dayNet: { fontSize: 12, flexShrink: 1, textAlign: 'right' },

  block: { marginHorizontal: 12, marginTop: 18, borderRadius: 26, paddingVertical: 28, paddingHorizontal: 22, alignItems: 'center' },
  blockIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  blockTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center', lineHeight: 23 },
  blockBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  blockBtn: { minHeight: 48, borderRadius: 99, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  offline: { marginHorizontal: 12, marginBottom: 8, padding: 10, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  skel: { marginHorizontal: 12, marginTop: 14, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4 },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  foot: { marginHorizontal: 12, marginVertical: 8, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
});


/** History for one wallet: its own card, what it started the period with, what came in and went out, and what it ended with. */
export function StatementCard({ statement, loading, error, hidden, onAdd, onTransfer, onRetry, onAll }: {
  statement: import('@/services/history.service').Statement | null; loading: boolean; error: boolean; hidden: boolean;
  onAdd: () => void; onTransfer: () => void; onRetry: () => void; onAll: () => void;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  if (error) return <StateBlock testID="statement-error" icon="cloud-off" title={t('stmt.error')} body="" primary={{ label: t('history.retry'), icon: 'refresh', onPress: onRetry }} />;
  if (!statement) return loading ? <View testID="statement-loading" style={{ height: 150, marginHorizontal: 16, marginTop: 8, borderRadius: 22, backgroundColor: theme.surface2 }} /> : null;
  const w = statement.wallet;
  const ct = cardTheme(w.color);
  const zero = ZERO_DECIMAL.has(w.currency);
  const money = (n: number) => (hidden ? MASK : `${shortAmount(n, zero)}`);
  const cell = (label: string, value: string, sign?: string) => (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }} numberOfLines={1}>{label}</Text>
      <Text testID={`stmt-${label}`} style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{sign}{value}</Text>
    </View>
  );
  return (
    <View testID="statement-card" style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 22, padding: 16, backgroundColor: ct.gradient[0], gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialIcons name="account-balance-wallet" size={20} color="#FFFFFF" />
        <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{w.name}</Text>
        <TouchableOpacity testID="statement-all" onPress={onAll} accessibilityRole="button" style={{ paddingHorizontal: 10, minHeight: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>{t('stmt.all')}</Text>
        </TouchableOpacity>
      </View>
      <View>
        <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{t('stmt.balance')}</Text>
        <Text testID="stmt-balance" style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '800' }} numberOfLines={1}>{money(w.balance)} <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>{w.currency}</Text></Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        {cell(t('stmt.opening'), money(statement.opening))}
        {cell(t('stmt.in'), money(statement.in), '+')}
        {cell(t('stmt.out'), money(statement.out), '−')}
        {cell(t('stmt.closing'), money(statement.closing))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <MaterialIcons name={statement.balanced ? 'check-circle' : 'error'} size={16} color={statement.balanced ? '#86EFAC' : '#FCA5A5'} />
        <Text testID="stmt-balanced" style={{ flex: 1, color: statement.balanced ? '#86EFAC' : '#FCA5A5', fontSize: 12, fontWeight: '600' }}>{t(statement.balanced ? 'stmt.balanced' : 'stmt.notBalanced')}</Text>
        {!w.archived ? (
          <>
            <TouchableOpacity testID="statement-add" onPress={onAdd} accessibilityRole="button" style={{ paddingHorizontal: 12, minHeight: 34, borderRadius: 17, backgroundColor: '#FFFFFF', justifyContent: 'center' }}>
              <Text style={{ color: ct.accent, fontSize: 12.5, fontWeight: '700' }}>{t('stmt.addHere')}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="statement-transfer" onPress={onTransfer} accessibilityRole="button" style={{ paddingHorizontal: 12, minHeight: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' }}>{t('stmt.transfer')}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}
