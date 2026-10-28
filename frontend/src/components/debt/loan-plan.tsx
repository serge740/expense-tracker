// Ported from expo_app/components/debt/loan-plan.tsx
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { RepeatRow } from '@/components/schedule/schedule-fields';
import { RepeatSheet } from '@/components/repeat-sheet';
import { OWE } from '@/components/debt/tone-chip';
import { Debt, updateDebt } from '@/services/debt.service';
import { RepeatRule, blankRule, wallOfDate } from '@/utils/recurrence';
import { describeRule, TextEnv } from '@/utils/recurrence-text';
import { planAmountError, planPreview } from '@/utils/debt-plan';
import { deviceTimeZone } from '@/utils/reminders';

const errorText = (e: any, fallback: string) => e?.response?.data?.message || fallback;
const toNumber = (text: string) => parseFloat(text.replace(/,/g, ''));

interface FieldsProps {
  amount: string;
  onAmount: (v: string) => void;
  rule: RepeatRule | null;
  onRule: (r: RepeatRule) => void;
  /** The first pay date: the repeat counts from here. */
  start: Date;
  /** Only dates after this are counted in the summary (an existing loan only needs the ones still ahead). */
  from?: Date;
  /** The whole loan (the estimated payment may not be more than this) and what is still to pay (the summary counts this). */
  loanAmount: number;
  toPay: number;
  currency: string;
  /** Show the explanation under the field. */
  hint?: boolean;
}

/**
 * The two fields of an estimated payment, used when a loan is made and when one is added or changed later:
 * how much each time, and how often (the same picker as scheduled transactions), with a one-line summary.
 */
export function PlanFields({ amount, onAmount, rule, onRule, start, from, loanAmount, toPay, currency, hint = true }: FieldsProps) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const [pickRepeat, setPickRepeat] = useState(false);
  const value = toNumber(amount);
  const typed = amount.trim().length > 0;
  const bad = typed && planAmountError(amount, loanAmount) !== null;

  const preview = useMemo(
    () => (!bad && typed && rule && value > 0 ? planPreview({ loanAmount: toPay, planAmount: value, rule, start, from }) : null),
    [bad, typed, rule, value, toPay, start, from],
  );

  const change = (text: string) => {
    const clean = text.replace(/[^\d.,]/g, '');
    onAmount(clean);
    // The first time an amount is typed, start with "every month" (the usual way a loan is paid).
    if (!rule && clean.trim()) onRule(blankRule('MONTH'));
  };

  return (
    <View testID="plan-fields">
      <Text style={[s.label, { color: theme.textSecondary }]}>{t('plan.optional')}</Text>
      <View style={[s.field, { backgroundColor: theme.inputBg, borderColor: bad ? OWE : theme.border }]}>
        <MaterialIcons name="event-repeat" size={16} color={theme.textMuted} />
        <Text style={[s.cur, { color: theme.textSecondary }]}>{currency}</Text>
        <TextInput
          value={amount} onChangeText={change} placeholder={t('plan.amountPh')} placeholderTextColor={theme.textMuted}
          keyboardType="decimal-pad" style={[s.input, { color: theme.text }]} accessibilityLabel={t('plan.optional')}
        />
      </View>
      {bad && <Text style={[s.note, { color: OWE }]} testID="plan-error">{t('plan.errAmount')}</Text>}

      {typed && !bad && rule && (
        <>
          <Text style={[s.label, { color: theme.textSecondary }]}>{t('plan.repeatLabel')}</Text>
          <RepeatRow start={start} rule={rule} onPress={() => setPickRepeat(true)} />
          {preview && (
            <Text style={[s.note, { color: preview.shortfall > 0 ? '#D97706' : theme.textSecondary }]} testID="plan-summary">
              {preview.shortfall > 0
                ? t('plan.short', { amount: formatMoney(preview.shortfall, currency) })
                : preview.payments === 1
                  ? t('plan.summaryOne', { date: formatDate(preview.lastAt!, { day: 'numeric', month: 'short', year: 'numeric' }) })
                  : t('plan.summary', { n: preview.payments, date: formatDate(preview.lastAt!, { month: 'short', year: 'numeric' }) })}
            </Text>
          )}
        </>
      )}
      {hint && !typed && <Text style={[s.note, { color: theme.textMuted }]}>{t('plan.hint')}</Text>}

      <RepeatSheet visible={pickRepeat} start={start} value={rule} onClose={() => setPickRepeat(false)}
                   onConfirm={r => { if (r) onRule(r); setPickRepeat(false); }} />
    </View>
  );
}

interface CardProps {
  debt: Debt;
  hidden: boolean;
  /** Called after a change so the parent reloads the loan. */
  onChanged: () => void;
}

/**
 * On an open loan: shows its estimated payment (how much, how often, how many payments are left and when the last one is),
 * with Edit and Stop; or, when it has none, a row to set one. Hidden for money owed to me and for closed loans.
 */
