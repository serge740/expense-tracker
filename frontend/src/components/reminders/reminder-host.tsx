// Ported from expo_app/components/reminders/reminder-host.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useRinging } from '@/context/sound-context';
import { formatMoney, useCurrency } from '@/context/currency-context';
import { DateTimeSheet } from '@/components/datetime-sheet';
import { WalletChips } from '@/components/wallet/wallet-chips';
import { OWE } from '@/components/debt/tone-chip';
import { ConfirmSheet } from '@/components/schedule/confirm-sheet';
import { addDebtPayment } from '@/services/debt.service';
import { skipOccurrence } from '@/services/scheduled.service';
import { getWallets, Wallet } from '@/services/wallet.service';
import {
  dismissReminder, getPendingReminders, markReminderOpened, PendingDebtReminder, PendingReminder, snoozeReminder,
} from '@/services/reminder.service';
import {
  ClosedMap, closeAll, onReminderRefresh, reminderCurrency, reminderLabel, SNOOZE_PRESETS, snoozeTime, visibleQueue,
} from '@/utils/reminders';

/** How often the popup looks for new reminders while the app is open. */
export const POLL_MS = 60_000;

const errorText = (e: any, fallback: string) => e?.response?.data?.message || fallback;

/**
 * The reminder popup. It sits above every screen, shows reminders that have fired and still wait for
 * an answer (most urgent first), and reloads when the app opens, comes forward, a reminder push is
 * tapped, and every minute. Closing it with × is not an answer: the reminder returns when it fires
 * again or the app is reopened.
 */
