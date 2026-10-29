import { ScopePill } from '@/components/family/scope-switcher';
import { useScope } from '@/context/scope-context';
import { errorMessage } from '@/utils/family-errors';
import { FamilyNote } from '@/components/family/family-screen';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, ScrollView, FlatList, TouchableOpacity, StyleSheet, StatusBar, Alert, RefreshControl, useWindowDimensions,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import {
  getWallets, getDailyFlow, getActivity, getBalanceHistory, deleteWallet, updateWallet,
  Wallet, DailyFlow, ActivityItem,
} from '@/services/wallet.service';
import { formatMoney, currencyByCode } from '@/context/currency-context';
import { usePreferences } from '@/context/preferences-context';
import { useI18n } from '@/context/language-context';
import { WalletFormModal } from '@/components/wallet-form-modal';
import { WalletHeroCard } from '@/components/wallet/wallet-hero-card';
import { tint } from '@/components/wallet/wallet-card';
import { FlowChart } from '@/components/wallet/flow-chart';
import { ActivityRow } from '@/components/wallet/activity-row';
import { CurrencyPicker } from '@/components/wallet/currency-picker';
import { CardColorPicker } from '@/components/wallet/card-color-picker';
import { cardTheme } from '@/constants/card-themes';
import { LedgerCards } from '@/components/debt/ledger-cards';

const SIDE = 16;
const GAP = 10;

