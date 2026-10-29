// Ported from expo_app/components/family/member-sheet.tsx
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { OptionRow, OptionSheet, Tile } from '@/components/add/option-sheet';
import { FamilyNote } from '@/components/family/family-screen';
import { MemberAvatar } from '@/components/family/member-avatar';
import { removeMember, setMemberRole, type FamilyMemberRow } from '@/services/family.service';
import { GIVABLE_ROLES, can, canRemove, type FamilyRole } from '@/utils/family-permissions';
import { familyErrorKey } from '@/utils/family-errors';

interface Props {
  visible: boolean;
  member: FamilyMemberRow | null;
  familyId: string;
  /** The role of the person looking at this sheet. */
  actorRole: FamilyRole;
  onClose: () => void;
  /** Called after a change, so the list behind the sheet can refresh. */
  onChanged: () => void;
}

/** One member: who they are, what they may do, and (only if you are allowed) change their role or remove them. */
export function MemberSheet({ visible, member, familyId, actorRole, onClose, onChanged }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!member) return null;

  const isOwnerRow = member.role === 'OWNER';
  const canChangeRole = can(actorRole, 'member.role.change') && !member.isYou && !isOwnerRow;
  const canTake = !member.isYou && canRemove(actorRole, member.role);
  const reason = member.isYou ? t('family.member.self') : isOwnerRow ? t('family.member.owner') : !canChangeRole && !canTake ? t('family.member.readOnly') : null;

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await job(); onChanged(); onClose(); }
    catch (e) { setError(t(familyErrorKey(e))); }
    finally { setBusy(false); }
  };

  const changeRole = (role: FamilyRole) => { if (role !== member.role) void run(() => setMemberRole(familyId, member.clientId, role)); };
  const remove = () => Alert.alert(t('family.member.removeTitle', { name: member.name }), t('family.member.removeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('family.member.remove'), style: 'destructive', onPress: () => { void run(() => removeMember(familyId, member.clientId)); } },
  ]);

  return (
    <OptionSheet visible={visible} title={member.name} onClose={onClose}>
      <View style={s.head}>
        <MemberAvatar id={member.clientId} name={member.name} size={46} />
        <View style={{ flex: 1 }}>
          <Text style={[s.role, { color: theme.primary }]}>{t(`role.${member.role}` as any)}</Text>
          <Text style={[s.desc, { color: theme.textSecondary }]}>{t(`role.${member.role}.desc` as any)}</Text>
        </View>
      </View>

      {canChangeRole ? (
        <>
          <Text style={[s.label, { color: theme.textMuted }]}>{t('family.member.roleLabel')}</Text>
          {GIVABLE_ROLES.map(r => (
            <OptionRow key={r} testID={`member-role-${r}`} title={t(`role.${r}` as any)} sub={t(`role.${r}.desc` as any)} selected={member.role === r}
                       tile={<Tile icon={r === 'VIEWER' ? 'visibility' : r === 'ADMIN' ? 'admin-panel-settings' : 'person'} color={theme.primary} bg={theme.primaryBg} />}
                       onPress={() => changeRole(r)} />
          ))}
        </>
      ) : null}
      {reason ? <FamilyNote testID="member-reason" text={reason} /> : null}
      {error ? <FamilyNote tone="error" testID="member-error" text={error} /> : null}
      {canTake ? (
        <TouchableOpacity testID="member-remove" onPress={remove} disabled={busy} activeOpacity={0.85} style={[s.danger, { opacity: busy ? 0.6 : 1 }]}>
          {busy ? <ActivityIndicator color="#B91C1C" /> : <Text style={s.dangerText}>{t('family.member.remove')}</Text>}
        </TouchableOpacity>
      ) : null}
    </OptionSheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  role: { fontSize: 14, fontWeight: '800' },
  desc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  danger: { marginTop: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(220,38,38,0.35)', paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: '#B91C1C', fontSize: 14, fontWeight: '800' },
});
