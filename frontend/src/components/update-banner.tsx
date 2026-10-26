import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, MaterialIcons } from '@/rn';
import { router, usePathname } from '@/router/router';
import { useAppTheme } from '@/theme/theme-context';
import { useI18n } from '@/context/language-context';
import { useAppUpdate } from '@/context/app-update-context';
import { storage } from '@/lib/storage';

const DISMISSED_KEY = 'updateBannerDismissed';

/**
 * A small card above the tab bar when a newer version is waiting. Closing it hides it for that version only (a still newer
 * one shows it again); the App updates page in Settings always has the button.
 */
export function UpdateBanner() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { available, latest } = useAppUpdate();
  const path = usePathname();
  const [dismissed, setDismissed] = useState(() => storage.get(DISMISSED_KEY));
  // Not on the page that already shows the same thing.
  if (!available || !latest || dismissed === latest.buildId || path.includes('app-updates')) return null;

  return (
    <View pointerEvents="box-none" style={s.wrap}>
      <View accessibilityRole="status" accessibilityLiveRegion="polite" style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[s.icon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name="system-update" size={18} color={theme.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{t('upd.bannerTitle')}</Text>
          <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('upd.bannerText')}</Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/(dashboard)/(settings)/app-updates')} style={[s.pill, { backgroundColor: theme.buttonBg }]}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('upd.view')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7} accessibilityLabel={t('toast.close')} style={{ padding: 4 }}
          onPress={() => { storage.set(DISMISSED_KEY, latest.buildId); setDismissed(latest.buildId); }}
        >
          <MaterialIcons name="close" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, bottom: 92, zIndex: 800 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingLeft: 12, paddingRight: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
