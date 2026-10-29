// Ported from expo_app/app/(dashboard)/family.tsx
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { CURRENCIES } from '@/context/currency-context';
import { useScope } from '@/context/scope-context';
import { FamilyNote, FamilyScreen, FamilySection } from '@/components/family/family-screen';
import { MemberAvatar } from '@/components/family/member-avatar';
import { MemberSheet } from '@/components/family/member-sheet';
import { InviteSheet } from '@/components/family/invite-sheet';
import { OptionRow, OptionSheet, Tile } from '@/components/add/option-sheet';
import {
  deleteFamily, getActivity, getInvites, getMembers, removeMember, revokeAllInvites, revokeInvite, transferOwnership, updateFamily,
  type ActivityRow, type FamilyMemberRow, type InviteRow,
} from '@/services/family.service';
import { can } from '@/utils/family-permissions';
import { familyErrorKey } from '@/utils/family-errors';
import { activityText, daysLeft } from '@/utils/family-format';

export default function FamilyHubScreen() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const scope = useScope();
  const { family, role, isFamily, limits } = scope;

  const [members, setMembers] = useState<FamilyMemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<FamilyMemberRow | null>(null);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const familyId = family?.id ?? null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(dashboard)/profile'));

  const load = useCallback(async () => {
    if (!familyId) { setLoading(false); return; }
    try {
      setError(null);
      const [m, a] = await Promise.all([getMembers(familyId), getActivity(familyId, { limit: 15 })]);
      setMembers(m);
      setActivity(a);
      setInvites(can(role, 'invite.list') ? await getInvites(familyId) : []);
    } catch (e) {
      setError(t(familyErrorKey(e)));
    } finally {
      setLoading(false);
    }
  }, [familyId, role, t]);

  useFocusEffect(useCallback(() => { void scope.refresh().catch(() => {}); void load(); }, [load])); // eslint-disable-line react-hooks/exhaustive-deps

  const me = members.find(m => m.isYou);
  const leaveFamilyAndGoHome = async () => {
    // Go back to Personal first, so the app does not announce "you were removed" for something the person chose.
    await scope.switchTo('personal');
    await scope.refresh().catch(() => {});
    router.replace('/(dashboard)');
  };

  const open = async () => { await scope.switchTo('family'); router.replace('/(dashboard)'); };

  const leave = () => {
    if (!family || !me) return;
    Alert.alert(t('family.hub.leaveConfirmTitle', { family: family.name }), t('family.hub.leaveConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('family.hub.leave'), style: 'destructive', onPress: async () => {
        try { await removeMember(family.id, me.clientId); await leaveFamilyAndGoHome(); }
        catch (e) { setError(t(familyErrorKey(e))); }
      } },
    ]);
  };

  const revoke = async (inv: InviteRow) => {
    if (!familyId) return;
    try { await revokeInvite(familyId, inv.id); await load(); } catch (e) { setError(t(familyErrorKey(e))); }
  };
  const revokeAll = () => {
    if (!familyId) return;
    Alert.alert(t('family.hub.revokeAllTitle'), t('family.hub.revokeAllBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('family.hub.revokeAll'), style: 'destructive', onPress: async () => { try { await revokeAllInvites(familyId); await load(); } catch (e) { setError(t(familyErrorKey(e))); } } },
    ]);
  };

  // ── No family yet ──────────────────────────────────────────────────────────
  if (!family || !role) {
    return (
      <FamilyScreen title={t('family.hub.title')} onBack={back}>
        <FamilyNote testID="family-empty" text={t('family.hub.none')} />
        <TouchableOpacity testID="family-hub-create" onPress={() => router.push('/(dashboard)/family-create' as any)} activeOpacity={0.85} style={[s.button, { backgroundColor: theme.buttonBg }]}>
          <Text style={s.buttonText}>{t('family.sheet.create')}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="family-hub-join" onPress={() => router.push('/(dashboard)/family-join' as any)} activeOpacity={0.85} style={[s.ghost, { borderColor: theme.border }]}>
          <Text style={[s.ghostText, { color: theme.text }]}>{t('family.sheet.join')}</Text>
        </TouchableOpacity>
      </FamilyScreen>
    );
  }

  const isOwner = role === 'OWNER';
  const roleLine = t('family.hub.youAre', { role: t(`role.${role}` as any) });
  const subtitle = `${t('family.hub.limit', { n: members.length || scope.memberCount, max: limits?.maxMembers ?? 12 })} · ${family.currency}`;

  return (
    <FamilyScreen title={family.name} subtitle={subtitle} onBack={back}>
      <Text testID="family-role-line" style={[s.roleLine, { color: theme.primary }]}>{roleLine}</Text>
      {!isFamily ? (
        <TouchableOpacity testID="family-open" onPress={open} activeOpacity={0.85} style={[s.button, { backgroundColor: theme.buttonBg }]}>
          <Text style={s.buttonText}>{t('family.hub.open')}</Text>
        </TouchableOpacity>
      ) : null}
      {error ? <FamilyNote tone="error" testID="family-hub-error" text={error} /> : null}

      <FamilySection text={t('family.hub.members')} />
      {loading ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} /> : members.map(m => (
        <TouchableOpacity key={m.clientId} testID={`member-${m.clientId}`} activeOpacity={0.8} onPress={() => setPicked(m)}
                          style={[s.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MemberAvatar id={m.clientId} name={m.name} />
          <View style={{ flex: 1 }}>
            <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>{m.name}{m.isYou ? ` ${t('family.hub.you')}` : ''}</Text>
            <Text style={[s.rowSub, { color: theme.textMuted }]} numberOfLines={1}>{t('family.hub.joined', { date: formatDate(m.joinedAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: theme.primaryBg }]}><Text style={[s.badgeText, { color: theme.primary }]}>{t(`role.${m.role}` as any)}</Text></View>
        </TouchableOpacity>
      ))}

      {can(role, 'invite.create') ? (
        <TouchableOpacity testID="family-invite" onPress={() => setInviting(true)} activeOpacity={0.85} style={[s.button, { backgroundColor: theme.buttonBg }]}>
          <Text style={s.buttonText}>{t('family.hub.invite')}</Text>
        </TouchableOpacity>
      ) : <FamilyNote testID="family-invite-note" text={t('family.hub.inviteOnly')} />}

      {can(role, 'invite.list') && invites.length > 0 ? (
        <>
          <FamilySection text={t('family.hub.pending')} />
          {invites.map(inv => (
            <View key={inv.id} testID={`invite-${inv.id}`} style={[s.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.code, { color: theme.text }]}>{inv.code}</Text>
                <Text style={[s.rowSub, { color: theme.textMuted }]}>{t('family.hub.pendingItem', { role: t(`role.${inv.role}` as any), days: Math.max(daysLeft(inv.expiresAt), 0) })}</Text>
              </View>
              <TouchableOpacity testID={`revoke-${inv.id}`} onPress={() => revoke(inv)} hitSlop={8}><Text style={s.revoke}>{t('family.hub.revoke')}</Text></TouchableOpacity>
            </View>
          ))}
          {invites.length > 1 ? (
            <TouchableOpacity testID="family-revoke-all" onPress={revokeAll} style={s.link}><Text style={[s.linkText, { color: theme.textSecondary }]}>{t('family.hub.revokeAll')}</Text></TouchableOpacity>
          ) : null}
        </>
      ) : null}

      <FamilySection text={t('family.hub.activity')} />
      {activity.length === 0 && !loading ? <Text style={[s.rowSub, { color: theme.textMuted }]}>{t('family.hub.noActivity')}</Text> : null}
      {activity.map(a => (
        <View key={a.id} style={[s.act, { borderColor: theme.border }]}>
          <MemberAvatar id={a.actor.clientId} name={a.actor.name} size={28} />
          <View style={{ flex: 1 }}>
            <Text style={[s.actText, { color: theme.text }]}>{activityText(a, t)}</Text>
            <Text style={[s.rowSub, { color: theme.textMuted }]}>{formatDate(a.createdAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
          </View>
        </View>
      ))}

      <FamilySection text={t('family.hub.membership')} />
      {isOwner ? (
        <>
          <TouchableOpacity testID="family-edit" onPress={() => setEditing(true)} activeOpacity={0.85} style={[s.ghost, { borderColor: theme.border }]}><Text style={[s.ghostText, { color: theme.text }]}>{t('family.hub.edit')}</Text></TouchableOpacity>
          <TouchableOpacity testID="family-transfer" onPress={() => setTransferring(true)} activeOpacity={0.85} style={[s.ghost, { borderColor: theme.border }]}><Text style={[s.ghostText, { color: theme.text }]}>{t('family.hub.transfer')}</Text></TouchableOpacity>
          <TouchableOpacity testID="family-delete" onPress={() => setDeleting(true)} activeOpacity={0.85} style={s.danger}><Text style={s.dangerText}>{t('family.hub.delete')}</Text></TouchableOpacity>
          <FamilyNote text={t('family.hub.ownerCannotLeave')} />
        </>
      ) : (
        <TouchableOpacity testID="family-leave" onPress={leave} activeOpacity={0.85} style={s.danger}><Text style={s.dangerText}>{t('family.hub.leave')}</Text></TouchableOpacity>
      )}

      {/* The family has its own tab bar, so language, theme and sign out stay reachable from here. */}
      {isFamily ? (
        <TouchableOpacity testID="family-app-settings" onPress={() => router.push('/(dashboard)/profile' as any)} activeOpacity={0.85} style={[s.ghost, { borderColor: theme.border }]}>
          <Text style={[s.ghostText, { color: theme.text }]}>{t('family.hub.appSettings')}</Text>
        </TouchableOpacity>
      ) : null}

      <MemberSheet visible={!!picked} member={picked} familyId={family.id} actorRole={role} onClose={() => setPicked(null)} onChanged={() => { void scope.refresh().catch(() => {}); void load(); }} />
      <InviteSheet visible={inviting} onClose={() => setInviting(false)} familyId={family.id} familyName={family.name} actorRole={role} inviteDays={limits?.inviteDays ?? 7} onCreated={() => { void load(); }} />
      <EditSheet visible={editing} onClose={() => setEditing(false)} name={family.name} currency={family.currency} familyId={family.id}
                 onSaved={() => { setEditing(false); void scope.refresh().catch(() => {}); void load(); }} />
      <TransferSheet visible={transferring} onClose={() => setTransferring(false)} members={members.filter(m => !m.isYou)} familyId={family.id}
                     onDone={() => { setTransferring(false); void scope.refresh().catch(() => {}); void load(); }} />
      <DeleteSheet visible={deleting} onClose={() => setDeleting(false)} name={family.name} familyId={family.id} onDeleted={() => { setDeleting(false); void leaveFamilyAndGoHome(); }} />
    </FamilyScreen>
  );
}

/** Rename the family or change its reporting currency (stored amounts are never converted). */
function EditSheet({ visible, onClose, name, currency, familyId, onSaved }: { visible: boolean; onClose: () => void; name: string; currency: string; familyId: string; onSaved: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [n, setN] = useState(name);
  const [cur, setCur] = useState(currency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  React.useEffect(() => { if (visible) { setN(name); setCur(currency); setError(null); } }, [visible, name, currency]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await updateFamily(familyId, { name: n.trim(), currency: cur });
      if (res.currencyChanged) Alert.alert(t('family.hub.currencyChangedTitle'), t('family.hub.currencyChanged'));
      onSaved();
    } catch (e) { setError(t(familyErrorKey(e))); } finally { setBusy(false); }
  };
  return (
    <OptionSheet visible={visible} title={t('family.hub.edit')} onClose={onClose}>
      <TextInput testID="edit-name" value={n} onChangeText={setN} maxLength={60} placeholder={t('family.create.namePh')} placeholderTextColor={theme.textMuted}
                 style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
        {CURRENCIES.map(c => (
          <TouchableOpacity key={c.code} testID={`edit-currency-${c.code}`} onPress={() => setCur(c.code)} style={[s.chip, { backgroundColor: c.code === cur ? theme.primary : theme.surface, borderColor: c.code === cur ? theme.primary : theme.border }]}>
            <Text style={[s.chipText, { color: c.code === cur ? '#FFFFFF' : theme.text }]}>{c.flag} {c.code}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {error ? <FamilyNote tone="error" testID="edit-error" text={error} /> : null}
      <TouchableOpacity testID="edit-save" onPress={save} disabled={busy || !n.trim()} style={[s.button, { backgroundColor: theme.buttonBg, opacity: busy || !n.trim() ? 0.5 : 1 }]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>{t('family.hub.save')}</Text>}
      </TouchableOpacity>
    </OptionSheet>
  );
}

/** Hand the family to another member. You become an admin. */
function TransferSheet({ visible, onClose, members, familyId, onDone }: { visible: boolean; onClose: () => void; members: FamilyMemberRow[]; familyId: string; onDone: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const choose = (m: FamilyMemberRow) => Alert.alert(t('family.hub.transferConfirmTitle', { name: m.name }), t('family.hub.transferConfirmBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('family.hub.transferConfirm'), style: 'destructive', onPress: async () => {
      try { await transferOwnership(familyId, m.clientId); onDone(); } catch (e) { setError(t(familyErrorKey(e))); }
    } },
  ]);
  return (
    <OptionSheet visible={visible} title={t('family.hub.transferTitle')} onClose={onClose}>
      <Text style={[s.rowSub, { color: theme.textSecondary, marginBottom: 8 }]}>{t('family.hub.transferBody')}</Text>
      {members.length === 0 ? <FamilyNote text={t('family.hub.transferNone')} /> : null}
      {members.map(m => (
        <OptionRow key={m.clientId} testID={`transfer-${m.clientId}`} title={m.name} sub={t(`role.${m.role}` as any)} tile={<Tile icon="swap-horiz" color={theme.primary} bg={theme.primaryBg} />} onPress={() => choose(m)} />
      ))}
      {error ? <FamilyNote tone="error" testID="transfer-error" text={error} /> : null}
    </OptionSheet>
  );
}

/** Delete: the family name must be typed. Everyone goes back to their personal space. */
function DeleteSheet({ visible, onClose, name, familyId, onDeleted }: { visible: boolean; onClose: () => void; name: string; familyId: string; onDeleted: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  React.useEffect(() => { if (visible) { setTyped(''); setError(null); } }, [visible]);
  const ok = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const go = async () => {
    setBusy(true); setError(null);
    try { await deleteFamily(familyId, typed.trim()); onDeleted(); } catch (e) { setError(t(familyErrorKey(e))); } finally { setBusy(false); }
  };
  return (
    <OptionSheet visible={visible} title={t('family.hub.deleteTitle', { family: name })} onClose={onClose}>
      <Text style={[s.rowSub, { color: theme.textSecondary, marginBottom: 10 }]}>{t('family.hub.deleteBody')}</Text>
      <TextInput testID="delete-name" value={typed} onChangeText={setTyped} placeholder={t('family.hub.deletePh')} placeholderTextColor={theme.textMuted}
                 style={[s.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]} />
      {error ? <FamilyNote tone="error" testID="delete-error" text={error} /> : null}
      <TouchableOpacity testID="delete-confirm" onPress={go} disabled={!ok || busy} style={[s.dangerFill, { opacity: !ok || busy ? 0.4 : 1 }]}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>{t('family.hub.delete')}</Text>}
      </TouchableOpacity>
    </OptionSheet>
  );
}

const s = StyleSheet.create({
  roleLine: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 11.5, marginTop: 1 },
  badge: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  code: { fontSize: 16, fontWeight: '800', letterSpacing: 3 },
  revoke: { color: '#B91C1C', fontSize: 12.5, fontWeight: '800' },
  act: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  actText: { fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  button: { marginTop: 12, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  ghost: { marginTop: 10, borderRadius: 14, borderWidth: 1, paddingVertical: 13, alignItems: 'center' },
  ghostText: { fontSize: 14, fontWeight: '700' },
  danger: { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(220,38,38,0.35)', paddingVertical: 13, alignItems: 'center' },
  dangerText: { color: '#B91C1C', fontSize: 14, fontWeight: '800' },
  dangerFill: { marginTop: 14, borderRadius: 14, backgroundColor: '#B91C1C', paddingVertical: 14, alignItems: 'center' },
  link: { alignItems: 'center', paddingVertical: 10 },
  linkText: { fontSize: 13, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '700' },
});
