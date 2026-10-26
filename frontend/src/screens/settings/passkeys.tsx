// Ported from expo_app/app/(dashboard)/(settings)/passkeys.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, StatusBar, ScrollView, ActivityIndicator, TouchableOpacity, Alert, RefreshControl } from '@/rn';
import { SafeAreaView } from '@/rn';
import { useSettingsBack } from '@/hooks/use-settings-back';
import { MaterialIcons } from '@/rn';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { useI18n } from '@/context/language-context';
import { listPasskeys, registerPasskey, deletePasskey, passkeysSupported, PasskeyInfo } from '@/services/passkey.service';

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

export default function PasskeysScreen() {
  const goBack = useSettingsBack();
  const theme = useAppTheme();
  const { t } = useI18n();
  const [passkeys,   setPasskeys]   = useState<PasskeyInfo[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adding,     setAdding]     = useState(false);
  const [removing,   setRemoving]   = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setPasskeys(await listPasskeys());
    } catch { /* handled by interceptor */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    setAdding(true);
    try {
      await registerPasskey();
      await load(true);
    } catch (e: any) {
      Alert.alert(t('passkeys.registerFailed'), e?.response?.data?.message || e?.message || 'Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = (passkey: PasskeyInfo) => {
    Alert.alert(
      t('passkeys.remove'),
      t('passkeys.removeMsg', { name: passkey.deviceName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('passkeys.remove'),
          style: 'destructive',
          onPress: async () => {
            setRemoving(passkey.id);
            try {
              await deletePasskey(passkey.id);
              setPasskeys(prev => prev.filter(p => p.id !== passkey.id));
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.response?.data?.message || 'Could not remove passkey.');
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
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.topTitle, { color: theme.text }]}>{t('passkeys.title')}</Text>
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
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>{t('passkeys.subtitle')}</Text>

          <TouchableOpacity
            style={[s.addBtn, { backgroundColor: theme.primaryBg, opacity: passkeysSupported ? 1 : 0.5 }]}
            onPress={handleAdd}
            disabled={!passkeysSupported || adding}
            activeOpacity={0.75}
          >
            {adding
              ? <ActivityIndicator color={theme.primary} size="small" />
              : <MaterialIcons name="add" size={18} color={theme.primary} />}
            <Text style={[s.addBtnText, { color: theme.primary }]}>{t('passkeys.add')}</Text>
          </TouchableOpacity>
          {!passkeysSupported && (
            <Text style={[s.unsupported, { color: theme.textMuted }]}>{t('passkeys.unsupported')}</Text>
          )}

          {passkeys.length === 0 ? (
            <View style={s.emptyWrap}>
              <MaterialIcons name="fingerprint" size={52} color={theme.textMuted} />
              <Text style={[s.emptyText, { color: theme.textMuted }]}>{t('passkeys.empty')}</Text>
              <Text style={[s.emptySub, { color: theme.textMuted }]}>{t('passkeys.emptySub')}</Text>
            </View>
          ) : (
            <View style={[s.card, { backgroundColor: theme.surface }]}>
              {passkeys.map((passkey, i) => (
                <React.Fragment key={passkey.id}>
                  <View style={s.row}>
                    <View style={[s.iconWrap, { backgroundColor: theme.primaryBg }]}>
                      <MaterialIcons name="fingerprint" size={22} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.deviceName, { color: theme.text }]}>{passkey.deviceName}</Text>
                      <Text style={[s.deviceMeta, { color: theme.textMuted }]}>
                        {t('passkeys.added', { date: timeAgo(passkey.createdAt) })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={s.removeBtn}
                      onPress={() => handleRemove(passkey)}
                      disabled={removing === passkey.id}
                      activeOpacity={0.7}
                    >
                      {removing === passkey.id
                        ? <ActivityIndicator color="#f87171" size="small" />
                        : <MaterialIcons name="delete-outline" size={20} color="#f87171" />
                      }
                    </TouchableOpacity>
                  </View>
                  {i < passkeys.length - 1 && (
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

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 12, marginBottom: 8,
  },
  addBtnText: { fontSize: 14, fontWeight: '600' },
  unsupported: { fontSize: 11, lineHeight: 16, marginBottom: 16 },

  card:    { borderRadius: 18, overflow: 'hidden', marginTop: 16 },
  row:     { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  iconWrap:{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deviceName: { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  deviceMeta: { fontSize: 12 },
  removeBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  divider:    { height: 1, marginLeft: 72 },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: '600' },
  emptySub:  { fontSize: 12, textAlign: 'center', paddingHorizontal: 30 },
});
