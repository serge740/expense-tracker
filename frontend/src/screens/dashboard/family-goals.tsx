import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { FamilyNote, FamilyScreen } from '@/components/family/family-screen';
import { contributeToGoal, createGoal, deleteGoal, getGoals, type Goal } from '@/services/family-extras.service';
import { familyErrorKey } from '@/utils/family-errors';
import { shortAmount } from '@/utils/history';
import { can } from '@/utils/family-permissions';

/** The family's savings goals: how far along each is, and a way to add to it. */
export default function FamilyGoalsScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const scope = useScope();
  const familyId = scope.family?.id;
  const cur = scope.family?.currency ?? '';
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!familyId) return;
    try { setGoals((await getGoals(familyId)).items); setError(null); } catch (e) { setError(t(familyErrorKey(e))); setGoals(x => x ?? []); }
  }, [familyId, t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => { if (router.canGoBack()) router.back(); else router.navigate('/(dashboard)/family' as any); };
  const manage = can(scope.role, 'goal.manage');
  const contribute = can(scope.role, 'goal.contribute');

  const create = async () => {
    if (!familyId) return;
    try { await createGoal(familyId, { name: name.trim(), target: Number(target) }); setName(''); setTarget(''); setCreating(false); await load(); } catch (e) { setError(t(familyErrorKey(e))); }
  };
  const add = async (g: Goal) => {
    if (!familyId) return;
    try { await contributeToGoal(familyId, g.id, { amount: Number(amount) }); setAmount(''); setAdding(null); await load(); } catch (e) { setError(t(familyErrorKey(e))); }
  };
  const remove = (g: Goal) => Alert.alert(t('goal.delete'), t('goal.deleteMsg', { name: g.name }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('goal.delete'), style: 'destructive', onPress: async () => { try { if (familyId) { await deleteGoal(familyId, g.id); await load(); } } catch (e) { setError(t(familyErrorKey(e))); } } },
  ]);
  const input = { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 14, color: theme.text, fontSize: 15, marginTop: 8 } as const;

  return (
    <FamilyScreen title={t('goal.title')} subtitle={scope.family?.name} onBack={back}>
      {error ? <FamilyNote tone="error" testID="goals-error" text={error} /> : null}
      <FamilyNote text={t('goal.contribNote')} />
      {goals === null ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
      {goals && goals.length === 0 ? <FamilyNote testID="goals-empty" text={t('goal.empty')} /> : null}
      {goals?.map(g => (
        <View key={g.id} testID="goal-card" style={{ borderRadius: 18, padding: 16, marginTop: 12, backgroundColor: theme.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: theme.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{g.name}</Text>
            {g.reached ? <View testID="goal-reached" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><MaterialIcons name="check-circle" size={16} color={theme.positive} /><Text style={{ color: theme.positive, fontSize: 12, fontWeight: '700' }}>{t('goal.reached')}</Text></View> : null}
            {manage ? <TouchableOpacity testID="goal-delete" onPress={() => remove(g)} accessibilityRole="button" accessibilityLabel={t('goal.delete')} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="delete-outline" size={20} color={theme.textMuted} /></TouchableOpacity> : null}
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: theme.surface2, marginTop: 10, overflow: 'hidden' }}>
            <View testID="goal-bar" style={{ width: `${g.percent}%`, height: 10, backgroundColor: g.reached ? theme.positive : theme.primary }} />
          </View>
          <Text testID="goal-saved" style={{ color: theme.textSecondary, fontSize: 13, marginTop: 6 }}>{t('goal.saved', { saved: `${shortAmount(g.saved)} ${cur}`, target: `${shortAmount(g.target)} ${cur}` })} · {g.percent}%</Text>
          {g.wallet ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>{t('goal.walletNote', { wallet: g.wallet.name })}</Text> : null}
          {contribute && adding !== g.id ? (
            <TouchableOpacity testID="goal-add" onPress={() => { setAdding(g.id); setAmount(''); }} accessibilityRole="button" style={{ marginTop: 10, minHeight: 40, borderRadius: 20, backgroundColor: theme.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>{t('goal.add')}</Text>
            </TouchableOpacity>
          ) : null}
          {adding === g.id ? (
            <View>
              <TextInput testID="goal-amount" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder={t('goal.amount')} placeholderTextColor={theme.textMuted} style={input} />
              <TouchableOpacity testID="goal-add-confirm" onPress={() => add(g)} accessibilityRole="button" style={{ marginTop: 8, minHeight: 44, borderRadius: 22, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('goal.add')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ))}
      {manage ? (creating ? (
        <View style={{ borderRadius: 18, padding: 16, marginTop: 12, backgroundColor: theme.surface }}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>{t('goal.new')}</Text>
          <TextInput testID="goal-name" value={name} onChangeText={setName} placeholder={t('goal.name')} placeholderTextColor={theme.textMuted} maxLength={60} style={input} />
          <TextInput testID="goal-target" value={target} onChangeText={setTarget} keyboardType="numeric" placeholder={t('goal.target')} placeholderTextColor={theme.textMuted} style={input} />
          <TouchableOpacity testID="goal-create" onPress={create} accessibilityRole="button" style={{ marginTop: 10, minHeight: 46, borderRadius: 23, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('goal.create')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity testID="goal-new" onPress={() => setCreating(true)} accessibilityRole="button" style={{ marginTop: 14, minHeight: 48, borderRadius: 24, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('goal.new')}</Text>
        </TouchableOpacity>
      )) : null}
    </FamilyScreen>
  );
}
