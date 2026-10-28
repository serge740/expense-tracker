// Ported from expo_app/components/debt/pay-dates.tsx
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { DateTimeSheet } from '@/components/datetime-sheet';
import { OWE, toneColor, ToneChip } from '@/components/debt/tone-chip';
import { addInstallment, Debt, DebtInstallment, moveInstallment, skipInstallment } from '@/services/debt.service';
import { canChange, hasHistory, isHistory, VIEW_STYLE, visibleInstallments } from '@/utils/debt';

const errorText = (e: any, fallback: string) => e?.response?.data?.message || fallback;

/** A pay date goes at least a few minutes ahead; earlier ones are meaningless for reminders. */
const soonest = () => new Date(Date.now() + 5 * 60_000);

interface Props {
  debt: Debt;
  hidden: boolean;
  /** Called after any change so the parent reloads the debt. */
  onChanged: () => void;
}

/** The pay-date timeline of one debt or credit: add, move and skip, with history kept. */
export function PayDates({ debt, hidden, onChanged }: Props) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const [showHistory, setShowHistory] = useState(false);
  const [sheet, setSheet] = useState<{ mode: 'add' } | { mode: 'move'; row: DebtInstallment } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const open = debt.status === 'OPEN' && !debt.archived;
  const rows = useMemo(() => visibleInstallments(debt.installments, showHistory), [debt.installments, showHistory]);
  const when = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  const skip = (row: DebtInstallment) => Alert.alert(t('debt2.skipTitle'), t('debt2.skipMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('debt2.skip'), onPress: async () => {
        setBusy(row.id);
        try { await skipInstallment(debt.id, row.id); onChanged(); }
        catch (e) { Alert.alert(t('common.error'), errorText(e, t('add.errSave'))); }
        finally { setBusy(null); }
      },
    },
  ]);

  return (
    <View>
      <View style={s.head}>
        <Text style={[s.title, { color: theme.text }]}>{t('debt2.payDates')}</Text>
        {hasHistory(debt.installments) && (
          <TouchableOpacity onPress={() => setShowHistory(v => !v)} hitSlop={8}>
            <Text style={[s.link, { color: theme.primary }]}>{t(showHistory ? 'debt2.hideHistory' : 'debt2.showHistory')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {rows.length === 0 ? (
        <Text style={[s.empty, { color: theme.textMuted }]}>{t(open ? 'debt2.noDates' : 'debt2.nothingLeft')}</Text>
      ) : (
        <View style={s.timeline}>
          <View style={[s.rail, { backgroundColor: theme.border }]} />
          {rows.map(row => {
            const style = VIEW_STYLE[row.view];
            const color = toneColor(style.tone, theme.primary, theme.textMuted);
            const old = isHistory(row);
            return (
              <View key={row.id} style={s.item} testID={`pay-date-${row.view}`}>
                <View style={[s.dot, { borderColor: color, backgroundColor: row.view === 'PAID' || row.view === 'OVERDUE' ? color : theme.surface, borderStyle: old ? 'dashed' : 'solid' }]} />
                <View style={[s.card, {
                  backgroundColor: theme.surface, opacity: old ? 0.65 : 1,
                  borderColor: row.view === 'OVERDUE' ? `${OWE}66` : theme.border,
                }]}>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.when, { color: theme.text, textDecorationLine: row.view === 'MOVED' ? 'line-through' : 'none' }]}>{when(row.dueAt)}</Text>
                      <Text style={[s.sub, { color: theme.textMuted }]}>
                        {row.plannedAmount ? t('debt2.planned', { amount: formatMoney(row.plannedAmount, debt.currency, { hidden }) }) : t('debt2.noPlanned')}
                        {row.covered > 0 && row.view !== 'PAID' ? ` · ${t('debt2.covered', { amount: formatMoney(row.covered, debt.currency, { hidden }) })}` : ''}
                        {row.movedFromId ? ` · ${t('debt2.movedFrom')}` : ''}
                        {row.fromPlan && row.view !== 'MOVED' && row.view !== 'SKIPPED' ? ` · ${t('plan.tag')}` : ''}
                      </Text>
                    </View>
                    <ToneChip label={t(style.label)} tone={style.tone} />
                  </View>
                  {open && canChange(row) && (
                    <View style={s.actions}>
                      {busy === row.id ? <ActivityIndicator color={theme.primary} /> : (
                        <>
                          <TouchableOpacity style={[s.btn, { backgroundColor: theme.primaryBg }]} onPress={() => setSheet({ mode: 'move', row })} accessibilityRole="button">
                            <Text style={[s.btnText, { color: theme.primary }]}>{t('debt2.move')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.btn, { backgroundColor: theme.primaryBg }]} onPress={() => skip(row)} accessibilityRole="button">
                            <Text style={[s.btnText, { color: theme.primary }]}>{t('debt2.skip')}</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {open && (
        <TouchableOpacity style={[s.add, { borderColor: theme.border }]} onPress={() => setSheet({ mode: 'add' })} activeOpacity={0.8}>
          <MaterialIcons name="add" size={16} color={theme.primary} />
          <Text style={[s.addText, { color: theme.primary }]}>{t('debt2.addDate')}</Text>
        </TouchableOpacity>
      )}

      <PayDateSheet
        debt={debt}
        hidden={hidden}
        request={sheet}
        onClose={() => setSheet(null)}
        onDone={() => { setSheet(null); onChanged(); }}
      />
    </View>
  );
}

function PayDateSheet({ debt, hidden, request, onClose, onDone }: {
  debt: Debt; hidden: boolean; request: { mode: 'add' } | { mode: 'move'; row: DebtInstallment } | null;
  onClose: () => void; onDone: () => void;
}) {
  return (
    <Modal visible={!!request} transparent animationType="slide" onRequestClose={onClose}>
      {request && <PayDateBody key={request.mode === 'move' ? request.row.id : 'add'} debt={debt} hidden={hidden} request={request} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function PayDateBody({ debt, hidden, request, onClose, onDone }: {
  debt: Debt; hidden: boolean; request: { mode: 'add' } | { mode: 'move'; row: DebtInstallment }; onClose: () => void; onDone: () => void;
}) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const moving = request.mode === 'move';
  const [due, setDue] = useState<Date>(() => {
    if (moving) return new Date(Math.max(new Date(request.row.dueAt).getTime(), soonest().getTime()));
    const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d;
  });
  const [amount, setAmount] = useState('');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const planned = amount.trim() ? parseFloat(amount.replace(/,/g, '')) : null;
    if (planned !== null && (!Number.isFinite(planned) || planned <= 0)) return Alert.alert(t('debt2.plannedOpt'), t('add.errAmount'));
    if (planned !== null && planned > debt.remaining) return Alert.alert(t('debt2.plannedOpt'), t('debt2.errAmountLeft'));
    setSaving(true);
    try {
      if (moving) await moveInstallment(debt.id, request.row.id, due.toISOString());
      else await addInstallment(debt.id, { dueAt: due.toISOString(), plannedAmount: planned });
      onDone();
    } catch (e) {
      Alert.alert(t('common.error'), errorText(e, t('add.errSave')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: theme.surface }]}>
        <View style={[s.grabber, { backgroundColor: theme.border }]} />
        <Text style={[s.sheetTitle, { color: theme.text }]}>{t(moving ? 'debt2.moveDateTitle' : 'debt2.addDate')}</Text>

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('add.dueDate')}</Text>
        <TouchableOpacity style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]} onPress={() => setPicking(true)} activeOpacity={0.8}>
          <MaterialIcons name="event" size={16} color={theme.textMuted} />
          <Text style={[s.fieldText, { color: theme.text }]}>
            {formatDate(due, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </Text>
        </TouchableOpacity>

        {!moving && (
          <>
            <Text style={[s.label, { color: theme.textSecondary }]}>{t('debt2.plannedOpt')}</Text>
            <View style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={[s.cur, { color: theme.textMuted }]}>{debt.currency}</Text>
              <TextInput value={amount} onChangeText={v => setAmount(v.replace(/[^\d.,]/g, ''))} placeholder={formatMoney(debt.remaining, debt.currency, { hidden })}
                         placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[s.fieldText, { color: theme.text }]} />
            </View>
          </>
        )}
        <Text style={[s.hint, { color: theme.textMuted }]}>{t(moving ? 'debt2.moveHint' : 'debt2.addHint')}</Text>

        <TouchableOpacity style={[s.save, { backgroundColor: theme.buttonBg }]} onPress={save} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.saveText}>{t('common.save')}</Text>}
        </TouchableOpacity>
      </View>

      <DateTimeSheet visible={picking} title={t(moving ? 'debt2.moveDateTitle' : 'debt2.addDate')} mode="datetime" value={due}
                     minDate={soonest()} minuteStep={5} hour12 onClose={() => setPicking(false)}
                     onConfirm={d => { setDue(d); setPicking(false); }} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  head:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '700' },
  link:  { fontSize: 12, fontWeight: '700' },
  empty: { fontSize: 12, paddingVertical: 8 },

  timeline: { paddingLeft: 22 },
  rail:     { position: 'absolute', left: 7, top: 8, bottom: 8, width: 2 },
  item:     { marginBottom: 10 },
  dot:      { position: 'absolute', left: -22, top: 14, width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  card:     { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  cardTop:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  when:     { fontSize: 13, fontWeight: '700' },
  sub:      { fontSize: 11, marginTop: 1 },
  actions:  { flexDirection: 'row', gap: 6, marginTop: 8 },
  btn:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11 },
  btnText:  { fontSize: 11.5, fontWeight: '700' },

  add:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', marginTop: 4 },
  addText: { fontSize: 12, fontWeight: '700' },

  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:      { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 26 },
  grabber:    { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 10 },
  sheetTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  label:      { fontSize: 11, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  field:      { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  fieldText:  { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', paddingVertical: 0 },
  cur:        { fontSize: 12, fontWeight: '700' },
  hint:       { fontSize: 11, marginTop: 8, lineHeight: 15 },
  save:       { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  saveText:   { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