export function LoanPlanCard({ debt, hidden, onChanged }: CardProps) {
  const theme = useAppTheme();
  const { t, locale, language, formatDate } = useI18n();
  const env: TextEnv = useMemo(() => ({ t, locale, language }), [t, locale, language]);
  const plan = debt.plan;
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [rule, setRule] = useState<RepeatRule | null>(null);
  const [busy, setBusy] = useState(false);

  if (debt.kind !== 'BORROWED' || debt.status !== 'OPEN' || debt.archived) return null;

  const begin = () => {
    setAmount(plan ? String(plan.amount) : '');
    setRule(plan ? plan.repeat : null);
    setEditing(true);
  };

  // The repeat counts from the plan's own first date; a new plan counts from the next pay date.
  const first = plan ? new Date(plan.startAt) : new Date(debt.nextDueAt ?? Date.now() + 86_400_000);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); setEditing(false); onChanged(); }
    catch (e) { Alert.alert(t('common.error'), errorText(e, t('add.errSave'))); }
    finally { setBusy(false); }
  };

  const save = () => {
    if (planAmountError(amount, debt.amount)) return Alert.alert(t('plan.cardTitle'), t('plan.errAmount'));
    if (!rule) return Alert.alert(t('plan.cardTitle'), t('plan.errRepeat'));
    void run(() => updateDebt(debt.id, { planAmount: toNumber(amount), planRepeat: rule, planTimezone: deviceTimeZone() }));
  };

  const stop = () => Alert.alert(t('plan.stopTitle'), t('plan.stopMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('plan.stop'), style: 'destructive', onPress: () => { void run(() => updateDebt(debt.id, { planAmount: null })); } },
  ]);

  if (editing) {
    return (
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="plan-editor">
        <Text style={[s.title, { color: theme.text }]}>{t('plan.cardTitle')}</Text>
        <PlanFields amount={amount} onAmount={setAmount} rule={rule} onRule={setRule} start={first} from={plan ? new Date() : undefined}
                    loanAmount={debt.amount} toPay={debt.remaining} currency={debt.currency} />
        <View style={s.buttons}>
          <TouchableOpacity style={[s.btn, { borderColor: theme.border, borderWidth: 1 }]} onPress={() => setEditing(false)} disabled={busy} accessibilityRole="button">
            <Text style={[s.btnText, { color: theme.textSecondary }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: OWE }, busy && { opacity: 0.6 }]} onPress={save} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[s.btnText, { color: '#FFFFFF' }]}>{t('plan.save')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!plan) {
    return (
      <TouchableOpacity onPress={begin} activeOpacity={0.8} accessibilityRole="button" testID="plan-add"
                        style={[s.addRow, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
        <MaterialIcons name="event-repeat" size={20} color={theme.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[s.addTitle, { color: theme.text }]}>{t('plan.add')}</Text>
          <Text style={[s.addSub, { color: theme.textSecondary }]}>{t('plan.addSub')}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
      </TouchableOpacity>
    );
  }

  const reaches = plan.finishesAt !== null;
  return (
    <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="plan-card">
      <View style={s.head}>
        <MaterialIcons name="event-repeat" size={18} color={theme.primary} />
        <Text style={[s.title, { color: theme.text, flex: 1 }]}>{t('plan.cardTitle')}</Text>
        <TouchableOpacity onPress={begin} hitSlop={8} accessibilityRole="button"><Text style={[s.link, { color: theme.primary }]}>{t('plan.edit')}</Text></TouchableOpacity>
        <TouchableOpacity onPress={stop} hitSlop={8} accessibilityRole="button"><Text style={[s.link, { color: OWE }]}>{t('plan.stop')}</Text></TouchableOpacity>
      </View>
      <Text style={[s.big, { color: theme.text }]}>{t('plan.each', { amount: formatMoney(plan.amount, debt.currency, { hidden }) })}</Text>
      <Text style={[s.line, { color: theme.textSecondary }]}>{describeRule(plan.repeat, wallOfDate(new Date(plan.startAt)), env)}</Text>
      <Text style={[s.line, { color: reaches ? theme.textSecondary : '#D97706' }]} testID="plan-progress">
        {plan.paymentsLeft === 1 ? t('plan.leftOne') : t('plan.left', { n: plan.paymentsLeft })}
        {' · '}
        {reaches ? t('plan.finishes', { date: formatDate(plan.finishesAt!, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('plan.notReached')}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  label:   { fontSize: 11, fontWeight: '600', marginTop: 12, marginBottom: 5, marginLeft: 2 },
  field:   { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  cur:     { fontSize: 12, fontWeight: '700' },
  input:   { flex: 1, fontSize: 14, paddingVertical: 0 },
  note:    { fontSize: 11, lineHeight: 15, marginTop: 6, marginLeft: 2 },
  card:    { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14 },
  head:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title:   { fontSize: 14, fontWeight: '700' },
  link:    { fontSize: 12, fontWeight: '700' },
  big:     { fontSize: 18, fontWeight: '700', marginTop: 8 },
  line:    { fontSize: 12, lineHeight: 17, marginTop: 3 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn:     { flex: 1, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '700' },
  addRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  addTitle:{ fontSize: 13, fontWeight: '700' },
  addSub:  { fontSize: 11, lineHeight: 15, marginTop: 1 },
});
