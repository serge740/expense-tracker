import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { FamilyNote, FamilyScreen, FamilySection } from '@/components/family/family-screen';
import { joinFamily, previewInvite, type InviteInput, type InvitePreview } from '@/services/family.service';
import { getToken } from '@/services/client-auth.service';
import { familyErrorCode, familyErrorKey } from '@/utils/family-errors';
import { parseInvite } from '@/utils/family-invite';
import { clearPendingInvite, loadPendingInvite, savePendingInvite } from '@/utils/pending-invite';

/** An answer that means this invite can never work, so a kept copy of it should go. */
const DEAD = new Set(['INVITE_EXPIRED', 'INVITE_INVALID', 'INVITE_NOT_FOUND', 'FAMILY_GONE', 'INVITE_FOR_SOMEONE_ELSE']);

export default function FamilyJoinScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const scope = useScope();
  const params = useLocalSearchParams<{ token?: string; code?: string }>();

  const [text, setText] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [input, setInput] = useState<InviteInput | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(dashboard)/profile'));

  const lookup = async (what: InviteInput) => {
    setBusy(true);
    setErrorKey(null);
    setErrorCode(null);
    try {
      const p = await previewInvite(what);
      setInput(what);
      setPreview(p);
    } catch (e) {
      const code = familyErrorCode(e);
      setErrorKey(familyErrorKey(e));
      setErrorCode(code);
      if (code && DEAD.has(code)) await clearPendingInvite();
    } finally {
      setBusy(false);
    }
  };

  // Opened from a link, or after signing in with an invite waiting: start from it. Signed out: keep it and go sign in first.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const fromAddress = parseInvite(params.token ?? params.code ?? '');
      if (!(await getToken())) {
        if (fromAddress) await savePendingInvite(fromAddress);
        router.replace('/(auth)/login');
        return;
      }
      const start = fromAddress ?? (await loadPendingInvite());
      if (!start) return;
      setText(start.code ?? '');
      await lookup(start);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onContinue = async () => {
    const parsed = parseInvite(text);
    if (!parsed) { setErrorKey('family.join.bad'); setErrorCode(null); return; }
    await lookup(parsed);
  };

  const onJoin = async () => {
    if (!input || !preview) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await joinFamily(input);
      await clearPendingInvite();
      await scope.refresh();
      await scope.switchTo('family');
      Alert.alert(t('family.join.welcomeTitle'), t('family.join.welcome', { family: preview.family.name }));
      router.replace('/(dashboard)');
    } catch (e) {
      const code = familyErrorCode(e);
      setErrorKey(familyErrorKey(e));
      setErrorCode(code);
      setPreview(null);
      if (code && DEAD.has(code)) await clearPendingInvite();
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setPreview(null); setInput(null); setErrorKey(null); setErrorCode(null); setText(''); };

  return (
    <FamilyScreen title={t('family.join.title')} onBack={back}>
      {!preview ? (
        <>
          <FamilyNote text={t('family.join.intro')} />
          <FamilySection text={t('family.join.label').toUpperCase()} />
          <TextInput testID="family-join-input" value={text} onChangeText={v => { setText(v); setErrorKey(null); }} placeholder={t('family.join.placeholder')}
                     placeholderTextColor={theme.textMuted} autoCapitalize="characters" autoCorrect={false} accessibilityLabel={t('family.join.label')}
                     style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]} />
          {errorKey ? <FamilyNote tone="error" testID="family-join-error" text={t(errorKey as any)} /> : null}
          {errorCode === 'ALREADY_IN_FAMILY' ? (
            <TouchableOpacity testID="family-join-open" onPress={() => router.replace('/(dashboard)/family' as any)} style={s.link}>
              <Text style={[s.linkText, { color: theme.primary }]}>{t('family.join.openFamily')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity testID="family-join-continue" onPress={onContinue} disabled={busy || !text.trim()} activeOpacity={0.85}
                            style={[s.button, { backgroundColor: theme.buttonBg, opacity: busy || !text.trim() ? 0.5 : 1 }]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>{t('family.join.continue')}</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View testID="family-join-preview" style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[s.familyName, { color: theme.text }]}>{preview.family.name}</Text>
            <Text style={[s.cardLine, { color: theme.textSecondary }]}>{t('family.join.invitedBy', { name: preview.invitedBy })}</Text>
            <View style={[s.roleChip, { backgroundColor: theme.primaryBg }]}>
              <Text style={[s.roleChipText, { color: theme.primary }]}>{t('family.join.asRole', { role: t(`role.${preview.role}` as any) })}</Text>
            </View>
            <Text style={[s.cardLine, { color: theme.textMuted }]}>{t(`role.${preview.role}.desc` as any)}</Text>
          </View>
          <FamilyNote tone="warn" text={t('family.join.privacy')} />
          {errorKey ? <FamilyNote tone="error" testID="family-join-error" text={t(errorKey as any)} /> : null}
          <TouchableOpacity testID="family-join-confirm" onPress={onJoin} disabled={busy} activeOpacity={0.85}
                            style={[s.button, { backgroundColor: theme.buttonBg, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>{t('family.join.button', { family: preview.family.name })}</Text>}
          </TouchableOpacity>
          <TouchableOpacity testID="family-join-cancel" onPress={reset} style={s.link}>
            <Text style={[s.linkText, { color: theme.textSecondary }]}>{t('family.join.cancel')}</Text>
          </TouchableOpacity>
        </>
      )}
    </FamilyScreen>
  );
}

const s = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 18, fontWeight: '700', letterSpacing: 3, textAlign: 'center' },
  button: { marginTop: 18, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkText: { fontSize: 13.5, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, padding: 18, marginTop: 10, gap: 8 },
  familyName: { fontSize: 20, fontWeight: '800' },
  cardLine: { fontSize: 13, lineHeight: 19 },
  roleChip: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  roleChipText: { fontSize: 12, fontWeight: '800' },
});
