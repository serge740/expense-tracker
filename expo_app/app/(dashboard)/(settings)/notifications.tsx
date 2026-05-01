import React, { useEffect, useState, useCallback } from 'react';
import {
  View, StyleSheet, StatusBar, ScrollView, ActivityIndicator,
  TouchableOpacity, Switch, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import {
  getNotifications, getNotificationPreferences, updateNotificationPreferences,
  markNotificationRead, markAllRead, sendTestPush,
  NotificationItem, NotificationPreference,
} from '@/services/notification.service';

function channelIcon(channel: string) {
  if (channel === 'push')   return 'notifications';
  if (channel === 'email')  return 'email';
  return 'info-outline';
}

function typeColor(type: string, theme: any) {
  if (type === 'transaction') return theme.primary;
  if (type === 'security')    return '#f87171';
  return theme.textMuted;
}

function timeStr(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationsScreen() {
  const theme = useAppTheme();
  const [tab, setTab]                 = useState<'list' | 'settings'>('list');
  const [items, setItems]             = useState<NotificationItem[]>([]);
  const [prefs, setPrefs]             = useState<NotificationPreference | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [unread, setUnread]           = useState(0);
  const [savingPref, setSavingPref]   = useState(false);

  const loadList = useCallback(async () => {
    try {
      const data = await getNotifications(1, 30);
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch { /* handled */ }
  }, []);

  const loadPrefs = useCallback(async () => {
    try { setPrefs(await getNotificationPreferences()); }
    catch { /* handled */ }
  }, []);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    await Promise.all([loadList(), loadPrefs()]);
    setLoading(false);
    setRefreshing(false);
  }, [loadList, loadPrefs]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleMarkRead = async (item: NotificationItem) => {
    if (item.read) return;
    try {
      await markNotificationRead(item.id);
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch { /* handled */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      setItems(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not mark all as read.');
    }
  };

  const handlePrefToggle = async (key: keyof NotificationPreference, value: boolean) => {
    if (!prefs) return;
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSavingPref(true);
    try {
      await updateNotificationPreferences({ [key]: value });
    } catch {
      setPrefs(prefs);
      Alert.alert('Error', 'Could not update preference.');
    } finally {
      setSavingPref(false);
    }
  };

  const handleTestPush = async () => {
    try {
      await sendTestPush('Test Notification', 'This is a test push notification from ABY Expense.');
      Alert.alert('Sent', 'A test push notification has been sent to your devices.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not send test notification.');
    }
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <View style={[s.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.topTitle, { color: theme.text }]}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Tabs */}
      <View style={[s.tabRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {(['list', 'settings'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabText, { color: tab === t ? theme.primary : theme.textMuted }]}>
              {t === 'list' ? `Inbox${unread > 0 ? ` (${unread})` : ''}` : 'Settings'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : tab === 'list' ? (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadAll(true); }}
              tintColor={theme.primary}
            />
          }
        >
          {unread > 0 && (
            <TouchableOpacity
              style={[s.markAllBtn, { borderColor: theme.border }]}
              onPress={handleMarkAllRead}
              activeOpacity={0.7}
            >
              <MaterialIcons name="done-all" size={16} color={theme.primary} />
              <Text style={[s.markAllText, { color: theme.primary }]}>Mark all as read</Text>
            </TouchableOpacity>
          )}

          {items.length === 0 ? (
            <View style={s.emptyWrap}>
              <MaterialIcons name="notifications-none" size={52} color={theme.textMuted} />
              <Text style={[s.emptyText, { color: theme.textMuted }]}>No notifications yet</Text>
            </View>
          ) : (
            <View style={[s.card, { backgroundColor: theme.surface }]}>
              {items.map((item, i) => (
                <React.Fragment key={item.id}>
                  <TouchableOpacity
                    style={[s.notifRow, !item.read && { backgroundColor: `${theme.primary}0A` }]}
                    onPress={() => handleMarkRead(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.notifIcon, { backgroundColor: `${typeColor(item.type, theme)}18` }]}>
                      <MaterialIcons name={channelIcon(item.channel) as any} size={20} color={typeColor(item.type, theme)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={s.notifHeader}>
                        <Text style={[s.notifTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                        {!item.read && <View style={[s.dot, { backgroundColor: theme.primary }]} />}
                      </View>
                      <Text style={[s.notifBody, { color: theme.textSecondary }]} numberOfLines={2}>{item.body}</Text>
                      <Text style={[s.notifTime, { color: theme.textMuted }]}>{timeStr(item.createdAt)}</Text>
                    </View>
                  </TouchableOpacity>
                  {i < items.length - 1 && (
                    <View style={[s.divider, { backgroundColor: theme.border }]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          <View style={[s.card, { backgroundColor: theme.surface }]}>
            <Text style={[s.cardTitle, { color: theme.textMuted }]}>CHANNELS</Text>

            {([
              { key: 'pushEnabled',  icon: 'notifications', label: 'Push Notifications', sub: 'Real-time alerts on this device' },
              { key: 'emailEnabled', icon: 'email',         label: 'Email Notifications', sub: 'Activity digests sent to your email' },
              { key: 'inAppEnabled', icon: 'info-outline',  label: 'In-App Notifications', sub: 'Shown in your notification inbox' },
            ] as const).map((item, i, arr) => (
              <React.Fragment key={item.key}>
                <View style={s.prefRow}>
                  <View style={[s.prefIcon, { backgroundColor: theme.primaryBg }]}>
                    <MaterialIcons name={item.icon as any} size={20} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.prefLabel, { color: theme.text }]}>{item.label}</Text>
                    <Text style={[s.prefSub, { color: theme.textMuted }]}>{item.sub}</Text>
                  </View>
                  <Switch
                    value={prefs?.[item.key] ?? true}
                    onValueChange={v => handlePrefToggle(item.key, v)}
                    trackColor={{ false: theme.border, true: `${theme.primary}80` }}
                    thumbColor={prefs?.[item.key] ? theme.primary : theme.textMuted}
                    disabled={savingPref}
                  />
                </View>
                {i < arr.length - 1 && <View style={[s.divider, { backgroundColor: theme.border }]} />}
              </React.Fragment>
            ))}
          </View>

          <TouchableOpacity
            style={[s.testBtn, { backgroundColor: theme.primaryBg, borderColor: theme.primary }]}
            onPress={handleTestPush}
            activeOpacity={0.8}
          >
            <MaterialIcons name="send" size={18} color={theme.primary} />
            <Text style={[s.testBtnText, { color: theme.primary }]}>Send Test Push Notification</Text>
          </TouchableOpacity>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  backBtn:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '700' },

  tabRow: {
    flexDirection: 'row', borderBottomWidth: 1,
  },
  tab:     { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '600' },

  scroll: { padding: 16 },

  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-end', borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12,
  },
  markAllText: { fontSize: 13, fontWeight: '600' },

  card:      { borderRadius: 18, overflow: 'hidden', marginBottom: 16 },
  cardTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, padding: 16, paddingBottom: 4 },

  notifRow:   { flexDirection: 'row', padding: 14, gap: 12, alignItems: 'flex-start' },
  notifIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  notifHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  notifTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  notifBody:  { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  notifTime:  { fontSize: 11 },

  prefRow:  { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  prefIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  prefLabel:{ fontSize: 15, fontWeight: '500', marginBottom: 2 },
  prefSub:  { fontSize: 12 },

  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1,
  },
  testBtnText: { fontSize: 15, fontWeight: '600' },

  divider: { height: 1, marginLeft: 66 },

  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15 },
});
