import { useEffect, useRef, useState } from 'react';
import { Text, View } from '@/rn';
import { useI18n } from '@/context/language-context';
import { useAppTheme } from '@/theme/theme-context';
import type { StringKey } from '@/i18n/strings';

const WORDS: Record<string, StringKey> = { offline: 'notice.offline', busy: 'notice.busy', server: 'notice.server' };

/** A small banner that explains, in plain words, why something did not load (offline, too busy, our side). Hides itself. */
export function NetworkNotice() {
  const { t } = useI18n();
  const theme = useAppTheme();
  const [kind, setKind] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const on = (ev: Event) => {
      const k = String((ev as CustomEvent).detail ?? '');
      if (!WORDS[k]) return;
      setKind(k);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setKind(null), 6000);
    };
    window.addEventListener('ax-notice', on);
    return () => { window.removeEventListener('ax-notice', on); if (timer.current) clearTimeout(timer.current); };
  }, []);

  if (!kind) return null;
  return (
    <View testID="network-notice" style={{ position: 'absolute', top: 10, left: 12, right: 12, zIndex: 9999, alignItems: 'center' }} pointerEvents="none">
      <View style={{ backgroundColor: theme.text, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, maxWidth: 480 }}>
        <Text style={{ color: theme.background, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{t(WORDS[kind])}</Text>
      </View>
    </View>
  );
}
