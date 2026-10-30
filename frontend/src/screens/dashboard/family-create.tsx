// Ported from expo_app/app/(dashboard)/family-create.tsx
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { router } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { CURRENCIES, useCurrency } from '@/context/currency-context';
import { useScope } from '@/context/scope-context';
import { FamilyNote, FamilyScreen, FamilySection } from '@/components/family/family-screen';
import { createFamily } from '@/services/family.service';
import { createWallet } from '@/services/wallet.service';
import { familyErrorCode, familyErrorKey } from '@/utils/family-errors';
import { deviceTimeZone } from '@/utils/reminders';

export default function FamilyCreateScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { currency: main } = useCurrency();
  const scope = useScope();

  const [name, setName] = useState('');
  const [cur, setCur] = useState(main.code);
  const [walletName, setWalletName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(dashboard)/profile'));

  const submit = async () => {
    const familyName = name.trim();
    if (!familyName) { setError(t('family.create.nameRequired')); return; }
    setBusy(true);
    setError(null);
    try {
      const created = await createFamily({ name: familyName, currency: cur, timezone: deviceTimeZone() });
      await scope.refresh();
      await scope.switchTo('family', created.family.id);
      const first = walletName.trim();
      // The family exists whatever happens next; a wallet that fails to save can be added later from Wallets.
      if (first) { try { await createWallet({ name: first, bank: 'Cash', walletType: 'CASH', currency: cur, balance: 0 }); } catch { /* added later */ } }
      router.replace('/(dashboard)');
    } catch (e) {
      if (familyErrorCode(e) === 'NOT_VERIFIED') {
        Alert.alert(t('family.create.verifyTitle'), t('family.create.verifyBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('family.create.verifyAction'), onPress: () => router.push('/(dashboard)/(settings)/verify') },
        ]);
      } else {
        setError(t(familyErrorKey(e)));
      }
    } finally {
      setBusy(false);
    }
  };

  const input = [s.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }];

  return (
    <FamilyScreen title={t('family.create.title')} onBack={back}>
      <FamilyNote text={t('family.create.intro')} />

      <FamilySection text={t('family.create.nameLabel').toUpperCase()} />
      <TextInput testID="family-name" value={name} onChangeText={v => { setName(v); setError(null); }} placeholder={t('family.create.namePh')}
                 placeholderTextColor={theme.textMuted} maxLength={60} style={input} accessibilityLabel={t('family.create.nameLabel')} />

      <FamilySection text={t('family.create.currencyLabel').toUpperCase()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {CURRENCIES.map(c => {
          const on = c.code === cur;
          return (
            <TouchableOpacity key={c.code} testID={`family-currency-${c.code}`} onPress={() => setCur(c.code)} activeOpacity={0.8}
                              style={[s.chip, { backgroundColor: on ? theme.primary : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
              <Text style={[s.chipText, { color: on ? '#FFFFFF' : theme.text }]}>{c.flag} {c.code}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={[s.hint, { color: theme.textMuted }]}>{t('family.create.currencyHint')}</Text>

      <FamilySection text={t('family.create.walletLabel').toUpperCase()} />
      <TextInput testID="family-wallet" value={walletName} onChangeText={setWalletName} placeholder={t('family.create.walletPh')}
                 placeholderTextColor={theme.textMuted} maxLength={40} style={input} accessibilityLabel={t('family.create.walletLabel')} />
      <Text style={[s.hint, { color: theme.textMuted }]}>{t('family.create.walletHint')}</Text>

      <FamilyNote text={t('family.create.owner')} />
      {error ? <FamilyNote tone="error" testID="family-error" text={error} /> : null}

      <TouchableOpacity testID="family-create-submit" onPress={submit} disabled={busy} activeOpacity={0.85}
                        style={[s.button, { backgroundColor: theme.buttonBg, opacity: busy ? 0.6 : 1 }]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>{t('family.create.button')}</Text>}
      </TouchableOpacity>
    </FamilyScreen>
  );
}

const s = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 11.5, marginTop: 6, lineHeight: 16 },
  button: { marginTop: 18, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