export function ReminderModalHost() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { currency: mainCurrency } = useCurrency();
  const [items, setItems] = useState<PendingReminder[]>([]);
  const [closed, setClosed] = useState<ClosedMap>({});
  const [index, setIndex] = useState(0);
  const [snoozing, setSnoozing] = useState<PendingReminder | null>(null);
  const [paying, setPaying] = useState<PendingDebtReminder | null>(null);
  const [confirming, setConfirming] = useState<Extract<PendingReminder, { source: 'SCHEDULED' }> | null>(null);

  const refresh = useCallback(async (reset = false) => {
    try {
      const list = await getPendingReminders();
      setItems(list);
      if (reset) setClosed({});
    } catch { /* offline or logged out: keep what we have */ }
  }, []);

  useEffect(() => {
    refresh(true);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') refresh(true); });
    const timer = setInterval(() => refresh(false), POLL_MS);
    const off = onReminderRefresh(({ reset }) => { refresh(reset); });
    return () => { sub.remove(); clearInterval(timer); off(); };
  }, [refresh]);

  const queue = useMemo(() => visibleQueue(items, closed), [items, closed]);
  const at = Math.min(index, Math.max(0, queue.length - 1));
  const current = queue[at];
  const visible = queue.length > 0;
  // While a reminder waits for an answer it rings and the device buzzes; overdue ones get through quiet hours.
  useRinging(visible, queue.some(q => q.overdue));

  // Keep the position valid when the queue shrinks.
  useEffect(() => { if (index !== at) setIndex(at); }, [index, at]);

  const closeWithX = () => setClosed(c => closeAll(queue, c));

  const answer = async (fn: () => Promise<unknown>) => {
    try { await fn(); await refresh(false); }
    catch (e) { Alert.alert(t('common.error'), errorText(e, t('add.errSave'))); }
  };

  const open = (r: PendingReminder) => {
    markReminderOpened(r.id).catch(() => {});
    setClosed(c => closeAll([r], c));
    if (r.source === 'SCHEDULED') router.push({ pathname: '/(dashboard)/scheduled' as any, params: { id: r.scheduleId } });
    else router.push({ pathname: '/(dashboard)/debts' as any, params: { openId: r.debtId } });
  };

  const skipDate = (r: Extract<PendingReminder, { source: 'SCHEDULED' }>) => Alert.alert(t('sched.skipTitle'), t('sched.skipMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('sched.skip'), onPress: () => { void answer(() => skipOccurrence(r.occurrenceId)); } },
  ]);

  const sched = current?.source === 'SCHEDULED';
  const income = current?.source === 'SCHEDULED' && current.txType === 'INCOME';
  // Money going out (a debt payment, a bill) vs money coming in (a credit repaid, expected income).
  const debt = current?.source === 'DEBT' ? current.kind === 'BORROWED' : !income;
  // A pay date with its own estimated payment asks for that, not for the whole balance.
  const shownAmount = current?.source === 'DEBT' && current.payment ? Math.min(current.payment, current.remaining) : current?.remaining ?? 0;
  const color = current?.overdue ? OWE : theme.primary;
  const when = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeWithX}>
      <View style={s.backdrop} testID="reminder-popup">
        {current && (
          <View style={[s.card, { backgroundColor: theme.surface }]}>
            <View style={s.queue}>
              <View style={s.dots}>
                {queue.map((q, i) => <View key={q.id} style={[s.dotBar, { backgroundColor: i === at ? theme.primary : theme.border }]} />)}
              </View>
              <Text style={[s.queueText, { color: theme.textMuted }]}>{t('rem.of', { i: at + 1, n: queue.length })}</Text>
              <TouchableOpacity onPress={closeWithX} style={[s.x, { borderColor: theme.border }]} accessibilityRole="button" accessibilityLabel={t('rem.close')}>
                <MaterialIcons name="close" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[s.bell, { backgroundColor: `${color}1F` }]}>
              <MaterialIcons name={current.overdue ? 'alarm' : 'notifications-active'} size={24} color={color} />
            </View>
            <Text style={[s.kicker, { color }]}>
              {t(current.overdue ? 'rem.overdue' : 'rem.dueSoon')} · {t(sched ? (income ? 'sched.kindIncome' : 'sched.kindPay') : debt ? 'rem.kindPayment' : 'rem.kindRepayment')}
            </Text>
            <Text style={[s.who, { color: theme.text }]} numberOfLines={2}>
              {sched ? reminderLabel(current) : debt ? t('rem.payPerson', { person: reminderLabel(current) }) : t('rem.owesYou', { person: reminderLabel(current) })}
            </Text>
            <Text style={[s.amount, { color }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(shownAmount, reminderCurrency(current, mainCurrency.code))}</Text>
            {shownAmount < current.remaining ? (
              <Text style={[s.when, { color: theme.textMuted }]}>{t('rem.leftTotal', { amount: formatMoney(current.remaining, reminderCurrency(current, mainCurrency.code)) })}</Text>
            ) : null}
            <Text style={[s.when, { color: theme.textMuted }]}>
              {t(current.overdue ? 'rem.wasDue' : 'rem.dueAt', { when: when(current.dueAt) })}
              {current.fireCount > 1 ? ` · ${t('rem.timesReminded', { n: current.fireCount })}` : ''}
            </Text>

            <TouchableOpacity style={[s.primary, { backgroundColor: theme.buttonBg }]} activeOpacity={0.85}
                              onPress={() => (current.source === 'SCHEDULED' ? setConfirming(current) : setPaying(current))}>
              <Text style={s.primaryText}>{t(sched ? (income ? 'sched.receive' : 'sched.pay') : debt ? 'rem.markPaid' : 'rem.markReceived')}</Text>
            </TouchableOpacity>
            <View style={s.pair}>
              <TouchableOpacity style={[s.secondary, { backgroundColor: theme.primaryBg }]} onPress={() => setSnoozing(current)} activeOpacity={0.85}>
                <Text style={[s.secondaryText, { color: theme.primary }]}>{t('rem.snooze')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.secondary, { backgroundColor: theme.primaryBg }]} onPress={() => open(current)} activeOpacity={0.85}>
                <Text style={[s.secondaryText, { color: theme.primary }]}>{t(sched ? 'sched.open' : debt ? 'rem.openDebt' : 'rem.openCredit')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.ghost} onPress={() => answer(() => dismissReminder(current.id))} accessibilityRole="button">
              <Text style={[s.ghostText, { color: theme.textSecondary }]}>{t('rem.dismiss')}</Text>
            </TouchableOpacity>
            {current.source === 'SCHEDULED' && (
              <TouchableOpacity style={[s.ghost, { paddingTop: 0 }]} onPress={() => skipDate(current)} accessibilityRole="button">
                <Text style={[s.ghostText, { color: theme.textSecondary }]}>{t('sched.skip')}</Text>
              </TouchableOpacity>
            )}

            {queue.length > 1 && (
              <View style={s.nav}>
                <TouchableOpacity onPress={() => setIndex((at - 1 + queue.length) % queue.length)} hitSlop={8}>
                  <Text style={[s.ghostText, { color: theme.textSecondary }]}>‹ {t('rem.prev')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIndex((at + 1) % queue.length)} hitSlop={8}>
                  <Text style={[s.ghostText, { color: theme.textSecondary }]}>{t('rem.next')} ›</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {snoozing && (
          <SnoozeSheet reminder={snoozing} onClose={() => setSnoozing(null)}
                       onDone={() => { setSnoozing(null); refresh(false); }} />
        )}
        {paying && (
          <PaySheet reminder={paying} onClose={() => setPaying(null)}
                    onDone={() => { setPaying(null); refresh(false); }} />
        )}
        {confirming && (
          <ConfirmSheet
            item={{ occurrenceId: confirming.occurrenceId, title: confirming.title, type: confirming.txType, amount: confirming.amount, currency: confirming.currency, walletId: confirming.walletId }}
            onClose={() => setConfirming(null)} onDone={() => { setConfirming(null); refresh(false); }} />
        )}
      </View>
    </Modal>
  );
}

// ── Snooze ───────────────────────────────────────────────────────────────────

export function SnoozeSheet({ reminder, onClose, onDone }: { reminder: PendingReminder; onClose: () => void; onDone: () => void }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { currency: mainCurrency } = useCurrency();
  const [pick, setPick] = useState<number | 'custom'>(60);
  const [custom, setCustom] = useState<Date | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const target = pick === 'custom' ? custom : snoozeTime(new Date(), pick);
  const text = (d: Date) => formatDate(d, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  const save = async () => {
    if (!target) return setPicking(true);
    setSaving(true);
    try {
      await snoozeReminder(reminder.id, pick === 'custom' ? { until: target.toISOString() } : { minutes: pick });
      onDone();
    } catch (e) {
      Alert.alert(t('common.error'), errorText(e, t('add.errSave')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.sheetWrap} pointerEvents="box-none">
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: theme.surface }]}>
        <View style={[s.grabber, { backgroundColor: theme.border }]} />
        <Text style={[s.sheetTitle, { color: theme.text }]}>{t('rem.snoozeFor')}</Text>
        <Text style={[s.sheetSub, { color: theme.textMuted }]}>{reminderLabel(reminder)} · {formatMoney(reminder.remaining, reminderCurrency(reminder, mainCurrency.code))}</Text>
        <View style={s.pills}>
          {SNOOZE_PRESETS.map(p => (
            <TouchableOpacity key={p.minutes} onPress={() => setPick(p.minutes)} accessibilityRole="button" accessibilityState={{ selected: pick === p.minutes }}
                              style={[s.pill, { backgroundColor: pick === p.minutes ? theme.primary : theme.inputBg, borderColor: pick === p.minutes ? theme.primary : theme.border }]}>
              <Text style={[s.pillText, { color: pick === p.minutes ? '#FFFFFF' : theme.text }]}>{t(p.label)}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => { setPick('custom'); setPicking(true); }} accessibilityRole="button" accessibilityState={{ selected: pick === 'custom' }}
                            style={[s.pill, { backgroundColor: pick === 'custom' ? theme.primary : theme.inputBg, borderColor: pick === 'custom' ? theme.primary : theme.border }]}>
            <Text style={[s.pillText, { color: pick === 'custom' ? '#FFFFFF' : theme.text }]}>{t('rem.pickDate')}</Text>
          </TouchableOpacity>
        </View>
        <View style={[s.whenBox, { backgroundColor: theme.primaryBg }]}>
          <Text style={[s.whenText, { color: theme.textSecondary }]}>
            {target ? t('rem.willRemind', { when: text(target) }) : t('rem.pickDate')}
          </Text>
        </View>
        <View style={s.pair}>
          <TouchableOpacity style={[s.secondary, { backgroundColor: theme.primaryBg }]} onPress={onClose}><Text style={[s.secondaryText, { color: theme.primary }]}>{t('common.cancel')}</Text></TouchableOpacity>
          <TouchableOpacity style={[s.secondary, { backgroundColor: theme.buttonBg }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[s.secondaryText, { color: '#FFFFFF' }]}>{t('rem.snoozeBtn')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
      <DateTimeSheet visible={picking} title={t('rem.snoozeFor')} mode="datetime" value={custom ?? snoozeTime(new Date(), 60)}
                     minDate={snoozeTime(new Date(), 2)} minuteStep={5} hour12
                     onClose={() => { setPicking(false); if (!custom) setPick(60); }}
                     onConfirm={d => { setCustom(d); setPick('custom'); setPicking(false); }} />
    </View>
  );
}

// ── Mark paid ────────────────────────────────────────────────────────────────

export function PaySheet({ reminder, onClose, onDone }: { reminder: PendingDebtReminder; onClose: () => void; onDone: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const debt = reminder.kind === 'BORROWED';
  const [amount, setAmount] = useState(String(reminder.payment ?? reminder.remaining));
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A debt never uses one of my wallets, so there is nothing to choose. A credit repaid to me goes into a wallet:
  // start on the credit's own wallet, else the default one ("No wallet" is still one tap away).
  const usesWallet = reminder.kind === 'LENT';
  useEffect(() => {
    if (!usesWallet) return;
    getWallets().then(all => {
      const usable = all.filter(x => !x.archived && x.currency === reminder.currency);
      setWallets(usable);
      const pre = usable.find(x => x.id === reminder.walletId) ?? usable.find(x => x.isDefault) ?? usable[0];
      if (pre) setWalletId(cur => cur ?? pre.id);
    }).catch(() => {});
  }, [usesWallet, reminder.currency, reminder.walletId]);

  const save = async () => {
    const value = parseFloat(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return Alert.alert(t('rem.payTitle'), t('add.errAmount'));
    if (value > reminder.remaining) return Alert.alert(t('rem.payTitle'), t('rem.errMore'));
    setSaving(true);
    try {
      await addDebtPayment(reminder.debtId, { amount: value, ...(usesWallet && walletId ? { walletId } : {}) });
      onDone();
    } catch (e) {
      Alert.alert(t('common.error'), errorText(e, t('add.errSave')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: theme.surface }]}>
        <View style={[s.grabber, { backgroundColor: theme.border }]} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[s.sheetTitle, { color: theme.text }]}>{t('rem.payTitle')}</Text>
          <Text style={[s.sheetSub, { color: theme.textMuted }]}>{t('rem.payFor', { person: reminder.person, amount: formatMoney(reminder.remaining, reminder.currency) })}</Text>

          <Text style={[s.label, { color: theme.textSecondary }]}>{t('add.amount')}</Text>
          <View style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <Text style={[s.cur, { color: theme.textMuted }]}>{reminder.currency}</Text>
            <TextInput value={amount} onChangeText={v => setAmount(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad"
                       style={[s.input, { color: theme.text }]} accessibilityLabel={t('add.amount')} />
            <TouchableOpacity onPress={() => setAmount(String(reminder.remaining))} style={[s.all, { backgroundColor: theme.primaryBg }]}>
              <Text style={[s.allText, { color: theme.primary }]}>{t('debts.payAll')}</Text>
            </TouchableOpacity>
          </View>

          {usesWallet && (
            <>
              <Text style={[s.label, { color: theme.textSecondary }]}>{t('debts.intoWallet')} ({t('add.optional')})</Text>
              <WalletChips wallets={wallets} value={walletId} onChange={setWalletId} noneLabel={t('add.noWallet')} />
            </>
          )}
          <Text style={[s.hint, { color: theme.textMuted }]}>{t('rem.payHint')}</Text>

          <View style={s.pair}>
            <TouchableOpacity style={[s.secondary, { backgroundColor: theme.primaryBg }]} onPress={onClose}><Text style={[s.secondaryText, { color: theme.primary }]}>{t('rem.back')}</Text></TouchableOpacity>
            <TouchableOpacity style={[s.secondary, { backgroundColor: theme.buttonBg }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[s.secondaryText, { color: '#FFFFFF' }]}>{t('rem.recordBtn')}</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 22 },
  card:     { borderRadius: 26, padding: 18 },

  queue:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dots:      { flex: 1, flexDirection: 'row', gap: 4 },
  dotBar:    { flex: 1, height: 4, borderRadius: 2 },
  queueText: { fontSize: 11 },
  x:         { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  bell:   { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kicker: { fontSize: 11, fontWeight: '700' },
  who:    { fontSize: 18, fontWeight: '800', marginTop: 2 },
  amount: { fontSize: 28, fontWeight: '800', marginVertical: 2 },
  when:   { fontSize: 11 },

  primary:       { height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryText:   { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  pair:          { flexDirection: 'row', gap: 8, marginTop: 8 },
  secondary:     { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 13, fontWeight: '700' },
  ghost:         { alignItems: 'center', paddingVertical: 12 },
  ghostText:     { fontSize: 12, fontWeight: '600' },
  nav:           { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },

  sheetWrap:  { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet:      { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 26, maxHeight: '88%' },
  grabber:    { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 10 },
  sheetTitle: { fontSize: 16, fontWeight: '800' },
  sheetSub:   { fontSize: 11, marginTop: 1 },
  pills:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pill:       { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  pillText:   { fontSize: 12.5, fontWeight: '700' },
  whenBox:    { marginTop: 12, padding: 10, borderRadius: 14 },
  whenText:   { fontSize: 12 },

  label: { fontSize: 11, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, borderWidth: 1, paddingLeft: 12, paddingRight: 5 },
  cur:   { fontSize: 12, fontWeight: '700' },
  input: { flex: 1, fontSize: 18, fontWeight: '700', fontFamily: 'Poppins_700Bold', paddingVertical: 0 },
  all:   { paddingHorizontal: 10, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  allText: { fontSize: 11, fontWeight: '700' },
  hint:  { fontSize: 11, lineHeight: 15, marginTop: 10 },
});
