// Ported from expo_app/app/(dashboard)/wallet-detail.tsx
import React, { useCallback, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StatusBar, RefreshControl, Alert, ActivityIndicator } from '@/rn';
import { SafeAreaView } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Clipboard } from '@/rn';
import { router, useLocalSearchParams, useFocusEffect } from '@/router/router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import {
  getWallet, getBalanceHistory, getDailyFlow, getActivity, updateWallet, deleteWallet,
  Wallet, ActivityItem, DailyFlow,
} from '@/services/wallet.service';
import { deleteTransaction, Transaction } from '@/services/transaction.service';
import { formatMoney, currencyByCode } from '@/context/currency-context';
import { usePreferences } from '@/context/preferences-context';
import { useI18n } from '@/context/language-context';
import { tint } from '@/components/wallet/wallet-card';
import { WalletHeroCard, maskNumber } from '@/components/wallet/wallet-hero-card';
import { CardColorPicker } from '@/components/wallet/card-color-picker';
import { cardTheme } from '@/constants/card-themes';
import { BalanceChart } from '@/components/wallet/balance-chart';
import { FlowChart } from '@/components/wallet/flow-chart';
import { ActivityRow } from '@/components/wallet/activity-row';
import { TransactionDetailModal } from '@/components/transaction-detail-modal';
import { FadeInView } from '@/components/fade-in-view';
import { WalletFormModal } from '@/components/wallet-form-modal';
import { useScope } from '@/context/scope-context';
import { errorMessage } from '@/utils/family-errors';



