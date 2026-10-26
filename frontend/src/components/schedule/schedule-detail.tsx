// Ported from expo_app/components/schedule/schedule-detail.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { formatMoney } from '@/context/currency-context';
import { RepeatSheet } from '@/components/repeat-sheet';
import { ModeChoice, RepeatRow } from '@/components/schedule/schedule-fields';
import { ToneChip } from '@/components/debt/tone-chip';
import {
  confirmOccurrence, endScheduled, getScheduled, pauseScheduled, resumeScheduled, ScheduledDetail, ScheduleMode,
  updateScheduled,
} from '@/services/scheduled.service';
import type { RepeatRule } from '@/utils/recurrence';
import { describeRule, TextEnv, wallInZone } from '@/utils/recurrence-text';
import { sameRule } from '@/utils/schedule-form';

const errorText = (e: any, fallback: string) => e?.response?.data?.message || fallback;

/** One schedule: what it is, when it happens next, what it did, and how to change or stop it. */
export function ScheduleDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  return (
    <Modal visible={!!id} transparent animationType="slide" onRequestClose={onClose}>
      {id && <DetailBody key={id} id={id} onClose={onClose} onChanged={onChanged} />}
    </Modal>
  );
}

function DetailBody({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const theme = useAppTheme();
  const { t, locale, language, formatDate } = useI18n();
  const env: TextEnv = useMemo(() => ({ t, locale, language }), [t, locale, language]);
  const [d, setD] = useState<ScheduledDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<ScheduleMode>('REMIND_CONFIRM');
  const [rule, setRule] = useState<RepeatRule | null>(null);
  const [pickRepeat, setPickRepeat] = useState(false);

  const load = useCallback(async () => {
    try { setD(await getScheduled(id)); setFailed(false); } catch { setFailed(true); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    if (!d) return;
    setTitle(d.title); setAmount(String(d.amount)); setMode(d.mode); setRule(d.repeat); setEditing(true);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); onChanged(); }
    catch (e) { Alert.alert(t('common.error'), errorText(e, t('add.errSave'))); }
    finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!d) return;
    const value = parseFloat(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return Alert.alert(t('add.amount'), t('add.errAmount'));
    if (!title.trim()) return Alert.alert(t('sched.titleLabel'), t('add.errSave'));
    // Only what changed is sent, so editing the amount never rebuilds the dates.
    const patch = {
      ...(title.trim() !== d.title ? { title: title.trim() } : {}),
      ...(value !== d.amount ? { amount: value } : {}),
      ...(mode !== d.mode ? { mode } : {}),
      ...(!sameRule(rule, d.repeat) ? { repeat: rule } : {}),
    };
    if (!Object.keys(patch).length) return setEditing(false);
    await run(() => updateScheduled(id, patch));
    setEditing(false);
  };

  const confirmEnd = () => Alert.alert(t('sched.endTitle'), t('sched.endMsg'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('sched.end'), style: 'destructive', onPress: () => { void run(() => endScheduled(id)); } },
  ]);

  const when = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const income = d?.type === 'INCOME';
  const color = income ? '#16A34A' : theme.text;
  const startWall = d ? wallInZone(new Date(d.startAt), d.timezone) : null;

  return (
    <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel={t('rem.close')} />
      <View style={[s.sheet, { backgroundColor: theme.surface }]}>
        <View style={[s.grabber, { backgroundColor: theme.border }]} />
        {!d ? (
          failed ? <Text style={[s.muted, { color: theme.textMuted }]}>{t('add.errSave')}</Text> : <ActivityIndicator color={theme.primary} style={{ marginVertical: 30 }} />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={[s.title, { color: theme.text }]} numberOfLines={2}>{d.title}</Text>
                <Text style={[s.amount, { color }]}>{income ? '+' : ''}{formatMoney(d.amount, d.currency || 'RWF')}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('rem.close')}>
                <MaterialIcons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={s.chips}>
              {d.status !== 'ACTIVE' && <ToneChip label={t(d.status === 'PAUSED' ? 'sched.paused' : 'sched.ended')} tone={d.status === 'PAUSED' ? 'amber' : 'muted'} />}
              {d.mode === 'AUTO_POST' && <ToneChip label={t('sched.modeAuto')} tone="blue" />}
            </View>

            {editing ? (
              <>
                <Text style={[s.label, { color: theme.textSecondary }]}>{t('sched.titleLabel')}</Text>
                <View style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                  <TextInput value={title} onChangeText={setTitle} style={[s.input, { color: theme.text }]} accessibilityLabel={t('sched.titleLabel')} />
                </View>
                <Text style={[s.label, { color: theme.textSecondary }]}>{t('add.amount')}</Text>
                <View style={[s.field, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                  <TextInput value={amount} onChangeText={v => setAmount(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad"
                             style={[s.input, { color: theme.text }]} accessibilityLabel={t('add.amount')} />
                </View>
                <Text style={[s.label, { color: theme.textSecondary }]}>{t('sched.repeat')}</Text>
                <RepeatRow start={new Date(d.startAt)} rule={rule} onPress={() => setPickRepeat(true)} />
                <Text style={[s.label, { color: theme.textSecondary }]}>{t('sched.whenDue')}</Text>
                <ModeChoice value={mode} onChange={setMode} />
                <View style={s.pair}>
                  <TouchableOpacity style={[s.btn, { backgroundColor: theme.primaryBg }]} onPress={() => setEditing(false)}><Text style={[s.btnText, { color: theme.primary }]}>{t('common.cancel')}</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.btn, { backgroundColor: theme.buttonBg }]} onPress={saveEdit} disabled={busy}>
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[s.btnText, { color: '#FFFFFF' }]}>{t('sched.saveChanges')}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={[s.sec, { color: theme.textMuted }]}>{t('sched.rule').toUpperCase()}</Text>
                <Text style={[s.rule, { color: theme.text }]} testID="schedule-rule">{describeRule(d.repeat, startWall!, env)}</Text>
                {d.status === 'PAUSED' && <Text style={[s.muted, { color: theme.textMuted, marginTop: 6 }]}>{t('sched.pauseNote')}</Text>}

                {d.upcoming.length > 0 && (
                  <>
                    <Text style={[s.sec, { color: theme.textMuted }]}>{t('sched.nextDates')}</Text>
                    {d.upcoming.map((iso, i) => (
                      <View key={iso} style={s.line} testID="schedule-upcoming">
                        <Text style={[s.idx, { backgroundColor: theme.primaryBg, color: theme.primary }]}>{i + 1}</Text>
                        <Text style={[s.lineText, { color: theme.text }]}>{when(iso)}</Text>
                      </View>
                    ))}
                  </>
                )}

                <Text style={[s.sec, { color: theme.textMuted }]}>{t('sched.history')}</Text>
                {d.history.length === 0 ? (
                  <Text style={[s.muted, { color: theme.textMuted }]}>{t('sched.noHistory')}</Text>
                ) : d.history.map(h => (
                  <View key={h.id} style={[s.hist, { borderBottomColor: theme.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.lineText, { color: theme.text }]}>{when(h.dueAt)}</Text>
                      {h.status === 'FAILED' && !!h.failReason && <Text style={[s.muted, { color: '#DC2626' }]}>{t('sched.reason', { reason: h.failReason })}</Text>}
                    </View>
                    {h.status === 'FAILED' && d.status !== 'ENDED' && (
                      <TouchableOpacity onPress={() => run(() => confirmOccurrence(h.id))} disabled={busy} style={[s.retry, { backgroundColor: theme.primaryBg }]} accessibilityRole="button">
                        <Text style={[s.retryText, { color: theme.primary }]}>{t('sched.retry')}</Text>
                      </TouchableOpacity>
                    )}
                    <ToneChip label={t(h.status === 'POSTED' ? 'sched.hPosted' : h.status === 'SKIPPED' ? 'sched.hSkipped' : 'sched.hFailed')}
                              tone={h.status === 'POSTED' ? 'green' : h.status === 'SKIPPED' ? 'muted' : 'red'} />
                  </View>
                ))}

                {d.status !== 'ENDED' && (
                  <View style={s.actions}>
                    <TouchableOpacity style={[s.btn, { backgroundColor: theme.primaryBg }]} onPress={startEdit} accessibilityRole="button"><Text style={[s.btnText, { color: theme.primary }]}>{t('sched.edit')}</Text></TouchableOpacity>
                    <TouchableOpacity style={[s.btn, { backgroundColor: theme.primaryBg }]} disabled={busy} accessibilityRole="button"
                                      onPress={() => run(() => (d.status === 'PAUSED' ? resumeScheduled(id) : pauseScheduled(id)))}>
                      <Text style={[s.btnText, { color: theme.primary }]}>{t(d.status === 'PAUSED' ? 'sched.resume' : 'sched.pause')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn, { backgroundColor: 'rgba(220,38,38,0.1)' }]} onPress={confirmEnd} disabled={busy} accessibilityRole="button">
                      <Text style={[s.btnText, { color: '#DC2626' }]}>{t('sched.end')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

      {d && <RepeatSheet visible={pickRepeat} start={new Date(d.startAt)} value={rule} onClose={() => setPickRepeat(false)} onConfirm={r => { setRule(r); setPickRepeat(false); }} />}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:    { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24, maxHeight: '90%' },
  grabber:  { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 10 },
  head:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title:    { fontSize: 18, fontWeight: '800' },
  amount:   { fontSize: 22, fontWeight: '800', marginTop: 2 },
  chips:    { flexDirection: 'row', gap: 6, marginTop: 6 },
  sec:      { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, marginTop: 18, marginBottom: 6 },
  rule:     { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  muted:    { fontSize: 11.5, lineHeight: 16 },
  line:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  idx:      { width: 20, height: 20, borderRadius: 10, textAlign: 'center', lineHeight: 20, fontSize: 10.5, fontWeight: '800', overflow: 'hidden' },
  lineText: { fontSize: 13, fontWeight: '600' },
  hist:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  retry:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  retryText:{ fontSize: 11, fontWeight: '700' },
  actions:  { flexDirection: 'row', gap: 8, marginTop: 18 },
  pair:     { flexDirection: 'row', gap: 8, marginTop: 16 },
  btn:      { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText:  { fontSize: 13, fontWeight: '700' },
  label:    { fontSize: 11, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  field:    { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  input:    { flex: 1, fontSize: 14, fontFamily: 'Poppins_400Regular', paddingVertical: 0 },
});
