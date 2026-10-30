import React, { useCallback, useState } from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { FamilyNote, FamilyScreen } from '@/components/family/family-screen';
import { approveRequest, cancelRequest, getApprovals, getApprovalSettings, rejectRequest, setApprovalThreshold, type ApprovalRow } from '@/services/family-extras.service';
import { familyErrorKey } from '@/utils/family-errors';
import { shortAmount } from '@/utils/history';

/** Big expenses that wait for an owner or admin, and (for the owner) the amount above which that happens. */
export default function FamilyApprovalsScreen() {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const scope = useScope();
  const familyId = scope.family?.id;
  const cur = scope.family?.currency ?? '';
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canDecide, setCanDecide] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!familyId) return;
    try {
      const [s, r] = await Promise.all([getApprovalSettings(familyId), getApprovals(familyId)]);
      setThreshold(s.threshold); setCanManage(s.canManage); setCanDecide(r.canDecide); setRows(r.items); setError(null);
    } catch (e) { setError(t(familyErrorKey(e))); setRows(x => x ?? []); }
  }, [familyId, t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => { if (router.canGoBack()) router.back(); else router.navigate('/(dashboard)/family' as any); };
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setError(t(familyErrorKey(e))); } };
  const pending = rows?.filter(r => r.status === 'PENDING') ?? [];
  const decided = rows?.filter(r => r.status !== 'PENDING') ?? [];
  const money = (n: number) => `${shortAmount(n)} ${cur}`;
  const btn = (bg: string) => ({ minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: bg, justifyContent: 'center' as const });

  const card = (r: ApprovalRow) => (
    <View key={r.id} testID="approval-row" style={{ borderRadius: 16, padding: 14, marginTop: 10, backgroundColor: theme.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{r.title}</Text>
        <Text style={{ color: theme.negative, fontSize: 15, fontWeight: '700' }}>−{money(r.amount)}</Text>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginTop: 2 }}>{t('appr.by', { name: r.requestedBy.name, date: formatDate(r.createdAt, { day: 'numeric', month: 'short' }) })}</Text>
      {r.status !== 'PENDING' ? <Text testID="approval-status" style={{ color: r.status === 'APPROVED' ? theme.positive : theme.negative, fontSize: 12.5, fontWeight: '600', marginTop: 4 }}>{t(`appr.status.${r.status}` as any)}{r.reason ? ` · ${r.reason}` : ''}</Text> : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {canDecide ? <TouchableOpacity testID="approval-approve" onPress={() => run(() => approveRequest(familyId!, r.id))} accessibilityRole="button" style={btn(theme.primary)}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('appr.approve')}</Text></TouchableOpacity> : null}
          {canDecide ? <TouchableOpacity testID="approval-reject" onPress={() => run(() => rejectRequest(familyId!, r.id))} accessibilityRole="button" style={btn(theme.primaryBg)}><Text style={{ color: theme.primary, fontWeight: '700' }}>{t('appr.reject')}</Text></TouchableOpacity> : null}
          {!canDecide ? <TouchableOpacity testID="approval-cancel" onPress={() => run(() => cancelRequest(familyId!, r.id))} accessibilityRole="button" style={btn(theme.primaryBg)}><Text style={{ color: theme.primary, fontWeight: '700' }}>{t('appr.cancel')}</Text></TouchableOpacity> : null}
        </View>
      )}
    </View>
  );

  return (
    <FamilyScreen title={t('appr.title')} subtitle={scope.family?.name} onBack={back}>
      {error ? <FamilyNote tone="error" testID="appr-error" text={error} /> : null}
      <FamilyNote text={t('appr.hint')} />
      <View style={{ borderRadius: 16, padding: 14, marginTop: 10, backgroundColor: theme.surface }}>
        <Text testID="appr-state" style={{ color: theme.text, fontWeight: '700' }}>{threshold === null ? t('appr.off') : t('appr.on', { amount: money(threshold) })}</Text>
        {canManage ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <TextInput testID="appr-threshold" value={draft} onChangeText={setDraft} keyboardType="numeric" placeholder={t('appr.threshold')} placeholderTextColor={theme.textMuted}
                       style={{ flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 14, color: theme.text, fontSize: 14 }} />
            <TouchableOpacity testID="appr-save" disabled={!draft} onPress={() => run(async () => { await setApprovalThreshold(familyId!, Number(draft)); setDraft(''); })} accessibilityRole="button" style={{ ...btn(theme.primary), minHeight: 44, opacity: draft ? 1 : 0.5 }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('appr.save')}</Text></TouchableOpacity>
            {threshold !== null ? <TouchableOpacity testID="appr-off" onPress={() => run(() => setApprovalThreshold(familyId!, null))} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}><Text style={{ color: theme.textMuted, fontWeight: '600' }}>{t('appr.turnOff')}</Text></TouchableOpacity> : null}
          </View>
        ) : null}
      </View>
      {rows === null ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 18, letterSpacing: 0.5 }}>{t('appr.pending').toUpperCase()}</Text>
      {rows && pending.length === 0 ? <Text testID="appr-empty" style={{ color: theme.textMuted, marginTop: 8 }}>{t('appr.empty')}</Text> : null}
      {pending.map(card)}
      {decided.length ? <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 18, letterSpacing: 0.5 }}>{t('appr.decided').toUpperCase()}</Text> : null}
      {decided.map(card)}
    </FamilyScreen>
  );
}
