import React, { useCallback, useMemo, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, RefreshControl, Modal, TextInput, Alert,
  ActivityIndicator, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { useI18n } from '@/context/language-context';
import { formatMoney, currencyByCode, useCurrency } from '@/context/currency-context';
import { usePreferences } from '@/context/preferences-context';
import {
  getDebts, getDebtSummary, addDebtPayment, removeDebtPayment, deleteDebt, createDebt, Debt, DebtSummary, DebtKind,
} from '@/services/debt.service';
import { getWallets, Wallet } from '@/services/wallet.service';
import { WalletChips } from '@/components/wallet/wallet-chips';
import { CurrencyPicker } from '@/components/wallet/currency-picker';
import { DatePickerModal } from '@/components/date-picker-modal';

type Tab = 'BORROWED' | 'LENT' | 'SETTLED';
const OWE = '#DC2626';
const OWED = '#16A34A';

export default function DebtsScreen() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { prefs } = usePreferences();
  const hidden = prefs.hideBalances;

  const [debts, setDebts]       = useState<Debt[]>([]);
  const [summary, setSummary]   = useState<DebtSummary | null>(null);
  const [wallets, setWallets]   = useState<Wallet[]>([]);
  const [tab, setTab]           = useState<Tab>('BORROWED');
  const [openId, setOpenId]     = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s, w] = await Promise.all([getDebts(), getDebtSummary(), getWallets()]);
      setDebts(d); setSummary(s); setWallets(w.filter(x => !x.archived));
    } catch { /* keep last */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const lists = useMemo(() => ({
    BORROWED: debts.filter(d => d.kind === 'BORROWED' && d.status === 'OPEN'),
    LENT: debts.filter(d => d.kind === 'LENT' && d.status === 'OPEN'),
    SETTLED: debts.filter(d => d.status === 'SETTLED'),
  }), [debts]);
  const open = debts.find(d => d.id === openId) ?? null;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'BORROWED', label: t('debts.tabDebt') },
    { id: 'LENT', label: t('debts.tabCredit') },
    { id: 'SETTLED', label: t('debts.settled') },
  ];

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <DebtSheet debt={open} wallets={wallets} hidden={hidden} onClose={() => setOpenId(null)} onChanged={load} />
      <NewDebtSheet visible={creating} kind={tab === 'LENT' ? 'LENT' : 'BORROWED'} wallets={wallets}
                    onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />

      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.text }]}>{t('debts.title')}</Text>
          <Text style={[s.subtitle, { color: theme.textMuted }]}>{t('debts.subtitle')}</Text>
        </View>
        <TouchableOpacity style={[s.round, { backgroundColor: theme.buttonBg, borderColor: theme.buttonBg }]}
                          onPress={() => setCreating(true)}>
          <MaterialIcons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}
      >
        {/* Summary */}
        <View style={s.summaryRow}>
          <SummaryCard label={t('debts.totalOwe')} color={OWE} icon="call-received" totals={summary?.owe ?? {}} hidden={hidden} />
          <SummaryCard label={t('debts.totalOwed')} color={OWED} icon="call-made" totals={summary?.owed ?? {}} hidden={hidden} />
        </View>
        <Text style={[s.flowHint, { color: theme.textMuted }]}>{t('debts.flowHint')}</Text>
        {!!summary?.overdue && (
          <View style={[s.overdueBar, { backgroundColor: theme.isDark ? 'rgba(220,38,38,0.15)' : '#FEF2F2' }]}>
            <MaterialIcons name="warning-amber" size={15} color={OWE} />
            <Text style={[s.overdueText, { color: OWE }]}>{summary.overdue} · {t('debts.overdue')}</Text>
          </View>
        )}

        {/* Tabs */}
        <View style={[s.tabs, { backgroundColor: theme.inputBg }]}>
          {TABS.map(x => {
            const on = tab === x.id;
            return (
              <TouchableOpacity key={x.id} onPress={() => setTab(x.id)} activeOpacity={0.85} style={[s.tab, on && { backgroundColor: theme.surface }]}>
                <Text style={[s.tabText, { color: on ? theme.primary : theme.textMuted }]} numberOfLines={1}>{x.label}</Text>
                <View style={[s.count, { backgroundColor: on ? theme.primaryBg : 'transparent' }]}>
                  <Text style={[s.countText, { color: on ? theme.primary : theme.textMuted }]}>{lists[x.id].length}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} />
        ) : lists[tab].length === 0 ? (
          <View style={s.empty}>
            <MaterialIcons name={tab === 'SETTLED' ? 'task-alt' : 'handshake'} size={30} color={theme.textMuted} />
            <Text style={[s.emptyText, { color: theme.textMuted }]}>
              {t(tab === 'BORROWED' ? 'debts.emptyOwe' : tab === 'LENT' ? 'debts.emptyOwed' : 'debts.emptySettled')}
            </Text>
          </View>
        ) : (
          lists[tab].map(d => (
            <DebtCard key={d.id} debt={d} hidden={hidden} onPress={() => setOpenId(d.id)} formatDate={formatDate} t={t} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function SummaryCard({ label, color, icon, totals, hidden }: {
  label: string; color: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; totals: Record<string, number>; hidden: boolean;
}) {
  const theme = useAppTheme();
  const entries = Object.entries(totals);
  return (
    <View style={[s.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[s.summaryIcon, { backgroundColor: `${color}1A` }]}>
        <MaterialIcons name={icon} size={16} color={color} />
      </View>
      <Text style={[s.summaryLabel, { color: theme.textMuted }]}>{label}</Text>
      {entries.length === 0
        ? <Text style={[s.summaryValue, { color: theme.text }]}>—</Text>
        : entries.map(([code, v]) => (
          <Text key={code} style={[s.summaryValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(v, code, { hidden })}</Text>
        ))}
    </View>
  );
}

function DebtCard({ debt, hidden, onPress, formatDate, t }: {
  debt: Debt; hidden: boolean; onPress: () => void;
  formatDate: (d: string | Date, o: Intl.DateTimeFormatOptions) => string; t: ReturnType<typeof useI18n>['t'];
}) {
  const theme = useAppTheme();
  const color = debt.kind === 'BORROWED' ? OWE : OWED;
  const pct = debt.amount ? Math.min(100, (debt.paid / debt.amount) * 100) : 0;
  const settled = debt.status === 'SETTLED';
  const initials = debt.person.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
                      style={[s.card, { backgroundColor: theme.surface, borderColor: debt.overdue ? `${OWE}66` : theme.border }]}>
      <View style={s.cardTop}>
        <View style={[s.avatar, { backgroundColor: `${color}1A` }]}>
          <Text style={[s.avatarText, { color }]}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.person, { color: theme.text }]} numberOfLines={1}>{debt.person}</Text>
          <Text style={[s.meta, { color: theme.textMuted }]} numberOfLines={1}>
            {debt.note || t('debts.since', { date: formatDate(debt.date, { day: 'numeric', month: 'short' }) })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.remaining, { color: settled ? theme.textMuted : color }]}>
            {formatMoney(settled ? debt.amount : debt.remaining, debt.currency, { hidden })}
          </Text>
          {settled ? (
            <View style={[s.chip, { backgroundColor: theme.primaryBg }]}>
              <MaterialIcons name="check" size={11} color={theme.primary} />
              <Text style={[s.chipText, { color: theme.primary }]}>{t('debts.settled')}</Text>
            </View>
          ) : debt.dueDate ? (
            <View style={[s.chip, { backgroundColor: debt.overdue ? `${OWE}1A` : theme.inputBg }]}>
              <MaterialIcons name={debt.overdue ? 'warning-amber' : 'event'} size={11} color={debt.overdue ? OWE : theme.textMuted} />
              <Text style={[s.chipText, { color: debt.overdue ? OWE : theme.textMuted }]}>
                {debt.overdue ? t('debts.overdue') : t('debts.dueOn', { date: formatDate(debt.dueDate, { day: 'numeric', month: 'short' }) })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {!settled && (
        <>
          <View style={[s.track, { backgroundColor: theme.inputBg }]}>
            <View style={[s.fill, { width: `${pct}%`, backgroundColor: color }]} />
          </View>
          <Text style={[s.progressText, { color: theme.textMuted }]}>
            {t('debts.paidOf', { paid: formatMoney(debt.paid, debt.currency, { hidden }), total: formatMoney(debt.amount, debt.currency, { hidden }) })}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function DebtSheet({ debt, wallets, hidden, onClose, onChanged }: {
  debt: Debt | null; wallets: Wallet[]; hidden: boolean; onClose: () => void; onChanged: () => void;
}) {
  return (
    <Modal visible={!!debt} transparent animationType="slide" onRequestClose={onClose}>
      {debt && <DebtSheetBody key={debt.id} debt={debt} wallets={wallets} hidden={hidden} onClose={onClose} onChanged={onChanged} />}
    </Modal>
  );
}

function DebtSheetBody({ debt, wallets, hidden, onClose, onChanged }: {
  debt: Debt; wallets: Wallet[]; hidden: boolean; onClose: () => void; onChanged: () => void;
}) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const color = debt.kind === 'BORROWED' ? OWE : OWED;
  const settled = debt.status === 'SETTLED';
  const usable = wallets.filter(w => w.currency === debt.currency);

  const [amount, setAmount]     = useState('');
  const [walletId, setWalletId] = useState<string | null>(debt.walletId && usable.some(w => w.id === debt.walletId) ? debt.walletId : null);
  const [busy, setBusy]         = useState(false);

  const pay = async () => {
    const value = parseFloat(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return Alert.alert(t('debts.recordPayment'), t('add.errAmount'));
    setBusy(true);
    try {
      await addDebtPayment(debt.id, { amount: value, walletId: walletId ?? undefined });
      setAmount('');
      onChanged();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => Alert.alert(t('debts.delete'), t('debts.deleteMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('wallet.deleteBtn'), style: 'destructive', onPress: async () => {
      try { await deleteDebt(debt.id); onClose(); onChanged(); }
      catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave')); }
    } },
  ]);

  const confirmRemovePayment = (paymentId: string) => Alert.alert(t('debts.removePayment'), t('debts.removePaymentMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('wallet.deleteBtn'), style: 'destructive', onPress: async () => {
      try { await removeDebtPayment(debt.id, paymentId); onChanged(); }
      catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave')); }
    } },
  ]);

  const pct = debt.amount ? Math.min(100, (debt.paid / debt.amount) * 100) : 0;

  return (
    <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: theme.surface }]}>
        <View style={[s.grabber, { backgroundColor: theme.border }]} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Head */}
          <View style={s.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetKind, { color }]}>{t(debt.kind === 'BORROWED' ? 'add.borrowedFrom' : 'add.lentTo')}</Text>
              <Text style={[s.sheetPerson, { color: theme.text }]}>{debt.person}</Text>
            </View>
            {debt.phone && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${debt.phone}`)} style={[s.callBtn, { backgroundColor: theme.primaryBg }]}>
                <MaterialIcons name="call" size={16} color={theme.primary} />
                <Text style={[s.callText, { color: theme.primary }]}>{t('debts.call')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} hitSlop={8} style={{ marginLeft: 8 }}>
              <MaterialIcons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Amounts */}
          <View style={[s.amountCard, { backgroundColor: `${color}12`, borderColor: `${color}33` }]}>
            <Text style={[s.amountLabel, { color: theme.textSecondary }]}>
              {settled ? t('debts.settled') : t('debts.left', { amount: '' }).trim()}
            </Text>
            <Text style={[s.amountBig, { color }]}>{formatMoney(settled ? debt.amount : debt.remaining, debt.currency, { hidden })}</Text>
            <View style={[s.track, { backgroundColor: theme.surface }]}>
              <View style={[s.fill, { width: `${pct}%`, backgroundColor: color }]} />
            </View>
            <Text style={[s.progressText, { color: theme.textSecondary }]}>
              {t('debts.paidOf', { paid: formatMoney(debt.paid, debt.currency, { hidden }), total: formatMoney(debt.amount, debt.currency, { hidden }) })}
            </Text>
            <View style={s.metaRow}>
              <Text style={[s.metaItem, { color: theme.textMuted }]}>{t('debts.since', { date: formatDate(debt.date, { day: 'numeric', month: 'short', year: 'numeric' }) })}</Text>
              {debt.dueDate && (
                <Text style={[s.metaItem, { color: debt.overdue ? OWE : theme.textMuted }]}>
                  {debt.overdue ? `${t('debts.overdue')} · ` : ''}{t('debts.dueOn', { date: formatDate(debt.dueDate, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                </Text>
              )}
            </View>
            {debt.note ? <Text style={[s.note, { color: theme.textSecondary }]}>“{debt.note}”</Text> : null}
          </View>

          {/* Record payment */}
          {!settled && (
            <>
              <Text style={[s.section, { color: theme.text }]}>{t('debts.recordPayment')}</Text>
              <View style={[s.payRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <Text style={[s.payCur, { color: theme.textMuted }]}>{debt.currency}</Text>
                <TextInput value={amount} onChangeText={v => setAmount(v.replace(/[^\d.,]/g, ''))} placeholder="0"
                           placeholderTextColor={theme.textMuted} keyboardType="decimal-pad"
                           style={[s.payInput, { color: theme.text }]} />
                <TouchableOpacity onPress={() => setAmount(String(debt.remaining))} style={[s.allBtn, { backgroundColor: theme.primaryBg }]}>
                  <Text style={[s.allText, { color: theme.primary }]}>{t('debts.payAll')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[s.walletLabel, { color: theme.textSecondary }]}>
                {t(debt.kind === 'BORROWED' ? 'debts.fromWallet' : 'debts.intoWallet')} ({t('add.optional')})
              </Text>
              <WalletChips wallets={usable} value={walletId} onChange={setWalletId} noneLabel={t('add.noWallet')} />
              <TouchableOpacity style={[s.payBtn, { backgroundColor: color }]} onPress={pay} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.payBtnText}>{t('debts.recordPayment')}</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* Payments */}
          <Text style={[s.section, { color: theme.text }]}>{t('debts.payments')}</Text>
          {debt.payments.length === 0 ? (
            <Text style={[s.metaItem, { color: theme.textMuted }]}>{t('debts.noPayments')}</Text>
          ) : debt.payments.map(p => (
            <View key={p.id} style={[s.payment, { borderBottomColor: theme.border }]}>
              <View style={[s.payIcon, { backgroundColor: `${color}1A` }]}>
                <MaterialIcons name="payments" size={15} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.payAmount, { color: theme.text }]}>{formatMoney(p.amount, debt.currency, { hidden })}</Text>
                <Text style={[s.metaItem, { color: theme.textMuted }]}>
                  {formatDate(p.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {p.walletId ? ` · ${wallets.find(w => w.id === p.walletId)?.name ?? ''}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => confirmRemovePayment(p.id)} hitSlop={8}>
                <MaterialIcons name="delete-outline" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={[s.deleteBtn, { borderColor: `${OWE}55` }]} onPress={confirmDelete} activeOpacity={0.8}>
            <MaterialIcons name="delete-outline" size={16} color={OWE} />
            <Text style={[s.deleteText, { color: OWE }]}>{t('debts.delete')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function NewDebtSheet({ visible, kind, wallets, onClose, onCreated }: {
  visible: boolean; kind: DebtKind; wallets: Wallet[]; onClose: () => void; onCreated: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible && <NewDebtBody initialKind={kind} wallets={wallets} onClose={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

function NewDebtBody({ initialKind, wallets, onClose, onCreated }: {
  initialKind: DebtKind; wallets: Wallet[]; onClose: () => void; onCreated: () => void;
}) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { currency: mainCurrency } = useCurrency();
  const [kind, setKind]         = useState<DebtKind>(initialKind);
  const [person, setPerson]     = useState('');
  const [phone, setPhone]       = useState('');
  const [amount, setAmount]     = useState('');
  const [walletId, setWalletId] = useState<string | null>(null);
  const [currency, setCurrency] = useState(mainCurrency.code);
  const [dueDate, setDueDate]   = useState<Date | null>(null);
  const [note, setNote]         = useState('');
  const [pickDue, setPickDue]   = useState(false);
  const [pickCur, setPickCur]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const wallet = wallets.find(w => w.id === walletId) ?? null;
  const cur = wallet?.currency ?? currency;
  const color = kind === 'BORROWED' ? OWE : OWED;

  const save = async () => {
    const value = parseFloat(amount.replace(/,/g, ''));
    if (!person.trim()) return Alert.alert(t(kind === 'BORROWED' ? 'add.borrowedFrom' : 'add.lentTo'), t('add.errPerson'));
    if (!Number.isFinite(value) || value <= 0) return Alert.alert(t('add.amount'), t('add.errAmount'));
    setSaving(true);
    try {
      await createDebt({
        kind, person: person.trim(), phone: phone.trim() || undefined, amount: value, currency: cur,
        walletId: walletId ?? undefined, dueDate: dueDate?.toISOString(), note: note.trim() || undefined,
      });
      onCreated();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.message || t('add.errSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: theme.surface }]}>
        <View style={[s.grabber, { backgroundColor: theme.border }]} />
        <View style={[s.sheetHead, { marginBottom: 10 }]}>
          <Text style={[s.sheetPerson, { color: theme.text, fontSize: 16, flex: 1 }]}>{t('debts.newTitle')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}><MaterialIcons name="close" size={20} color={theme.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[s.tabs, { backgroundColor: theme.inputBg, marginTop: 0, marginBottom: 4 }]}>
            {(['BORROWED', 'LENT'] as DebtKind[]).map(k => {
              const on = kind === k;
              const c = k === 'BORROWED' ? OWE : OWED;
              return (
                <TouchableOpacity key={k} onPress={() => setKind(k)} activeOpacity={0.85} style={[s.tab, on && { backgroundColor: theme.surface }]}>
                  <MaterialIcons name={k === 'BORROWED' ? 'call-received' : 'call-made'} size={13} color={on ? c : theme.textMuted} />
                  <Text style={[s.tabText, { color: on ? c : theme.textMuted }]} numberOfLines={1}>{t(k === 'BORROWED' ? 'debts.kindBorrowed' : 'debts.kindLent')}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.walletLabel, { color: theme.textSecondary }]}>{t(kind === 'BORROWED' ? 'add.borrowedFrom' : 'add.lentTo')}</Text>
          <View style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="person-outline" size={16} color={theme.textMuted} />
            <TextInput value={person} onChangeText={setPerson} placeholder={t('add.personPh')} placeholderTextColor={theme.textMuted}
                       autoCapitalize="words" style={[s.fieldText, { color: theme.text }]} />
          </View>
          <Text style={[s.walletLabel, { color: theme.textSecondary }]}>{t('add.phoneOpt')}</Text>
          <View style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="phone" size={16} color={theme.textMuted} />
            <TextInput value={phone} onChangeText={v => setPhone(v.replace(/[^\d+\s]/g, ''))} placeholder="+250 788 123 456"
                       placeholderTextColor={theme.textMuted} keyboardType="phone-pad" style={[s.fieldText, { color: theme.text }]} />
          </View>

          <Text style={[s.walletLabel, { color: theme.textSecondary }]}>{t('add.amount')}</Text>
          <View style={[s.payRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <TouchableOpacity disabled={!!wallet} onPress={() => setPickCur(true)} style={s.curBtn}>
              <Text style={{ fontSize: 15 }}>{currencyByCode(cur).flag}</Text>
              <Text style={[s.payCur, { color: theme.text }]}>{cur}</Text>
              {!wallet && <MaterialIcons name="arrow-drop-down" size={16} color={theme.textMuted} />}
            </TouchableOpacity>
            <TextInput value={amount} onChangeText={v => setAmount(v.replace(/[^\d.,]/g, ''))} placeholder="0"
                       placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[s.payInput, { color }]} />
          </View>

          <Text style={[s.walletLabel, { color: theme.textSecondary }]}>
            {t(kind === 'BORROWED' ? 'add.walletInto' : 'add.walletFrom')} ({t('add.optional')})
          </Text>
          <WalletChips wallets={wallets} value={walletId} onChange={setWalletId} noneLabel={t('add.noWallet')} />

          <Text style={[s.walletLabel, { color: theme.textSecondary }]}>{t('add.dueDate')}</Text>
          <TouchableOpacity style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]} onPress={() => setPickDue(true)} activeOpacity={0.8}>
            <MaterialIcons name="event" size={16} color={theme.textMuted} />
            <Text style={[s.fieldText, { color: dueDate ? theme.text : theme.textMuted }]}>
              {dueDate ? formatDate(dueDate, { day: 'numeric', month: 'short', year: 'numeric' }) : t('add.noDue')}
            </Text>
            {dueDate && <TouchableOpacity onPress={() => setDueDate(null)} hitSlop={8}><MaterialIcons name="close" size={16} color={theme.textMuted} /></TouchableOpacity>}
          </TouchableOpacity>

          <Text style={[s.walletLabel, { color: theme.textSecondary }]}>{t('add.description')}</Text>
          <View style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="notes" size={16} color={theme.textMuted} />
            <TextInput value={note} onChangeText={setNote} placeholder={t('add.descriptionPh')} placeholderTextColor={theme.textMuted}
                       style={[s.fieldText, { color: theme.text }]} />
          </View>

          <View style={[s.hintBox, { backgroundColor: theme.primaryBg }]}>
            <MaterialIcons name="info-outline" size={14} color={theme.primary} />
            <Text style={[s.flowHint, { color: theme.textSecondary, marginTop: 0, flex: 1 }]}>{t('debts.flowHint')}</Text>
          </View>

          <TouchableOpacity style={[s.payBtn, { backgroundColor: color }]} onPress={save} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.payBtnText}>{t('add.save')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>

      <DatePickerModal visible={pickDue} title={t('add.dueDate')} value={dueDate ?? new Date()} showTime={false}
                       onClose={() => setPickDue(false)} onConfirm={d => { setDueDate(d); setPickDue(false); }} />
      <CurrencyPicker visible={pickCur} value={currency} onSelect={c => { setCurrency(c.code); setPickCur(false); }} onClose={() => setPickCur(false)} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1 },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  round:    { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 11 },
  scroll:   { paddingHorizontal: 16, paddingBottom: 120 },

  summaryRow:   { flexDirection: 'row', gap: 10 },
  summary:      { flex: 1, borderRadius: 18, borderWidth: 1, padding: 12 },
  summaryIcon:  { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  summaryLabel: { fontSize: 11 },
  summaryValue: { fontSize: 16, fontWeight: '700', marginTop: 1 },
  overdueBar:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, padding: 10, marginTop: 10 },
  overdueText:  { fontSize: 12, fontWeight: '700' },
  flowHint:     { fontSize: 10, lineHeight: 14, marginTop: 8 },
  hintBox:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10, marginTop: 14 },
  field:        { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  fieldText:    { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', paddingVertical: 0 },
  curBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4 },

  tabs:      { flexDirection: 'row', borderRadius: 14, padding: 3, marginTop: 14, marginBottom: 12 },
  tab:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 34, borderRadius: 11 },
  tabText:   { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  count:     { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countText: { fontSize: 10, fontWeight: '800' },

  empty:     { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 12, textAlign: 'center' },

  card:       { borderRadius: 18, borderWidth: 1, padding: 12, marginBottom: 10 },
  cardTop:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  person:     { fontSize: 13, fontWeight: '700' },
  meta:       { fontSize: 11, marginTop: 1 },
  remaining:  { fontSize: 14, fontWeight: '800' },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 3 },
  chipText:   { fontSize: 10, fontWeight: '700' },
  track:      { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 10 },
  fill:       { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 10, marginTop: 4 },

  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:      { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 26, maxHeight: '88%' },
  grabber:    { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 10 },
  sheetHead:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sheetKind:  { fontSize: 11, fontWeight: '700' },
  sheetPerson:{ fontSize: 18, fontWeight: '800' },
  callBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  callText:   { fontSize: 12, fontWeight: '700' },

  amountCard:  { borderRadius: 18, borderWidth: 1, padding: 14 },
  amountLabel: { fontSize: 11, fontWeight: '600' },
  amountBig:   { fontSize: 26, fontWeight: '800', marginTop: 2 },
  metaRow:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, marginTop: 8 },
  metaItem:    { fontSize: 11 },
  note:        { fontSize: 12, fontStyle: 'italic', marginTop: 8 },

  section:     { fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  payRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, borderWidth: 1, paddingLeft: 12, paddingRight: 5 },
  payCur:      { fontSize: 12, fontWeight: '700' },
  payInput:    { flex: 1, fontSize: 18, fontWeight: '700', fontFamily: 'Poppins_700Bold', paddingVertical: 0 },
  allBtn:      { paddingHorizontal: 10, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  allText:     { fontSize: 11, fontWeight: '700' },
  walletLabel: { fontSize: 11, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  payBtn:      { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  payBtnText:  { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  payment:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  payIcon:   { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  payAmount: { fontSize: 13, fontWeight: '700' },

  deleteBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 14, borderWidth: 1, marginTop: 18 },
  deleteText: { fontSize: 12, fontWeight: '700' },
});