export default function WalletDetailScreen() {
  const theme = useAppTheme();
  const { locale, t } = useI18n();
  const { prefs, setPref } = usePreferences();
  const hidden = prefs.hideBalances;
  const params = useLocalSearchParams<{ walletId: string }>();
  const walletId = params.walletId;

  const [wallet, setWallet]     = useState<Wallet | null>(null);
  const [days, setDays]         = useState(30);
  const [points, setPoints]     = useState<{ date: string; balance: number }[]>([]);
  const [flow, setFlow]         = useState<DailyFlow | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNumber, setShowNumber] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [recolor, setRecolor]   = useState(false);
  const scope = useScope();
  const canManage = scope.can('wallet.manage');
  const canDelete = scope.can('wallet.delete');
  const [editing, setEditing]   = useState(false);

  const loadChart = useCallback(async (d: number) => {
    setChartLoading(true);
    try { setPoints((await getBalanceHistory(walletId, d)).points); } catch { setPoints([]); }
    finally { setChartLoading(false); }
  }, [walletId]);

  const load = useCallback(async () => {
    if (!walletId) return;
    try {
      const w = await getWallet(walletId);
      setWallet(w);
      const [fl, act] = await Promise.all([getDailyFlow(w.currency, 7, walletId), getActivity(30, walletId)]);
      setFlow(fl);
      setActivity(act);
    } catch { /* keep last data */ }
    finally { setRefreshing(false); }
    loadChart(days);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletId]);

  useFocusEffect(useCallback(() => { setShowNumber(false); load(); }, [load]));

  const changeRange = (d: number) => { setDays(d); loadChart(d); };

  const back = () => router.navigate('/(dashboard)/wallets');
  const go = (pathname: string, p: Record<string, string>) => router.push({ pathname: pathname as any, params: p });

  if (!wallet) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.primary} />
      </SafeAreaView>
    );
  }

  const color = cardTheme(wallet.color).accent;
  const cur = currencyByCode(wallet.currency);
  const yesterdayClose = points.length >= 2 ? points[points.length - 2].balance : wallet.balance;
  const dayChange = wallet.balance - yesterdayClose;
  const isMobile = wallet.walletType === 'MOBILE_MONEY';

  const confirmDelete = () =>
    Alert.alert(t('wallet.delete'), t('wallet.deleteMsg', { name: wallet.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('wallet.deleteBtn'), style: 'destructive', onPress: () => deleteWallet(wallet.id).then(back).catch((e: unknown) => Alert.alert(t('common.error'), errorMessage(e, t('wallet.errDelete'), t))) },
    ]);

  const menu = () => Alert.alert(wallet.name, undefined, [
    { text: t('wallet.edit'), onPress: () => setEditing(true) },
    ...(!wallet.isDefault ? [{ text: t('wallet.makeDefault'), onPress: () => updateWallet(wallet.id, { isDefault: true }).then(load) }] : []),
    { text: t('wallet.changeColor'), onPress: () => setRecolor(true) },
    { text: t(wallet.archived ? 'wallet.unarchive' : 'wallet.archive'), onPress: () => updateWallet(wallet.id, { archived: !wallet.archived }).then(load) },
    ...(canDelete ? [{ text: t('wallet.delete'), style: 'destructive' as const, onPress: confirmDelete }] : []),
    { text: t('common.cancel'), style: 'cancel' as const },
  ]);

  const openItem = (item: ActivityItem) => {
    // Money moved by Debts & loans is managed there.
    if (item.type === 'DEBT' || item.category === 'loan') { router.navigate('/(dashboard)/debts'); return; }
    if (item.type === 'TRANSFER') {
      Alert.alert(item.title, `${formatMoney(item.amount, item.wallet?.currency ?? '')} · ${item.wallet?.name} → ${item.toWallet?.name}${item.note ? `\n“${item.note}”` : ''}`, [
        {
          text: t('detail.undo'), style: 'destructive', onPress: async () => {
            try { await deleteTransaction(item.id); load(); }
            catch (e: any) { Alert.alert(t('common.error'), e?.response?.data?.message || t('detail.undoErr')); }
          },
        },
        { text: t('detail.close'), style: 'cancel' },
      ]);
      return;
    }
    setDetailTx({
      id: item.id,
      type: item.type,
      category: item.category,
      title: item.title,
      description: item.note,
      amount: item.type === 'INCOME' ? item.amount : -item.amount,
      date: item.date,
      walletId: wallet.id,
      receiptUrl: null,
    } as Transaction);
  };

  const ACTIONS = [
    { icon: 'add' as const,               label: t('detail.add'),       onPress: () => go('/(dashboard)/add', { type: 'INCOME', walletId: wallet.id }) },
    { icon: 'remove' as const,            label: t('wallet.spend'),     onPress: () => go('/(dashboard)/add', { type: 'EXPENSE', walletId: wallet.id }) },
    { icon: 'swap-horiz' as const,        label: t('wallet.transfer'),  onPress: () => go('/(dashboard)/transfer', { mode: 'transfer', from: wallet.id }) },
    { icon: 'currency-exchange' as const, label: t('wallet.exchange'),  onPress: () => go('/(dashboard)/transfer', { mode: 'exchange', from: wallet.id }) },
  ];

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <WalletFormModal visible={editing} wallet={wallet} onClose={() => setEditing(false)} onCreated={() => { setEditing(false); load(); }} />
      <CardColorPicker visible={recolor} value={wallet.color} walletName={wallet.name}
                       onSelect={id => { setRecolor(false); updateWallet(wallet.id, { color: id }).then(load).catch(() => {}); }}
                       onClose={() => setRecolor(false)} />
      <TransactionDetailModal visible={!!detailTx} transaction={detailTx} onClose={() => setDetailTx(null)} onDeleted={() => load()} />

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={[s.roundBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={back} hitSlop={6}>
          <MaterialIcons name="arrow-back" size={18} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.topTitle, { color: theme.text }]} numberOfLines={1}>{wallet.name}</Text>
        <TouchableOpacity testID="wallet-menu" style={[s.roundBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: canManage ? 1 : 0 }]} onPress={canManage ? menu : undefined} disabled={!canManage} hitSlop={6}>
          <MaterialIcons name="more-horiz" size={18} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}
      >
        <FadeInView delay={30} slideFrom="bottom" distance={14}>
          <WalletHeroCard wallet={wallet} hidden={hidden} onToggleHidden={() => setPref('hideBalances', !hidden)} dayChange={dayChange} />
        </FadeInView>

        {/* Actions */}
        <View style={s.actions}>
          {ACTIONS.map(a => (
            <TouchableOpacity key={a.label} style={s.action} onPress={a.onPress} activeOpacity={0.8}>
              <View style={[s.actionIcon, { backgroundColor: tint(color, theme.isDark ? 0 : 0.88), borderColor: theme.isDark ? theme.border : 'transparent' }]}>
                <MaterialIcons name={a.icon} size={20} color={theme.isDark ? '#FFFFFF' : color} />
              </View>
              <Text style={[s.actionLabel, { color: theme.textSecondary }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ marginTop: 18 }}>
          <BalanceChart points={points} currency={wallet.currency} color={color} days={days} onRange={changeRange} hidden={hidden} loading={chartLoading} />
        </View>

        <View style={{ marginTop: 12 }}>
          <FlowChart flow={flow} hidden={hidden} locale={locale} />
        </View>

        {/* Account details */}
        <Text style={[s.sectionTitle, { color: theme.text }]}>{t('detail.accountDetails')}</Text>
        <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <DetailRow icon="account-balance" label={t(isMobile ? 'detail.provider' : 'detail.bank')} value={wallet.bank} />
          {wallet.accountHolder ? <DetailRow icon="person-outline" label={t(isMobile ? 'detail.registeredName' : 'detail.holder')} value={wallet.accountHolder} /> : null}
          {wallet.accountNumber ? (
            <DetailRow
              icon={isMobile ? 'phone' : 'tag'}
              label={t(isMobile ? 'detail.phoneNumber' : 'detail.accountNumber')}
              value={showNumber ? wallet.accountNumber : maskNumber(wallet.accountNumber)}
              actions={[
                { icon: showNumber ? 'visibility-off' : 'visibility', onPress: () => setShowNumber(v => !v) },
                { icon: 'content-copy', onPress: () => { Clipboard.setStringAsync(wallet.accountNumber!); Alert.alert(t('detail.copied'), t('detail.copiedMsg')); } },
              ]}
            />
          ) : null}
          <DetailRow icon="payments" label={t('detail.currency')} value={`${cur.flag} ${cur.code} · ${cur.name}`} last />
        </View>

        {/* Activity */}
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle, { color: theme.text, marginTop: 0 }]}>{t('detail.activity')}</Text>
          <Text style={[s.count, { color: theme.textMuted }]}>{t('detail.recent', { n: activity.length })}</Text>
        </View>
        <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 4 }]}>
          {activity.length === 0 ? (
            <View style={s.empty}>
              <MaterialIcons name="receipt-long" size={24} color={theme.textMuted} />
              <Text style={[s.emptyText, { color: theme.textMuted }]}>{t('detail.noActivity')}</Text>
            </View>
          ) : activity.map(item => (
            <TouchableOpacity key={item.id} onPress={() => openItem(item)} activeOpacity={0.7}>
              <ActivityRow item={item} hidden={hidden} perspectiveWalletId={wallet.id} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Manage: in a family only the owner and admins archive a wallet, and only the owner deletes it */}
        {canManage ? (
        <View style={s.manage}>
          <TouchableOpacity testID="wallet-archive" style={[s.manageBtn, { borderColor: theme.border, backgroundColor: theme.surface }]} activeOpacity={0.8}
                            onPress={() => updateWallet(wallet.id, { archived: !wallet.archived }).then(load)}>
            <MaterialIcons name={wallet.archived ? 'unarchive' : 'archive'} size={16} color={theme.textSecondary} />
            <Text style={[s.manageText, { color: theme.textSecondary }]}>{t(wallet.archived ? 'wallet.unarchive' : 'wallet.archive')}</Text>
          </TouchableOpacity>
          {canDelete ? (
          <TouchableOpacity testID="wallet-delete" style={[s.manageBtn, { borderColor: 'rgba(220,38,38,0.35)', backgroundColor: theme.isDark ? 'rgba(248,113,113,0.12)' : '#FEF2F2' }]}
                            activeOpacity={0.8} onPress={confirmDelete}>
            <MaterialIcons name="delete-outline" size={16} color={theme.isDark ? '#F87171' : '#DC2626'} />
            <Text style={[s.manageText, { color: theme.isDark ? '#F87171' : '#DC2626' }]}>{t('wallet.delete')}</Text>
          </TouchableOpacity>
          ) : null}
        </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  icon, label, value, actions = [], last,
}: {
  icon: string;
  label: string;
  value: string;
  actions?: { icon: string; onPress: () => void }[];
  last?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View style={[s.detailRow, !last && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      <MaterialIcons name={icon} size={16} color={theme.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[s.detailLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[s.detailValue, { color: theme.text }]} numberOfLines={1}>{value}</Text>
      </View>
      {actions.map(a => (
        <TouchableOpacity key={a.icon} onPress={a.onPress} hitSlop={8} style={{ marginLeft: 10 }}>
          <MaterialIcons name={a.icon} size={17} color={theme.primary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  roundBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingBottom: 120 },


  actions:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 4 },
  action:      { alignItems: 'center', width: 72 },
  actionIcon:  { width: 50, height: 50, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '500', marginTop: 6 },

  sectionTitle: { fontSize: 14, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  count:        { fontSize: 11 },
  card:         { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  detailRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  detailLabel:  { fontSize: 10 },
  detailValue:  { fontSize: 13, fontWeight: '600', marginTop: 1 },

  empty:     { alignItems: 'center', paddingVertical: 22, gap: 6 },
  manage:    { flexDirection: 'row', gap: 10, marginTop: 22 },
  manageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 16, borderWidth: 1 },
  manageText:{ fontSize: 12, fontWeight: '700' },
  emptyText: { fontSize: 12 },
});
