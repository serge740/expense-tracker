import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { OptionRow, OptionSheet, Tile } from '@/components/add/option-sheet';
import { FamilyNote } from '@/components/family/family-screen';
import { createInvite, type CreatedInvite } from '@/services/family.service';
import { INVITABLE_ROLES, canInviteAs, type FamilyRole } from '@/utils/family-permissions';
import { familyErrorKey } from '@/utils/family-errors';
import { inviteShareText } from '@/utils/family-invite';

interface Props {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  familyName: string;
  /** The role of the person inviting: it decides which roles they may offer. */
  actorRole: FamilyRole;
  inviteDays: number;
  /** Called after an invite is made, so the list behind the sheet can refresh. */
  onCreated?: () => void;
}

/** Make an invite: pick what the person may do, get a code, share it. The code is shown here and in the pending list. */
export function InviteSheet({ visible, onClose, familyId, familyName, actorRole, inviteDays, onCreated }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [role, setRole] = useState<FamilyRole>('MEMBER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  // Every time the sheet opens it starts fresh.
  useEffect(() => { if (visible) { setRole('MEMBER'); setCreated(null); setError(null); setBusy(false); } }, [visible]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      setCreated(await createInvite(familyId, { role }));
      onCreated?.();
    } catch (e) {
      setError(t(familyErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!created) return;
    try { await Share.share({ message: inviteShareText({ familyName, code: created.code, link: created.link, days: inviteDays, t }) }); }
    catch { /* the person closed the share sheet */ }
  };
  const copy = async () => {
    if (!created) return;
    await Clipboard.setStringAsync(created.code);
    Alert.alert(t('family.invite.copied'), created.code);
  };

  return (
    <OptionSheet visible={visible} title={t('family.invite.title')} onClose={onClose}>
      {!created ? (
        <>
          <Text style={[s.sub, { color: theme.textSecondary }]}>{t('family.invite.sub')}</Text>
          {INVITABLE_ROLES.slice().sort((a, b) => ['MEMBER', 'VIEWER', 'ADMIN'].indexOf(a) - ['MEMBER', 'VIEWER', 'ADMIN'].indexOf(b)).map(r => {
            const allowed = canInviteAs(actorRole, r);
            return (
              <View key={r} style={{ opacity: allowed ? 1 : 0.45 }}>
                <OptionRow testID={`invite-role-${r}`} title={t(`role.${r}` as any) + (allowed ? '' : ` · ${t('family.invite.ownerOnly')}`)} sub={t(`role.${r}.desc` as any)}
                           selected={role === r} tile={<Tile icon={r === 'VIEWER' ? 'visibility' : r === 'ADMIN' ? 'admin-panel-settings' : 'person'} color={theme.primary} bg={theme.primaryBg} />}
                           onPress={() => { if (allowed) setRole(r); }} />
              </View>
            );
          })}
          {error ? <FamilyNote tone="error" testID="invite-error" text={error} /> : null}
          <TouchableOpacity testID="invite-create" onPress={make} disabled={busy} activeOpacity={0.85} style={[s.button, { backgroundColor: theme.buttonBg, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>{t('family.invite.create')}</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[s.sub, { color: theme.textSecondary }]}>{t('family.invite.expires', { days: inviteDays })}</Text>
          <View style={[s.codeBox, { backgroundColor: theme.primaryBg }]}>
            <Text testID="invite-code" style={[s.code, { color: theme.primary }]} selectable>{created.code}</Text>
          </View>
          <Text style={[s.roleLine, { color: theme.textMuted }]}>{t('family.invite.asRole', { role: t(`role.${created.role}` as any) })}</Text>
          <TouchableOpacity testID="invite-share" onPress={share} activeOpacity={0.85} style={[s.button, { backgroundColor: theme.buttonBg }]}>
            <Text style={s.buttonText}>{t('family.invite.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="invite-copy" onPress={copy} activeOpacity={0.85} style={[s.ghost, { borderColor: theme.border }]}>
            <Text style={[s.ghostText, { color: theme.text }]}>{t('family.invite.copy')}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="invite-done" onPress={onClose} style={s.done}>
            <Text style={[s.ghostText, { color: theme.textSecondary }]}>{t('family.invite.done')}</Text>
          </TouchableOpacity>
        </>
      )}
    </OptionSheet>
  );
}

const s = StyleSheet.create({
  sub: { fontSize: 12.5, marginBottom: 10, lineHeight: 18 },
  button: { marginTop: 12, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  codeBox: { borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  code: { fontSize: 32, fontWeight: '800', letterSpacing: 8 },
  roleLine: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  ghost: { marginTop: 10, borderRadius: 14, borderWidth: 1, paddingVertical: 13, alignItems: 'center' },
  ghostText: { fontSize: 14, fontWeight: '700' },
  done: { alignItems: 'center', paddingVertical: 12 },
});
