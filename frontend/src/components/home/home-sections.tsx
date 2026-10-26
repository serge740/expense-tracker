// Ported from expo_app/components/home/home-sections.tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { OWE, OWED, ToneChip } from '@/components/debt/tone-chip';
import type { AttentionItem, DebtBucket, HomeSummary, NetWorth } from '@/services/home.service';
import { currencyEntries, FEED_CHIPS, FeedView, hasLoanMovement, visibleAttention } from '@/utils/home';

const plain = (n: number) => Math.round(n).toLocaleString('en-US');

// ── Include loans (sits inside the teal balance card) ────────────────────────

export function LoansBar({ loans, includeLoans, onToggle }: {
  loans: HomeSummary['loans']; includeLoans: boolean; onToggle: (v: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <View style={s.loanBar}>
      <View style={{ flex: 1 }}>
        {hasLoanMovement(loans) && (
          <>
            <Text style={s.loanText}>{t(includeLoans ? 'home.loansOn' : 'home.loansOff', { out: plain(loans.out), in: plain(loans.in) })}</Text>
            {loans.borrowed > 0 && <Text style={[s.loanText, { opacity: 0.7 }]}>{t('home.borrowedNote', { amount: plain(loans.borrowed) })}</Text>}
          </>
        )}
      </View>
      <Text style={s.loanLabel}>{t('home.includeLoans')}</Text>
      <Switch value={includeLoans} onValueChange={onToggle} trackColor={{ true: '#4ADE80', false: 'rgba(255,255,255,0.3)' }}
              thumbColor="#FFFFFF" accessibilityLabel={t('home.includeLoans')} />
    </View>
  );
}

// ── Debts, credits and scheduled ─────────────────────────────────────────────

export function DebtCreditCards({ owe, owed, scheduled, hidden, onOwe, onOwed, onScheduled }: {
  owe: Record<string, DebtBucket>; owed: Record<string, DebtBucket>; scheduled: HomeSummary['scheduled'];
  hidden: boolean; onOwe: () => void; onOwed: () => void; onScheduled: () => void;
}) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const hasScheduled = scheduled.waiting > 0 || !!scheduled.next;
  if (!currencyEntries(owe).length && !currencyEntries(owed).length && !hasScheduled) return null;

  const detail = (b: DebtBucket) => {
    const parts = [t('home.openN', { n: b.count })];
    if (b.overdue) parts.push(t('home.overdueN', { n: b.overdue }));
    else if (b.nextDueAt) parts.push(t('home.nextOn', { when: formatDate(b.nextDueAt, { day: 'numeric', month: 'short' }) }));
    return parts.join(' · ');
  };

  const cards = [
    ...currencyEntries(owe).map(([cur, b]) => ({ key: `owe-${cur}`, color: OWE, label: t('home.youOwe'), value: formatMoney(b.amount, cur, { hidden }), sub: detail(b), onPress: onOwe })),
    ...currencyEntries(owed).map(([cur, b]) => ({ key: `owed-${cur}`, color: OWED, label: t('home.owedToYou'), value: formatMoney(b.amount, cur, { hidden }), sub: detail(b), onPress: onOwed })),
    ...(hasScheduled ? [{
      key: 'scheduled', color: theme.primary, label: t('home.scheduled'),
      value: scheduled.waiting > 0 ? t('home.waitingN', { n: scheduled.waiting }) : t('home.noneWaiting'),
      sub: scheduled.next ? t('home.nextSched', { title: scheduled.next.title }) : '', onPress: onScheduled, plainValue: true,
    }] : []),
  ] as Array<{ key: string; color: string; label: string; value: string; sub: string; onPress: () => void; plainValue?: boolean }>;

  return (
    <View style={s.grid} testID="debt-credit-cards">
      {cards.map(c => (
        <TouchableOpacity key={c.key} activeOpacity={0.85} onPress={c.onPress} accessibilityRole="button"
                          style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={s.cardLabelRow}>
            <View style={[s.dot, { backgroundColor: c.color }]} />
            <Text style={[s.cardLabel, { color: theme.textMuted }]}>{c.label}</Text>
          </View>
          <Text style={[s.cardValue, { color: c.plainValue ? theme.text : c.color }]} numberOfLines={1} adjustsFontSizeToFit>{c.value}</Text>
          {!!c.sub && <Text style={[s.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>{c.sub}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Needs attention ──────────────────────────────────────────────────────────

export function NeedsAttention({ items, total, hidden, fallbackCurrency, onOpen }: {
  items: AttentionItem[]; total: number; hidden: boolean; fallbackCurrency: string; onOpen: (item: AttentionItem) => void;
}) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  const shown = visibleAttention(items, expanded);
  const canExpand = items.length > shown.length || expanded;
  const when = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <View>
      <View style={s.sectionRow}>
        <Text style={[s.sectionTitle, { color: theme.text }]}>{t('home.attention')}</Text>
        {canExpand && (
          <TouchableOpacity onPress={() => setExpanded(v => !v)} hitSlop={8} accessibilityRole="button">
            <Text style={[s.link, { color: theme.primary }]}>{expanded ? t('home.showLess') : t('home.seeAllN', { n: total })}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={[s.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {shown.map((it, i) => {
          const sched = it.source === 'SCHEDULED';
          const money = formatMoney(it.remaining, it.currency || fallbackCurrency, { hidden });
          const income = sched ? it.txType === 'INCOME' : it.kind === 'LENT';
          const title = sched ? it.title : income ? t('rem.owesYou', { person: it.person }) : t('rem.payPerson', { person: it.person });
          const tint = it.overdue ? OWE : sched ? theme.primary : income ? OWED : theme.primary;
          return (
            <TouchableOpacity key={sched ? it.occurrenceId : it.debtId} activeOpacity={0.8} onPress={() => onOpen(it)} accessibilityRole="button"
                              style={[s.attRow, i < shown.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]} testID="attention-row">
              <View style={[s.attIcon, { backgroundColor: `${tint}1F` }]}>
                <MaterialIcons name={it.overdue ? 'alarm' : sched ? 'event-repeat' : 'notifications-active'} size={16} color={tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.attTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
                <Text style={[s.attSub, { color: theme.textMuted }]} numberOfLines={1}>{t(it.overdue ? 'rem.wasDue' : 'rem.dueAt', { when: when(it.dueAt) })}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={[s.attAmount, { color: income ? OWED : it.overdue ? OWE : theme.text }]}>{money}</Text>
                {it.overdue ? <ToneChip label={t('rem.overdue')} tone="red" /> : sched ? <ToneChip label={t(income ? 'sched.receive' : 'sched.pay')} tone="blue" /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Net worth ────────────────────────────────────────────────────────────────

export function NetWorthRows({ netWorth, hidden }: { netWorth: NetWorth[]; hidden: boolean }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // A person with one wallet and no debts already sees that number on Home: only show this when it adds something.
  const worthShowing = netWorth.filter(n => n.owed > 0 || n.owe > 0);
  if (!worthShowing.length) return null;

  return (
    <View style={{ gap: 6 }}>
      {worthShowing.map(n => (
        <TouchableOpacity key={n.currency} activeOpacity={0.85} onPress={() => setOpen(v => !v)} accessibilityRole="button"
                          style={[s.nwCard, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="net-worth-row">
          <View style={{ flex: 1 }}>
            <Text style={[s.nwLabel, { color: theme.textMuted }]}>{t('home.netWorth', { currency: n.currency })}</Text>
            <Text style={[s.nwValue, { color: n.total < 0 ? OWE : theme.text }]}>{formatMoney(n.total, n.currency, { hidden })}</Text>
            {open && (
              <Text style={[s.nwDetail, { color: theme.textSecondary }]} testID="net-worth-detail">
                {t('home.netBreakdown', {
                  wallets: formatMoney(n.wallets, n.currency, { hidden }), owed: formatMoney(n.owed, n.currency, { hidden }), owe: formatMoney(n.owe, n.currency, { hidden }),
                })}
              </Text>
            )}
          </View>
          <View style={[s.nwChip, { backgroundColor: theme.inputBg }]}>
            <Text style={[s.nwChipText, { color: theme.textSecondary }]}>{t('home.details')} {open ? '▴' : '▾'}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Feed chips ───────────────────────────────────────────────────────────────

export function FeedChips({ value, onChange }: { value: FeedView; onChange: (v: FeedView) => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      {FEED_CHIPS.map(c => {
        const on = c.id === value;
        return (
          <TouchableOpacity key={c.id} onPress={() => onChange(c.id)} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: on }}
                            style={[s.chip, { backgroundColor: on ? theme.primary : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
            <Text style={[s.chipText, { color: on ? '#FFFFFF' : theme.textSecondary }]}>{t(c.label)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  loanBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  loanText:  { color: '#FFFFFF', fontSize: 10.5, lineHeight: 15, opacity: 0.9 },
  loanLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  card:      { width: '48%', flexGrow: 1, borderRadius: 18, borderWidth: 1, padding: 12 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  cardLabel: { fontSize: 11 },
  cardValue: { fontSize: 17, fontWeight: '800', marginTop: 3 },
  cardSub:   { fontSize: 10.5, marginTop: 2 },

  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 18, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  link:         { fontSize: 12, fontWeight: '600' },
  listCard:     { marginHorizontal: 16, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  attRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  attIcon:      { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  attTitle:     { fontSize: 12.5, fontWeight: '700' },
  attSub:       { fontSize: 10.5, marginTop: 1 },
  attAmount:    { fontSize: 13, fontWeight: '800' },

  nwCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  nwLabel:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  nwValue:    { fontSize: 16, fontWeight: '800', marginTop: 1 },
  nwDetail:   { fontSize: 11, lineHeight: 15, marginTop: 6 },
  nwChip:     { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9 },
  nwChipText: { fontSize: 10, fontWeight: '700' },

  chips:    { gap: 6, paddingHorizontal: 16, marginBottom: 8 },
  chip:     { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  chipText: { fontSize: 11.5, fontWeight: '700' },
});
