import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';

/** The bar over the tab bar while rows are being chosen: how many, Select all, and what can be done to them. */
export function SelectBar({ count, total, busy, onAll, onCancel, onDelete, onCategory, onWallet }: {
  count: number; total: number; busy: boolean; onAll: () => void; onCancel: () => void; onDelete: () => void; onCategory: () => void; onWallet: () => void;
}) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const act = (id: string, icon: string, label: string, onPress: () => void, color = theme.text) => (
    <TouchableOpacity key={id} testID={id} disabled={busy || count === 0} onPress={onPress} accessibilityRole="button" style={[s.act, (busy || count === 0) && { opacity: 0.4 }]}>
      <MaterialIcons name={icon} size={22} color={color} />
      <Text style={{ color, fontSize: 11.5, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View testID="select-bar" style={[s.bar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={s.top}>
        <TouchableOpacity testID="select-cancel" onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={s.x}><MaterialIcons name="close" size={22} color={theme.text} /></TouchableOpacity>
        <Text testID="select-count" style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '600' }}>{t('select.count', { n: count })}</Text>
        <TouchableOpacity testID="select-all" onPress={onAll} accessibilityRole="button" style={s.all}>
          <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>{count === total && total > 0 ? t('filter.reset') : t('select.all')}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.acts}>
        {act('select-category', 'category', t('select.category'), onCategory)}
        {act('select-wallet', 'account-balance-wallet', t('select.wallet'), onWallet)}
        {act('select-delete', 'delete', t('select.delete'), onDelete, theme.negative)}
      </View>
    </View>
  );
}

/** A short message at the bottom with one action (Undo), gone after a few seconds. */
export function Snackbar({ message, action, onAction, onDone, ms = 8000 }: { message: string; action?: string; onAction?: () => void; onDone: () => void; ms?: number }) {
  const theme = useAppTheme();
  useEffect(() => { const id = setTimeout(onDone, ms); return () => clearTimeout(id); }, [message]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View testID="snackbar" accessibilityRole="alert" style={[s.snack, { backgroundColor: theme.text }]}>
      <Text style={{ flex: 1, color: theme.background, fontSize: 14 }}>{message}</Text>
      {action ? (
        <TouchableOpacity testID="snackbar-action" onPress={() => { onAction?.(); onDone(); }} accessibilityRole="button" style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
          <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '700' }}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { position: 'absolute', left: 12, right: 12, bottom: 12, borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8, zIndex: 20, boxShadow: '0 6px 24px rgba(0,0,0,0.18)' } as never,
  top: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  x: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  all: { paddingHorizontal: 10, height: 40, justifyContent: 'center' },
  acts: { flexDirection: 'row', justifyContent: 'space-around' },
  act: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 8 },
  snack: { position: 'absolute', left: 12, right: 12, bottom: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, zIndex: 30 },
});

// ── Swipe, quick peek and the result of a bulk change ──
import { OptionRow, OptionSheet, Tile } from '@/components/add/option-sheet';

/** Wraps a row: a swipe right chooses it, a swipe left opens the quick look (touch screens; mouse and keyboard use the row's own button). */
export function SwipeRow({ children, onRight, onLeft, enabled = true }: { children: React.ReactNode; onRight: () => void; onLeft: () => void; enabled?: boolean }) {
  const start = React.useRef<{ x: number; y: number } | null>(null);
  if (!enabled) return <>{children}</>;
  return (
    <div
      data-testid="swipe-row"
      onTouchStart={e => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={e => {
        const s0 = start.current; start.current = null;
        if (!s0) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s0.x, dy = t.clientY - s0.y;
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
        if (dx > 0) onRight(); else onLeft();
      }}
    >
      {children}
    </div>
  );
}

export interface PeekAction { id: string; icon: string; label: string; danger?: boolean; onPress: () => void }
/** Everything that can be done to one row, with the reason when something cannot. */
export function PeekSheet({ visible, title, note, actions, onClose }: { visible: boolean; title: string; note?: string | null; actions: PeekAction[]; onClose: () => void }) {
  const theme = useAppTheme();
  return (
    <OptionSheet visible={visible} title={title} onClose={onClose}>
      {note ? <Text testID="peek-note" style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 8 }}>{note}</Text> : null}
      {actions.map(a => (
        <OptionRow key={a.id} testID={`peek-${a.id}`} title={a.label} danger={a.danger} tile={<Tile icon={a.icon} color={a.danger ? '#DC2626' : theme.primary} bg={a.danger ? '#FEE2E2' : theme.primaryBg} />} onPress={a.onPress} />
      ))}
    </OptionSheet>
  );
}

/** What a bulk change did: how many went through, and each row that did not with its reason. */
export function ResultSheet({ visible, done, failed, onClose }: { visible: boolean; done: number; failed: Array<{ title: string; reason: string }>; onClose: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <OptionSheet visible={visible} title={t('select.failedTitle', { n: failed.length })} onClose={onClose}>
      {done > 0 ? <Text style={{ color: theme.positive, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>{t('select.changed', { n: done })}</Text> : null}
      <View testID="result-list" style={{ gap: 8 }}>
        {failed.map((f, i) => (
          <View key={i} style={{ backgroundColor: theme.surface2, borderRadius: 12, padding: 10 }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{f.title}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12.5 }}>{f.reason}</Text>
          </View>
        ))}
      </View>
    </OptionSheet>
  );
}
