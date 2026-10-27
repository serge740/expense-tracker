import { useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, MaterialIcons } from '@/rn';
import { useAppTheme } from '@/theme/theme-context';
import { useI18n } from '@/context/language-context';
import { usePush } from '@/context/push-context';
import { usePwaInstall } from '@/context/pwa-install-context';
import type { PushDevice } from '@/lib/push';
import { isIosDevice } from '@/lib/platform';

type Tone = 'neutral' | 'ok' | 'warn';

function Panel({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const theme = useAppTheme();
  const bg = tone === 'ok' ? 'rgba(34,197,94,0.10)' : tone === 'warn' ? 'rgba(245,165,36,0.14)' : theme.surface;
  const border = tone === 'ok' ? 'rgba(34,197,94,0.35)' : tone === 'warn' ? 'rgba(245,165,36,0.45)' : theme.border;
  return <View style={[s.panel, { backgroundColor: bg, borderColor: border }]}>{children}</View>;
}

function Btn({ label, onPress, busy, ghost, danger, small }: { label: string; onPress: () => void; busy?: boolean; ghost?: boolean; danger?: boolean; small?: boolean }) {
  const theme = useAppTheme();
  const color = danger ? theme.expense : ghost ? theme.primary : '#fff';
  return (
    <TouchableOpacity
      onPress={onPress} disabled={busy} activeOpacity={0.8} accessibilityLabel={label}
      style={[s.btn, small && s.btnSmall, ghost || danger ? { borderWidth: 1, borderColor: danger ? theme.expense : theme.border, backgroundColor: 'transparent' } : { backgroundColor: theme.buttonBg }, busy && { opacity: 0.5 }]}
    >
      <Text style={{ color, fontSize: small ? 12 : 13, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const when = (iso: string | null, never: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : never;

/** This browser's push state, with the right next step for each state. */
export function PushPanel() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { status, devices, enable, attach, turnOff, test, refresh } = usePush();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const isIos = isIosDevice();
  const mine = devices.find(d => d.endpointHash === status.thisHash);

  const run = async (work: () => Promise<unknown>) => { setBusy(true); try { await work(); } finally { setBusy(false); } };
  const body = (text: string, strong = false) => <Text style={{ fontSize: 13, color: strong ? theme.text : theme.textSecondary, fontWeight: strong ? '700' : '400', lineHeight: 19 }}>{text}</Text>;

  switch (status.state) {
    case 'loading':
      return <Panel>{body(t('push.checking'))}</Panel>;
    case 'error':
      return <Panel tone="warn">{body(t('push.error'))}<View style={s.row}><Btn ghost small label={t('push.checkAgain')} onPress={() => void refresh()} /></View></Panel>;
    case 'unsupported':
      return <Panel>{body(t('push.unsupported'))}{isIos && <View style={{ marginTop: 8 }}>{body(t('push.iosHint'))}</View>}</Panel>;
    case 'insecure':
      return <Panel tone="warn">{body(t('push.insecure'))}</Panel>;
    case 'server-off':
      return <Panel tone="warn">{body(t('push.serverOff'))}</Panel>;
    case 'default':
      return (
        <Panel>
          {body(t('push.defaultTitle'), true)}
          <View style={{ marginTop: 4 }}>{body(t('push.defaultText'))}</View>
          <View style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <TextInput value={label} onChangeText={v => setLabel(v.slice(0, 40))} placeholder={t('push.namePh')} placeholderTextColor={theme.textMuted} style={{ flex: 1, fontSize: 13, color: theme.text }} />
          </View>
          <View style={s.row}><Btn busy={busy} label={t('push.enableBtn')} onPress={() => void run(() => enable(label.trim() || undefined))} /></View>
        </Panel>
      );
    case 'denied':
      return (
        <Panel tone="warn">
          {body(t('push.denied'), true)}
          <View style={{ marginTop: 4 }}>{body(t('push.deniedHelp'))}</View>
          <View style={s.row}><Btn ghost small label={t('push.checkAgain')} onPress={() => void refresh()} /></View>
        </Panel>
      );
    case 'granted-not-subscribed':
      return <Panel>{body(t('push.grantedNot'))}<View style={s.row}><Btn busy={busy} label={t('push.turnOn')} onPress={() => void run(() => enable())} /></View></Panel>;
    case 'subscribed-elsewhere':
      return <Panel tone="warn">{body(t('push.elsewhere'))}<View style={s.row}><Btn busy={busy} label={t('push.useForMine')} onPress={() => void run(() => attach())} /></View></Panel>;
    case 'subscribed':
      return (
        <Panel tone="ok">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name="check-circle" size={18} color={theme.income} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: theme.income }}>{t('push.subscribed')}</Text>
          </View>
          {mine && <View style={{ marginTop: 4 }}>{body(`"${mine.label}" · ${mine.browser ?? ''} · ${mine.os ?? ''}`)}</View>}
          <View style={s.row}>
            <Btn small ghost busy={busy || !mine} label={t('push.sendTest')} onPress={() => void run(async () => {
              const result = await test(mine!.id);
              if (result) Alert.alert(t('push.sendTest'), result.sent ? t('push.testSent') : t('push.testFailed'));
            })} />
            <Btn small ghost busy={busy} label={t('push.turnOff')} onPress={() => void run(() => turnOff())} />
          </View>
        </Panel>
      );
    default:
      return null;
  }
}

function DeviceRow({ device, isThis }: { device: PushDevice; isThis: boolean }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { rename, remove, test } = usePush();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.label ?? '');
  const icon = device.deviceType === 'MOBILE' ? 'smartphone' : device.deviceType === 'TABLET' ? 'tablet' : 'computer';

  const save = async () => {
    const next = draft.trim();
    if (!next) return;
    await rename(device.id, next);
    setEditing(false);
  };
  const confirmRemove = () => Alert.alert(t('push.removeTitle'), t('push.removeMsg', { name: device.label ?? '' }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('push.remove'), style: 'destructive', onPress: () => { void remove(device.id); } },
  ]);

  return (
    <View style={[s.device, { borderTopColor: theme.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[s.deviceIcon, { backgroundColor: theme.primaryBg }]}><MaterialIcons name={icon} size={18} color={theme.primary} /></View>
        <View style={{ flex: 1 }}>
          {editing ? (
            <View style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border, marginTop: 0 }]}>
              <TextInput value={draft} onChangeText={v => setDraft(v.slice(0, 40))} style={{ flex: 1, fontSize: 13, color: theme.text }} autoFocus onSubmitEditing={() => void save()} />
            </View>
          ) : (
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>
              {device.label}{isThis ? ` · ${t('push.thisOne')}` : ''}
            </Text>
          )}
          <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>
            {[device.browser, device.os].filter(Boolean).join(' · ')} · {t('push.lastSeen', { when: when(device.lastSeenAt, t('push.never')) })}
          </Text>
          {device.failureCount > 0 && <Text style={{ fontSize: 11, color: theme.expense }}>{t('push.failing', { n: device.failureCount })}</Text>}
        </View>
      </View>
      <View style={[s.row, { marginTop: 8, marginLeft: 46 }]}>
        {editing ? (
          <>
            <Btn small label={t('push.save')} onPress={() => void save()} />
            <Btn small ghost label={t('common.cancel')} onPress={() => { setEditing(false); setDraft(device.label ?? ''); }} />
          </>
        ) : (
          <>
            <Btn small ghost label={t('push.sendTest')} onPress={() => void test(device.id).then(r => r && Alert.alert(t('push.sendTest'), r.sent ? t('push.testSent') : t('push.testFailed')))} />
            <Btn small ghost label={t('push.rename')} onPress={() => setEditing(true)} />
            <Btn small danger label={t('push.remove')} onPress={confirmRemove} />
          </>
        )}
      </View>
    </View>
  );
}