export default function WalletsScreen() {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const { prefs, setPref } = usePreferences();
  const { locale, t } = useI18n();
  const hidden = prefs.hideBalances;
  const CARD_W = width - SIDE * 2;

  const [wallets, setWallets]       = useState<Wallet[]>([]);
  const [index, setIndex]           = useState(0);
  const [flow, setFlow]             = useState<DailyFlow | null>(null);
  const [activity, setActivity]     = useState<ActivityItem[]>([]);
  const [dayChange, setDayChange]   = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const scope = useScope();
  // In a family only the owner and admins manage wallets, and only the owner deletes them (the server enforces the same).
  const canManage = scope.can('wallet.manage');
  const canDelete = scope.can('wallet.delete');
  const canMove   = scope.can('tx.add');
  const [showForm, setShowForm]     = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [relabel, setRelabel]       = useState<Wallet | null>(null);
  const [recolor, setRecolor]       = useState<Wallet | null>(null);
  const [editing, setEditing]       = useState<Wallet | null>(null);
  const listRef = useRef<FlatList>(null);

  const loadWallets = useCallback(async () => {
    try { setWallets(await getWallets()); } catch { /* keep last */ }
    finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { loadWallets(); }, [loadWallets]));

  const visible = useMemo(() => wallets.filter(w => showArchived || !w.archived), [wallets, showArchived]);
  const onAddCard = index >= visible.length;
  const selected: Wallet | null = onAddCard ? null : visible[index] ?? null;

  // Per-wallet panels follow the card in view.
  const selectedId = selected?.id ?? null;
  const selectedCurrency = selected?.currency;
  const balanceKey = selected?.balance;
  useEffect(() => {
    if (!selectedId || !selectedCurrency) return;
    let alive = true;
    Promise.all([
      getDailyFlow(selectedCurrency, 7, selectedId),
      getActivity(6, selectedId),
      getBalanceHistory(selectedId, 2),
    ]).then(([fl, act, hist]) => {
      if (!alive) return;
      setFlow(fl);
      setActivity(act);
      const pts = hist.points;
      setDayChange(pts.length >= 2 ? pts[pts.length - 1].balance - pts[pts.length - 2].balance : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [selectedId, selectedCurrency, balanceKey]);

  // Totals per currency — never summed across currencies.
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    wallets.filter(w => !w.archived).forEach(w => m.set(w.currency, (m.get(w.currency) ?? 0) + w.balance));
    return [...m.entries()];
  }, [wallets]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + GAP)));
  };
  const goToIndex = (i: number) => {
    listRef.current?.scrollToOffset({ offset: i * (CARD_W + GAP), animated: true });
    setIndex(i);
  };

  const go = (pathname: string, params?: Record<string, string>) => router.push({ pathname: pathname as any, params });

  const confirmDelete = (w: Wallet) => {
    Alert.alert(t('wallet.delete'), t('wallet.deleteMsg', { name: w.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('wallet.deleteBtn'), style: 'destructive', onPress: async () => {
          try { await deleteWallet(w.id); goToIndex(0); loadWallets(); }
          catch (e: any) { Alert.alert(t('common.error'), errorMessage(e, t('wallet.errDelete'), t)); }
        },
      },
    ]);
  };

  const walletMenu = (w: Wallet) => {
    if (!canManage) return;
    Alert.alert(w.name, `${w.bank} · ${w.currency}`, [
      { text: t('wallet.edit'), onPress: () => setEditing(w) },
      ...(!w.isDefault && !w.archived ? [{ text: t('wallet.makeDefault'), onPress: () => updateWallet(w.id, { isDefault: true }).then(loadWallets) }] : []),
      { text: t('wallet.changeColor'), onPress: () => setRecolor(w) },
      { text: t('wallet.changeCurrencyLabel'), onPress: () => setRelabel(w) },
      { text: t(w.archived ? 'wallet.unarchive' : 'wallet.archive'), onPress: () => updateWallet(w.id, { archived: !w.archived }).then(loadWallets) },
      ...(canDelete ? [{ text: t('wallet.delete'), style: 'destructive' as const, onPress: () => confirmDelete(w) }] : []),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  const applyRelabel = async (code: string) => {
    const w = relabel;
    setRelabel(null);
    if (!w || code === w.currency) return;
    try { await updateWallet(w.id, { currency: code }); loadWallets(); }
    catch (e: any) { Alert.alert(t('common.error'), errorMessage(e, t('wallet.errUpdate'), t)); }
  };

  const accent = selected ? cardTheme(selected.color).accent : theme.primary;
  const ACTIONS = selected && canMove ? [
    { icon: 'add' as const,               label: t('wallet.addMoney'), onPress: () => go('/(dashboard)/add', { type: 'INCOME', walletId: selected.id }) },
    { icon: 'remove' as const,            label: t('wallet.spend'),    onPress: () => go('/(dashboard)/add', { type: 'EXPENSE', walletId: selected.id }) },
    { icon: 'swap-horiz' as const,        label: t('wallet.transfer'), onPress: () => go('/(dashboard)/transfer', { mode: 'transfer', from: selected.id }) },
    { icon: 'currency-exchange' as const, label: t('wallet.exchange'), onPress: () => go('/(dashboard)/transfer', { mode: 'exchange', from: selected.id }) },
  ] : [];

  return (
    <SafeAreaView edges={['top']} style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <WalletFormModal visible={showForm || !!editing} wallet={editing} onClose={() => { setShowForm(false); setEditing(null); }}
                       onCreated={() => { setShowForm(false); setEditing(null); loadWallets(); }} />
      <CurrencyPicker
        visible={!!relabel}
        value={relabel?.currency}
        title={t('wallet.currencyOf', { name: relabel?.name ?? '' })}
        note={t('wallet.relabelNote')}
        onSelect={c => applyRelabel(c.code)}
        onClose={() => setRelabel(null)}
      />
      <CardColorPicker
        visible={!!recolor}
        value={recolor?.color}
        walletName={recolor?.name}
        onSelect={id => { const w = recolor; setRecolor(null); if (w) updateWallet(w.id, { color: id }).then(loadWallets).catch(() => {}); }}
        onClose={() => setRecolor(null)}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadWallets(); }} tintColor={theme.primary} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={[s.title, { color: theme.text }]}>{t('wallet.title')}</Text>
            <Text style={[s.subtitle, { color: theme.textMuted }]}>{t('wallet.subtitle')}</Text>
            <View style={{ marginTop: 8 }}><ScopePill /></View>
          </View>
          <View style={s.headerActions}>
            {canMove ? (
              <TouchableOpacity testID="wallets-exchange" style={[s.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                onPress={() => go('/(dashboard)/transfer', { mode: 'exchange' })} activeOpacity={0.8}>
                <MaterialIcons name="currency-exchange" size={17} color={theme.text} />
              </TouchableOpacity>
            ) : null}
            {canManage ? (
              <TouchableOpacity testID="wallets-add" style={[s.iconBtn, { backgroundColor: theme.buttonBg, borderColor: theme.buttonBg }]}
                                onPress={() => setShowForm(true)} activeOpacity={0.85}>
                <MaterialIcons name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Per-currency totals (never mixed into one number) */}
        {totals.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.totals}>
            {totals.map(([code, sum]) => (
              <View key={code} style={[s.totalChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={s.totalFlag}>{currencyByCode(code).flag}</Text>
                <Text style={[s.totalText, { color: theme.text }]}>{formatMoney(sum, code, { hidden })}</Text>
              </View>
            ))}
            {wallets.some(w => w.archived) && (
              <TouchableOpacity onPress={() => { setShowArchived(v => !v); goToIndex(0); }}
                                style={[s.totalChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <MaterialIcons name="inventory-2" size={13} color={theme.textMuted} />
                <Text style={[s.totalText, { color: theme.textMuted }]}>{t(showArchived ? 'wallet.hideArchived' : 'wallet.archived')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* Wallet carousel */}
        <FlatList
          ref={listRef}
          data={canManage ? [...visible, null] : visible}
          keyExtractor={(w, i) => w?.id ?? `add-${i}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + GAP}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: SIDE }}
          ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => item ? (
            <TouchableOpacity activeOpacity={0.93} onLongPress={() => walletMenu(item)}
                              onPress={() => go('/(dashboard)/wallet-detail', { walletId: item.id })} style={{ width: CARD_W }}>
              <WalletHeroCard wallet={item} hidden={hidden} onToggleHidden={() => setPref('hideBalances', !hidden)}
                              dayChange={item.id === selected?.id ? dayChange : undefined} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setShowForm(true)} activeOpacity={0.85}
                              style={[s.addCard, { width: CARD_W, borderColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={[s.addIcon, { backgroundColor: theme.primaryBg }]}>
                <MaterialIcons name="add" size={26} color={theme.primary} />
              </View>
              <Text style={[s.addTitle, { color: theme.text }]}>{t('wallet.addWallet')}</Text>
              <Text style={[s.addSub, { color: theme.textMuted }]}>{t('wallet.addWalletSub')}</Text>
            </TouchableOpacity>
          )}
        />

        {/* Dots */}
        <View style={s.dots}>
          {(canManage ? [...visible, null] : visible).map((w, i) => (
            <TouchableOpacity key={w?.id ?? 'add'} onPress={() => goToIndex(i)} hitSlop={6}>
              <View style={[s.dot, i === index
                ? { width: 18, backgroundColor: w ? cardTheme(w.color).accent : theme.primary }
                : { backgroundColor: theme.border }]} />
            </TouchableOpacity>
          ))}
        </View>

        {selected ? (
          <View style={{ paddingHorizontal: SIDE }}>
            {/* Actions for the wallet in view */}
            <View style={s.actions}>
              {ACTIONS.map(a => (
                <TouchableOpacity key={a.label} style={s.action} onPress={a.onPress} activeOpacity={0.8}>
                  <View style={[s.actionIcon, {
                    backgroundColor: theme.isDark ? theme.surface : tint(accent, 0.88),
                    borderColor: theme.isDark ? theme.border : 'transparent',
                  }]}>
                    <MaterialIcons name={a.icon} size={20} color={theme.isDark ? '#FFFFFF' : accent} />
                  </View>
                  <Text style={[s.actionLabel, { color: theme.textSecondary }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.sectionHead}>
              <Text style={[s.sectionTitle, { color: theme.text }]} numberOfLines={1}>{t('wallet.statistics', { name: selected.name })}</Text>
            </View>
            <FlowChart flow={flow} hidden={hidden} locale={locale} />

            <View style={s.sectionHead}>
              <Text style={[s.sectionTitle, { color: theme.text }]}>{t('wallet.recentActivity')}</Text>
              <TouchableOpacity onPress={() => go('/(dashboard)/wallet-detail', { walletId: selected.id })} hitSlop={6}>
                <Text style={[s.link, { color: theme.primary }]}>{t('wallet.viewWallet')}</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {activity.length === 0 ? (
                <View style={s.empty}>
                  <MaterialIcons name="receipt-long" size={26} color={theme.textMuted} />
                  <Text style={[s.emptyText, { color: theme.textMuted }]}>{t('wallet.noActivityIn', { name: selected.name })}</Text>
                </View>
              ) : (
                activity.map(item => <ActivityRow key={item.id} item={item} hidden={hidden} perspectiveWalletId={selected.id} />)
              )}
            </View>
          </View>
        ) : (
          <View style={[s.emptyBlock, { paddingHorizontal: SIDE }]}>
            <Text style={[s.emptyText, { color: theme.textMuted }]}>
              {t(visible.length ? 'wallet.swipeBack' : canManage ? 'wallet.createFirst' : 'family.wallet.empty')}
            </Text>
          </View>
        )}

        {scope.isFamily && !canManage ? <View style={{ paddingHorizontal: SIDE }}><FamilyNote testID="wallets-manage-note" text={t('family.wallet.manageOnly')} /></View> : null}

        {/* Protected summaries of debts and credits (not real wallets). They are personal: a family has none. */}
        {!scope.isFamily ? <LedgerCards hidden={hidden} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },

  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SIDE, paddingTop: 8, paddingBottom: 10 },
  title:         { fontSize: 20, fontWeight: '700' },
  subtitle:      { fontSize: 11, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn:       { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  totals:    { gap: 6, paddingHorizontal: SIDE, paddingBottom: 12 },
  totalChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  totalFlag: { fontSize: 13 },
  totalText: { fontSize: 11, fontWeight: '700' },

  addCard:  { height: 196, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addIcon:  { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  addTitle: { fontSize: 14, fontWeight: '700' },
  addSub:   { fontSize: 11 },

  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 12 },
  dot:  { width: 6, height: 6, borderRadius: 3 },

  actions:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 4 },
  action:      { alignItems: 'center', width: 72 },
  actionIcon:  { width: 50, height: 50, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '500', marginTop: 6 },

  sectionHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  link:         { fontSize: 12, fontWeight: '600' },

  listCard:   { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
  empty:      { alignItems: 'center', paddingVertical: 22, gap: 6 },
  emptyBlock: { alignItems: 'center', paddingVertical: 30 },
  emptyText:  { fontSize: 12, textAlign: 'center', maxWidth: 260 },
});
