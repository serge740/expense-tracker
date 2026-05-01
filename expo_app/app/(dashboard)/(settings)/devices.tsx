import React, { useEffect, useState, useCallback } from 'react';
import {
  View, StyleSheet, StatusBar, ScrollView, ActivityIndicator,
  TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { getDevices, removeDevice, DeviceInfo } from '@/services/device.service';

function platformIcon(platform: string) {
  return platform === 'ios' ? 'phone-iphone' : 'phone-android';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DevicesScreen() {
  const theme = useAppTheme();
  const [devices,     setDevices]     = useState<DeviceInfo[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [removing,    setRemoving]    = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setDevices(await getDevices());
    } catch { /* handled by interceptor */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemove = (device: DeviceInfo) => {
    Alert.alert(
      'Remove Device',
      `Remove "${device.deviceName}" from your account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(device.id);
            try {
              await removeDevice(device.id);
              setDevices(prev => prev.filter(d => d.id !== device.id));
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || 'Could not remove device.');
            } finally {
              setRemoving(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <View style={[s.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.topTitle, { color: theme.text }]}>Devices</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={theme.primary}
            />
          }
        >
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>
            Devices currently signed into your account. Remove any you don't recognise.
          </Text>

          {devices.length === 0 ? (
            <View style={s.emptyWrap}>
              <MaterialIcons name="devices" size={52} color={theme.textMuted} />
              <Text style={[s.emptyText, { color: theme.textMuted }]}>No devices found</Text>
            </View>
          ) : (
            <View style={[s.card, { backgroundColor: theme.surface }]}>
              {devices.map((device, i) => (
                <React.Fragment key={device.id}>
                  <View style={s.row}>
                    <View style={[s.iconWrap, { backgroundColor: theme.primaryBg }]}>
                      <MaterialIcons name={platformIcon(device.platform) as any} size={22} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.deviceName, { color: theme.text }]}>{device.deviceName}</Text>
                      <Text style={[s.deviceMeta, { color: theme.textMuted }]}>
                        {device.platform.toUpperCase()}  ·  Last active {timeAgo(device.lastActiveAt)}
                      </Text>
                      {device.ipAddress && device.ipAddress !== 'unknown' && (
                        <Text style={[s.deviceIp, { color: theme.textMuted }]}>IP: {device.ipAddress}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={s.removeBtn}
                      onPress={() => handleRemove(device)}
                      disabled={removing === device.id}
                      activeOpacity={0.7}
                    >
                      {removing === device.id
                        ? <ActivityIndicator color="#f87171" size="small" />
                        : <MaterialIcons name="logout" size={20} color="#f87171" />
                      }
                    </TouchableOpacity>
                  </View>
                  {i < devices.length - 1 && (
                    <View style={[s.divider, { backgroundColor: theme.border }]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          )}
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

  scroll:   { padding: 16, paddingTop: 12 },
  subtitle: { fontSize: 13, lineHeight: 20, marginBottom: 16 },

  card:    { borderRadius: 18, overflow: 'hidden' },
  row:     { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  iconWrap:{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deviceName: { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  deviceMeta: { fontSize: 12 },
  deviceIp:   { fontSize: 11, marginTop: 2 },
  removeBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  divider:    { height: 1, marginLeft: 72 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15 },
});
