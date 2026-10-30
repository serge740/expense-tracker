import React, { useCallback, useState } from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { FamilyNote, FamilyScreen } from '@/components/family/family-screen';
import { clearAllowance, getAllowances, setAllowance, type AllowanceRow } from '@/services/family-extras.service';
import { familyErrorKey } from '@/utils/family-errors';
import { shortAmount } from '@/utils/history';

/** Monthly allowances: owners and admins set one per member; every member sees their own and how much is left. */
export default function FamilyAllowancesScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const scope = useScope();
  const familyId = scope.family?.id;
  const cur = scope.family?.currency ?? '';
  const [rows, setRows] = useState<AllowanceRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!familyId) return;
    try { const r = await getAllowances(familyId); setRows(r.items); setCanManage(r.canManage); setError(null); } catch (e) { setError(t(familyErrorKey(e))); setRows(x => x ?? []); }
  }, [familyId, t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => { if (router.canGoBack()) router.back(); else router.navigate('/(dashboard)/family' as any); };
  const save = async (r: AllowanceRow) => {
    if (!familyId) return;
    try { await setAllowance(familyId, r.clientId, Number(draft[r.clientId])); setDraft(d => ({ ...d, [r.clientId]: '' })); await load(); } catch (e) { setError(t(familyErrorKey(e))); }
  };
  const clear = async (r: AllowanceRow) => { if (familyId) try { await clearAllowance(familyId, r.clientId); await load(); } catch (e) { setError(t(familyErrorKey(e))); } };

  return (
    <FamilyScreen title={t('allow.title')} subtitle={scope.family?.name} onBack={back}>
      {error ? <FamilyNote tone="error" testID="allow-error" text={error} /> : null}
      <FamilyNote text={t('allow.hint')} />
      {rows === null ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
      {rows?.map(r => (
        <View key={r.clientId} testID="allow-row" style={{ borderRadius: 18, padding: 14, marginTop: 12, backgroundColor: theme.surface }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{r.isYou ? t('allow.yourOwn') : r.name}</Text>
          {r.limit === null ? <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>{t('allow.none')}</Text> : (
            <View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.surface2, marginTop: 8, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, r.percent)}%`, height: 8, backgroundColor: r.over ? theme.negative : theme.primary }} />
              </View>
              <Text testID="allow-spent" style={{ color: r.over ? theme.negative : theme.textSecondary, fontSize: 13, marginTop: 6 }}>{t('allow.spent', { spent: `${shortAmount(r.spent)} ${cur}`, limit: `${shortAmount(r.limit)} ${cur}` })}</Text>
            </View>
          )}
          {canManage ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <TextInput testID="allow-limit" value={draft[r.clientId] ?? ''} onChangeText={v => setDraft(d => ({ ...d, [r.clientId]: v }))} keyboardType="numeric" placeholder={t('allow.setLimit')} placeholderTextColor={theme.textMuted}
                         style={{ flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 14, color: theme.text, fontSize: 14 }} />
              <TouchableOpacity testID="allow-save" disabled={!draft[r.clientId]} onPress={() => save(r)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: theme.primary, justifyContent: 'center', opacity: draft[r.clientId] ? 1 : 0.5 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('allow.save')}</Text>
              </TouchableOpacity>
              {r.limit !== null ? <TouchableOpacity testID="allow-remove" onPress={() => clear(r)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}><Text style={{ color: theme.textMuted, fontWeight: '600' }}>{t('allow.remove')}</Text></TouchableOpacity> : null}
            </View>
          ) : null}
        </View>
      ))}
    </FamilyScreen>
  );
}
