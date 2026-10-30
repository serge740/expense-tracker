import React, { useCallback, useState } from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { FamilyNote, FamilyScreen, FamilySection } from '@/components/family/family-screen';
import { contributeMoney, getTransferOptions, reimburseMember, type TransferOptions, type TransferWallet } from '@/services/family-extras.service';
import { announceFamilyChange } from '@/utils/family-nudge';
import { familyErrorKey } from '@/utils/family-errors';
import { shortAmount } from '@/utils/history';

type Mode = 'contribute' | 'reimburse';

function Chips<T extends { id: string }>({ items, value, onPick, label, testID }: { items: T[]; value: string | null; onPick: (id: string) => void; label: (x: T) => string; testID: string }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map(x => {
        const on = x.id === value;
        return (
          <TouchableOpacity key={x.id} testID={`${testID}-${x.id}`} onPress={() => onPick(x.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                            style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', backgroundColor: on ? theme.primary : theme.surface, borderWidth: 1, borderColor: on ? theme.primary : theme.border }}>
            <Text style={{ color: on ? '#FFFFFF' : theme.text, fontSize: 13, fontWeight: '600' }}>{label(x)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Moving money across the line between a person's own wallets and the family's: a member puts money in, an owner or admin pays one back. */
export default function FamilyTransfersScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const scope = useScope();
  const familyId = scope.family?.id;
  const [opts, setOpts] = useState<TransferOptions | null>(null);
  const [mode, setMode] = useState<Mode>('contribute');
  const [mine, setMine] = useState<string | null>(null);
  const [fam, setFam] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!familyId) return;
    try {
      const o = await getTransferOptions(familyId);
      setOpts(o); setError(null);
      setMode(m => (m === 'reimburse' && !o.canReimburse) || (m === 'contribute' && !o.canContribute && o.canReimburse) ? (o.canContribute ? 'contribute' : 'reimburse') : m);
    } catch (e) { setError(t(familyErrorKey(e))); }
  }, [familyId, t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => { if (router.canGoBack()) router.back(); else router.navigate('/(dashboard)/family' as any); };
  const fmt = (w: TransferWallet) => `${w.name} · ${shortAmount(w.balance)} ${w.currency}`;
  const amountNum = Number(amount);
  const ready = !!fam && amountNum > 0 && (mode === 'contribute' ? !!mine : !!who);

  const submit = async () => {
    if (!familyId || !ready || busy) return;
    setBusy(true); setError(null); setDone(null);
    try {
      if (mode === 'contribute') await contributeMoney(familyId, { personalWalletId: mine!, familyWalletId: fam!, amount: amountNum, note: note || undefined });
      else await reimburseMember(familyId, { memberId: who!, familyWalletId: fam!, amount: amountNum, note: note || undefined });
      setDone(t(mode === 'contribute' ? 'xfer.doneIn' : 'xfer.doneOut'));
      setAmount(''); setNote('');
      announceFamilyChange();
      await load();
    } catch (e) { setError(t(familyErrorKey(e))); } finally { setBusy(false); }
  };

  const modes = [opts?.canContribute ? 'contribute' : null, opts?.canReimburse ? 'reimburse' : null].filter(Boolean) as Mode[];

  return (
    <FamilyScreen title={t('xfer.title')} subtitle={scope.family?.name} onBack={back}>
      {error ? <FamilyNote tone="error" testID="xfer-error" text={error} /> : null}
      {done ? <FamilyNote testID="xfer-done" text={done} /> : null}
      {opts === null && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
      {opts && modes.length === 0 ? <FamilyNote testID="xfer-none" text={t('xfer.noAccess')} /> : null}
      {opts && modes.length > 0 ? (
        <View>
          <FamilyNote text={t(mode === 'contribute' ? 'xfer.hintIn' : 'xfer.hintOut')} />
          {modes.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {modes.map(m => (
                <TouchableOpacity key={m} testID={`xfer-mode-${m}`} onPress={() => { setMode(m); setDone(null); }} accessibilityRole="button" accessibilityState={{ selected: mode === m }}
                                  style={{ flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: mode === m ? theme.primary : theme.surface }}>
                  <Text style={{ color: mode === m ? '#FFFFFF' : theme.text, fontWeight: '700' }}>{t(m === 'contribute' ? 'xfer.tabIn' : 'xfer.tabOut')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {mode === 'contribute' ? (
            <View>
              <FamilySection text={t('xfer.fromMine')} />
              {opts.personalWallets.length ? <Chips testID="xfer-mine" items={opts.personalWallets} value={mine} onPick={setMine} label={fmt} /> : <FamilyNote testID="xfer-nomine" text={t('xfer.noPersonal')} />}
            </View>
          ) : (
            <View>
              <FamilySection text={t('xfer.toMember')} />
              <Chips testID="xfer-who" items={opts.members.map(m => ({ id: m.clientId, name: m.name }))} value={who} onPick={setWho} label={x => x.name} />
            </View>
          )}

          <FamilySection text={t(mode === 'contribute' ? 'xfer.toFamily' : 'xfer.fromFamily')} />
          {opts.familyWallets.length ? <Chips testID="xfer-fam" items={opts.familyWallets} value={fam} onPick={setFam} label={fmt} /> : <FamilyNote testID="xfer-nofam" text={t('xfer.noFamilyWallet')} />}

          <FamilySection text={t('xfer.amount', { currency: opts.currency })} />
          <TextInput testID="xfer-amount" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.textMuted}
                     style={{ minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 16, color: theme.text, fontSize: 16 }} />
          <TextInput testID="xfer-note" value={note} onChangeText={setNote} maxLength={120} placeholder={t('xfer.note')} placeholderTextColor={theme.textMuted}
                     style={{ minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 16, color: theme.text, fontSize: 14, marginTop: 8 }} />
          <TouchableOpacity testID="xfer-submit" disabled={!ready || busy} onPress={submit} accessibilityRole="button"
                            style={{ minHeight: 50, borderRadius: 25, marginTop: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, opacity: ready && !busy ? 1 : 0.5 }}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{t(mode === 'contribute' ? 'xfer.sendIn' : 'xfer.sendOut')}</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
    </FamilyScreen>
  );
}