/** Every browser and device signed in to this account that can receive push. */
export function DeviceList() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { devices, status } = usePush();
  if (['loading', 'unsupported', 'insecure', 'server-off', 'error'].includes(status.state)) return null;
  return (
    <Panel>
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{t('push.devices')}</Text>
      {devices.length === 0
        ? <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>{t('push.noDevices')}</Text>
        : devices.map(d => <DeviceRow key={d.id} device={d} isThis={d.endpointHash === status.thisHash} />)}
    </Panel>
  );
}

/** Install the app: a one-tap button where the browser offers it, instructions on iPhone. */
export function InstallPanel() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { canInstall, isInstalled, isIos, isInAppBrowser, install } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const text = (v: string, strong = false) => <Text style={{ fontSize: 13, color: strong ? theme.text : theme.textSecondary, fontWeight: strong ? '700' : '400', lineHeight: 19 }}>{v}</Text>;

  if (isInstalled) {
    return (
      <Panel tone="ok">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialIcons name="check-circle" size={18} color={theme.income} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: theme.income }}>{t('pwa.installed')}</Text>
        </View>
        <View style={{ marginTop: 4 }}>{text(t('pwa.installedHint'))}</View>
      </Panel>
    );
  }
  if (canInstall) {
    return (
      <Panel>
        {text(t('pwa.title'), true)}
        <View style={{ marginTop: 4 }}>{text(t('pwa.installHint'))}</View>
        <View style={s.row}><Btn busy={busy} label={t('pwa.installBtn')} onPress={() => { setBusy(true); void install().finally(() => setBusy(false)); }} /></View>
      </Panel>
    );
  }
  if (isIos()) return <Panel>{text(t('pwa.iosTitle'), true)}<View style={{ marginTop: 4 }}>{text(t(isInAppBrowser() ? 'pwa.iosInApp' : 'pwa.iosText'))}</View></Panel>;
  return <Panel>{text(t('pwa.notYet'))}</Panel>;
}

const s = StyleSheet.create({
  panel: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  btn: { height: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { height: 32, paddingHorizontal: 12, borderRadius: 16 },
  input: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, marginTop: 10 },
  device: { borderTopWidth: 1, paddingTop: 12, marginTop: 12 },
  deviceIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
