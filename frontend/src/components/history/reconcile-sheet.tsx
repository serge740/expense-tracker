import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { Text } from '@/components/text';
import { OptionSheet } from '@/components/add/option-sheet';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { reconcileWallet, type ReconcileResult } from '@/services/history.service';
import { shortAmount } from '@/utils/history';

/** Type what the real account shows: it either matches (and is remembered) or the difference is shown, with a way to put it right. */
export function ReconcileSheet({ visible, walletId, currency, onClose, onDone }: { visible: boolean; walletId: string; currency: string; onClose: () => void; onDone: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [res, setRes] = useState<ReconcileResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setText(''); setRes(null); setError(null); onClose(); };
  const run = async (adjust: boolean) => {
    const n = Number(text.replace(/[\s,]/g, ''));
    if (!text.trim() || !Number.isFinite(n)) { setError(t('rec.invalid')); return; }
    setBusy(true); setError(null);
    try { const r = await reconcileWallet(walletId, n, adjust); setRes(r); if (r.matches || r.adjusted) onDone(); }
    catch (e: any) { setError(e?.response?.data?.message || t('select.error')); }
    finally { setBusy(false); }
  };
  const amt = (n: number) => `${shortAmount(n)} ${currency}`;

  return (
    <OptionSheet visible={visible} title={t('rec.title')} onClose={close}>
      <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 10 }}>{t('rec.hint')}</Text>
      <TextInput testID="rec-input" value={text} onChangeText={x => { setText(x); setRes(null); }} keyboardType="numeric" placeholder={t('rec.placeholder')} placeholderTextColor={theme.textMuted}
                 style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]} />
      {error ? <Text testID="rec-error" style={{ color: theme.negative, fontSize: 13, marginTop: 8 }}>{error}</Text> : null}
      {res?.matches ? <Text testID="rec-match" style={{ color: theme.positive, fontSize: 14, fontWeight: '600', marginTop: 12 }}>{t('rec.matches')}</Text> : null}
      {res && !res.matches && !res.adjusted ? (
        <View style={{ marginTop: 12 }}>
          <Text testID="rec-differs" style={{ color: theme.text, fontSize: 14, lineHeight: 20 }}>{t('rec.differs', { expected: amt(res.expected), actual: amt(res.actual), diff: amt(res.difference) })}</Text>
          <TouchableOpacity testID="rec-fix" disabled={busy} onPress={() => run(true)} accessibilityRole="button" style={[s.btn, { backgroundColor: theme.primary, marginTop: 10 }]}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('rec.fix')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {res?.adjusted ? <Text testID="rec-fixed" style={{ color: theme.positive, fontSize: 14, fontWeight: '600', marginTop: 12 }}>{t('rec.fixed')}</Text> : null}
      {!res ? (
        <TouchableOpacity testID="rec-check" disabled={busy} onPress={() => run(false)} accessibilityRole="button" style={[s.btn, { backgroundColor: theme.primary, marginTop: 12 }]}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('rec.check')}</Text>
        </TouchableOpacity>
      ) : null}
    </OptionSheet>
  );
}

const s = StyleSheet.create({
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  btn: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
