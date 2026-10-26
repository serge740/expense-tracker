/** Modal (rendered inside the phone frame) and Alert (a themed dialog), the two overlays the Expo app relies on. */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BackHandler } from './platform';
import { View, Text, TouchableOpacity } from './components';
import { useAppTheme } from '@/theme/theme-context';

// ── Modal ────────────────────────────────────────────────────────────────────────────────────────────
export interface ModalProps {
  visible: boolean;
  transparent?: boolean;
  animationType?: 'none' | 'fade' | 'slide';
  onRequestClose?: () => void;
  statusBarTranslucent?: boolean;
  children?: ReactNode;
}

const EXIT_MS = 200;

export function Modal({ visible, transparent, animationType = 'none', onRequestClose, children }: ModalProps) {
  const [mounted, setMounted] = useState(visible);
  const [leaving, setLeaving] = useState(false);
  const close = useRef(onRequestClose);
  close.current = onRequestClose;

  useEffect(() => {
    if (visible) { setMounted(true); setLeaving(false); return; }
    if (!mounted) return;
    if (animationType === 'none') { setMounted(false); return; }
    setLeaving(true);
    const t = setTimeout(() => { setMounted(false); setLeaving(false); }, EXIT_MS);
    return () => clearTimeout(t);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close.current?.(); return true; });
    return () => sub.remove();
  }, [visible]);

  const host = typeof document !== 'undefined' ? document.getElementById('phone') : null;
  if (!mounted || !host) return null;

  const animation =
    animationType === 'slide' ? `${leaving ? 'rn-slide-out' : 'rn-slide-in'} ${EXIT_MS + 60}ms ease both`
    : animationType === 'fade' ? `${leaving ? 'rn-fade-out' : 'rn-fade-in'} ${EXIT_MS}ms ease both`
    : undefined;

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: transparent ? 'transparent' : '#fff', animation }}>
      {children}
    </div>,
    host,
  );
}

// ── Alert ────────────────────────────────────────────────────────────────────────────────────────────
export interface AlertButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}
interface AlertState { id: number; title: string; message?: string; buttons: AlertButton[] }

let current: AlertState | null = null;
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], _options?: { cancelable?: boolean; onDismiss?: () => void }) {
    current = { id: ++counter, title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] };
    emit();
  },
};

/** Mount once, inside the theme. */
export function AlertHost() {
  const alert = useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => current, () => null);
  const theme = useAppTheme();
  const host = typeof document !== 'undefined' ? document.getElementById('phone') : null;

  const dismiss = (b?: AlertButton) => { current = null; emit(); b?.onPress?.(); };

  useEffect(() => {
    if (!alert) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const cancel = alert.buttons.find(b => b.style === 'cancel');
      dismiss(cancel);
      return true;
    });
    return () => sub.remove();
  }, [alert]);

  if (!alert || !host) return null;
  const stacked = alert.buttons.length > 2;

  return createPortal(
    <div
      role="alertdialog" aria-modal="true" aria-label={alert.title}
      style={{ position: 'absolute', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: 'rgba(8,20,26,0.5)', animation: 'rn-fade-in 140ms ease both' }}
    >
      <View style={{ width: '100%', maxWidth: 320, backgroundColor: theme.surface, borderRadius: 20, overflow: 'hidden', animation: 'rn-pop-in 160ms ease both' } as never}>
        <View style={{ padding: 20, paddingBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, textAlign: 'center' }}>{alert.title}</Text>
          {alert.message ? <Text style={{ fontSize: 13, lineHeight: 19, color: theme.textSecondary, textAlign: 'center', marginTop: 8 }}>{alert.message}</Text> : null}
        </View>
        <View style={{ flexDirection: stacked ? 'column' : 'row', borderTopWidth: 1, borderTopColor: theme.border }}>
          {alert.buttons.map((b, i) => (
            <TouchableOpacity
              key={i} activeOpacity={0.6} onPress={() => dismiss(b)}
              style={{ flex: stacked ? undefined : 1, paddingVertical: 14, alignItems: 'center', borderLeftWidth: !stacked && i > 0 ? 1 : 0, borderLeftColor: theme.border, borderTopWidth: stacked && i > 0 ? 1 : 0, borderTopColor: theme.border }}
            >
              <Text style={{ fontSize: 14, fontWeight: b.style === 'cancel' ? '500' : '600', color: b.style === 'destructive' ? theme.expense : theme.primary }}>
                {b.text ?? 'OK'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </div>,
    host,
  );
}
