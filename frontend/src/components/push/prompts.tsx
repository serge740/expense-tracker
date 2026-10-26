import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, MaterialIcons } from '@/rn';
import { router } from '@/router/router';
import { useAppTheme } from '@/theme/theme-context';
import { useI18n } from '@/context/language-context';
import { usePush } from '@/context/push-context';
import { usePwaInstall } from '@/context/pwa-install-context';
import { useNotifications } from '@/context/notification-context';
import { storage } from '@/lib/storage';

const HIDE_KEY = 'pushBannerHiddenUntil';
const HIDE_MS = 14 * 24 * 60 * 60 * 1000;
const INSTALL_KEY = 'pwaInstallDismissed';
const ASK_STATES = ['default', 'granted-not-subscribed'];

/** One soft prompt on Home. "Not now" hides it for 14 days. */
export function PushBanner() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { status, enable } = usePush();
  const [hidden, setHidden] = useState(() => Date.now() < Number(storage.get(HIDE_KEY) ?? 0));
  const [busy, setBusy] = useState(false);
  if (hidden || !ASK_STATES.includes(status.state)) return null;

  const notNow = () => { storage.set(HIDE_KEY, String(Date.now() + HIDE_MS)); setHidden(true); };
  return (
    <View style={[s.banner, { backgroundColor: theme.primaryBg, borderColor: theme.border }]}>
      <MaterialIcons name="notifications-active" size={20} color={theme.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{t('push.bannerTitle')}</Text>
        <Text style={{ fontSize: 12, color: theme.textSecondary }}>{t('push.bannerText')}</Text>
      </View>
      <TouchableOpacity disabled={busy} activeOpacity={0.8} onPress={() => { setBusy(true); void enable().finally(() => setBusy(false)); }} style={[s.pill, { backgroundColor: theme.buttonBg }, busy && { opacity: 0.5 }]}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('push.enable')}</Text>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.7} onPress={notNow} accessibilityLabel={t('push.notNow')} style={{ padding: 4 }}>
        <MaterialIcons name="close" size={18} color={theme.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * Offers to install the app once the browser says it can be installed. "Install", "Not now" or closing it all count as an
 * answer, remembered so it is never asked again; the Install row in notification settings stays for anyone who changes their mind.
 */
export function InstallPrompt() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { canInstall, isInstalled, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => storage.get(INSTALL_KEY) === '1');
  const [busy, setBusy] = useState(false);
  if (dismissed || isInstalled || !canInstall) return null;

  const dismiss = () => { storage.set(INSTALL_KEY, '1'); setDismissed(true); };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={dismiss}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} accessibilityLabel={t('toast.close')} />
        <View style={[s.sheet, { backgroundColor: theme.surface }]}>
          <View style={[s.icon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name="download" size={26} color={theme.primary} /></View>
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text, textAlign: 'center', marginTop: 12 }}>{t('pwa.title')}</Text>
          <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>{t('pwa.text')}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <TouchableOpacity activeOpacity={0.8} onPress={dismiss} disabled={busy} style={[s.sheetBtn, { borderWidth: 1, borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>{t('push.notNow')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85} disabled={busy} style={[s.sheetBtn, { backgroundColor: theme.buttonBg }, busy && { opacity: 0.5 }]}
              onPress={async () => { setBusy(true); await install(); setBusy(false); dismiss(); }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('pwa.install')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const AUTO_HIDE_MS = 6000;

/** A small card at the top when a notification arrives while the app is open. Reminders have their own pop-up; security alerts stay until closed. */
export function NotificationToaster() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { lastArrival } = useNotifications();
  const [toast, setToast] = useState<{ title: string; body?: string; type: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastArrival || lastArrival.type === 'reminder' || !lastArrival.title) return;
    if (document.visibilityState !== 'visible') return;
    setToast({ title: lastArrival.title, body: lastArrival.body, type: lastArrival.type });
    if (timer.current) clearTimeout(timer.current);
    if (lastArrival.type !== 'security') timer.current = setTimeout(() => setToast(null), AUTO_HIDE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [lastArrival?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null;
  const danger = toast.type === 'security';
  return (
    <View pointerEvents="box-none" style={s.toastWrap}>
      <View accessibilityRole="status" accessibilityLiveRegion="polite" style={[s.toast, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[s.toastIcon, { backgroundColor: danger ? 'rgba(239,68,68,0.12)' : theme.primaryBg }]}>
          <MaterialIcons name={danger ? 'shield' : 'notifications'} size={16} color={danger ? theme.expense : theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{toast.title}</Text>
          {toast.body ? <Text numberOfLines={2} style={{ fontSize: 12, color: theme.textSecondary }}>{toast.body}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
            <TouchableOpacity onPress={() => { setToast(null); router.push('/(dashboard)/(settings)/notifications'); }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{t('toast.open')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setToast(null)}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textMuted }}>{t('toast.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingLeft: 12, paddingRight: 8, marginHorizontal: 20, marginTop: 14 },
  pill: { height: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,20,26,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 28, alignItems: 'stretch' },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  sheetBtn: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  toastWrap: { position: 'absolute', top: 10, left: 12, right: 12, zIndex: 900 },
  toast: { flexDirection: 'row', gap: 10, borderRadius: 14, borderWidth: 1, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16 },
  toastIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
