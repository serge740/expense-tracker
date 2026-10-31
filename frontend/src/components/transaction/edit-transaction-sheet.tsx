// Edit a transaction from its detail page, in a bottom sheet filled with what it is now.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { SheetFrame } from '@/components/history/sheet-frame';
import { CategorySheet } from '@/components/category-sheet';
import { DatePickerModal } from '@/components/date-picker-modal';
import { PayFromField } from '@/components/add/pay-from';
import { useMySubCategories } from '@/hooks/use-my-subcategories';
import { CategorySlug, categoryLabelKey, categoryOf } from '@/constants/categories';
import { getWallets, type Wallet } from '@/services/wallet.service';
import { updateTransaction } from '@/services/transaction.service';
import { ZERO_DECIMAL, shortAmount } from '@/utils/history';

/** The transaction as the server gives it for editing (GET /transactions/:id). */
export interface EditableTx {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  subCategory: string | null;
  title: string;
  description: string | null;
  /** Signed: income positive, spending negative. */
  amount: number;
  date: string;
  walletId: string | null;
  tags: string[];
  note: string | null;
  updatedAt: string;
  debtRole: string | null;
  fundedByDebtId: string | null;
  wallet: { name: string; currency: string; archived: boolean } | null;
  edit: { allowed: boolean; typeLocked: boolean; categoryLocked: boolean; walletLocked: boolean };
}

/** What each wallet gains or loses if this edit is saved (income adds, spending takes away). */
export function walletEffects(
  before: { type: string; amount: number; walletId: string | null },
  after: { type: string; amount: number; walletId: string | null },
): Array<{ walletId: string; change: number }> {
  const eff = (type: string, amount: number) => (type === 'INCOME' ? amount : -amount);
  const net = new Map<string, number>();
  const add = (id: string | null, d: number) => { if (id) net.set(id, Math.round(((net.get(id) ?? 0) + d) * 100) / 100); };
  add(before.walletId, -eff(before.type, before.amount));
  add(after.walletId, eff(after.type, after.amount));
  return [...net.entries()].filter(([, c]) => c !== 0).map(([walletId, change]) => ({ walletId, change }));
}

const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

export function EditTransactionSheet({ tx, visible, onClose, onSaved, onReload }: {
  tx: EditableTx | null; visible: boolean; onClose: () => void; onSaved: (updated: Record<string, any>) => void; onReload: () => void;
}) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const { mine, reload: reloadMine, forget } = useMySubCategories();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [kind, setKind] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategorySlug>('other');
  const [subCategory, setSubCategory] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [walletId, setWalletId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const [pickDate, setPickDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from what the transaction is now, every time the sheet opens.
  useEffect(() => {
    if (!visible || !tx) return;
    setKind(tx.type); setAmount(String(Math.abs(tx.amount))); setCategory(tx.category as CategorySlug); setSubCategory(tx.subCategory);
    setTitle(tx.title); setWalletId(tx.walletId); setDate(new Date(tx.date));
    setTags((tx.tags ?? []).join(', ')); setNote(tx.note ?? ''); setError(null);
    reloadMine();
    getWallets().then(setWallets).catch(() => setWallets([]));
  }, [visible, tx?.id, tx?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const walletById = useMemo(() => new Map(wallets.map(w => [w.id, w])), [wallets]);
  const value = parseFloat(amount.replace(/,/g, ''));
  const amountOk = Number.isFinite(value) && value > 0;

  const before = tx ? { type: tx.type, amount: Math.abs(tx.amount), walletId: tx.walletId } : null;
  const after = { type: kind, amount: amountOk ? Math.round(value * 100) / 100 : before?.amount ?? 0, walletId };
  const tagList = tags.split(/[,\n]/).map(x => x.trim().replace(/^#+/, '')).filter(Boolean);
  const origTags = (tx?.tags ?? []).join('|').toLowerCase();

  const changed = !!tx && (
    kind !== tx.type || (amountOk && Math.round(value * 100) / 100 !== Math.abs(tx.amount)) || category !== tx.category || (subCategory ?? null) !== (tx.subCategory ?? null)
    || title.trim() !== tx.title || walletId !== tx.walletId || !sameDay(date, new Date(tx.date)) || tagList.join('|').toLowerCase() !== origTags || (note.trim() || null) !== (tx.note ?? null)
  );

  const effects = before && amountOk ? walletEffects(before, after) : [];
  const nameOf = (id: string) => walletById.get(id)?.name ?? (id === tx?.walletId ? tx?.wallet?.name : null) ?? '—';
  const curOf = (id: string) => walletById.get(id)?.currency ?? (id === tx?.walletId ? tx?.wallet?.currency : null) ?? '';
  const oldCur = tx?.walletId ? curOf(tx.walletId) : '';
  const newCur = walletId ? curOf(walletId) : '';
  const currencyChanged = !!tx && !!tx.walletId && !!walletId && tx.walletId !== walletId && !!oldCur && !!newCur && oldCur !== newCur;
  const cur = newCur || oldCur;

  const switchKind = (k: 'INCOME' | 'EXPENSE') => {
    if (k === kind || tx?.edit.typeLocked) return;
    setKind(k);
    // A category that does not exist for the other kind falls back to a sensible one.
    if (!categoryOf(category).for.includes(k) && !tx?.edit.categoryLocked) { setCategory(k === 'INCOME' ? 'salary' : 'food'); setSubCategory(null); }
  };

  const save = async () => {
    if (!tx || !changed || busy) return;
    if (!amountOk) return setError(t('add.errAmount'));
    if (!title.trim()) return setError(t('edt.errTitle'));
    if (date.getTime() > Date.now() + 5 * 60_000) return setError(t('edt.errFuture'));
    // Only what changed is sent, together with the version that was on screen.
    const body: Record<string, unknown> = { expectedUpdatedAt: tx.updatedAt };
    if (kind !== tx.type) body.type = kind;
    if (Math.round(value * 100) / 100 !== Math.abs(tx.amount)) body.amount = Math.round(value * 100) / 100;
    if (category !== tx.category) body.category = category;
    if ((subCategory ?? null) !== (tx.subCategory ?? null) || category !== tx.category) body.subCategory = subCategory ?? '';
    if (title.trim() !== tx.title) { body.title = title.trim(); body.description = title.trim(); }
    if (walletId !== tx.walletId) body.walletId = walletId;
    if (!sameDay(date, new Date(tx.date))) body.date = date.toISOString();
    if (tagList.join('|').toLowerCase() !== origTags) body.tags = tagList;
    if ((note.trim() || null) !== (tx.note ?? null)) body.note = note.trim();
    setBusy(true); setError(null);
    try {
      const updated = await updateTransaction(tx.id, body as any);
      onSaved({ ...updated, tags: tagList, note: note.trim() || null });
      onClose();
    } catch (e: any) {
      if (e?.response?.status === 409) {
        Alert.alert(t('edt.conflictTitle'), t('edt.conflict'), [{ text: t('edt.reload'), onPress: () => { onClose(); onReload(); } }]);
      } else setError(e?.response?.data?.message || t('add.errSave'));
    } finally { setBusy(false); }
  };

  const money = (n: number, c: string) => `${n > 0 ? '+' : '−'}${shortAmount(Math.abs(n), ZERO_DECIMAL.has(c))} ${c}`.trim();
  const box = { borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 14, color: theme.text, fontSize: 15 } as const;
  const label = (text: string) => <Text style={{ color: theme.textSecondary, fontSize: 12.5, fontWeight: '600', marginTop: 16, marginBottom: 6 }}>{text}</Text>;
  const catDef = categoryOf(category);
  const accent = kind === 'INCOME' ? '#16A34A' : theme.primary;

  return (
    <SheetFrame visible={visible && !!tx} title={t('edt.title')} onClose={onClose} height="92%" testID="edit-sheet"
                footer={(
                  <TouchableOpacity testID="edit-save" onPress={save} disabled={!changed || busy} accessibilityRole="button"
                                    style={{ flex: 1, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, opacity: !changed || busy ? 0.5 : 1 }}>
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{t(changed ? 'edt.save' : 'edt.noChanges')}</Text>}
                  </TouchableOpacity>
                )}>
      {tx ? (
        <View>
          {tx.debtRole ? <Text testID="edit-loan-note" style={{ color: theme.textSecondary, fontSize: 12.5, marginBottom: 4 }}>{t('edt.loanNote')}</Text> : null}
          {tx.fundedByDebtId ? <Text testID="edit-funded-note" style={{ color: theme.textSecondary, fontSize: 12.5, marginBottom: 4 }}>{t('edt.fundedNote')}</Text> : null}

          <View style={{ flexDirection: 'row', backgroundColor: theme.inputBg, borderRadius: 14, padding: 3, opacity: tx.edit.typeLocked ? 0.55 : 1 }}>
            {(['EXPENSE', 'INCOME'] as const).map(k => (
              <TouchableOpacity key={k} testID={`edit-kind-${k}`} onPress={() => switchKind(k)} disabled={tx.edit.typeLocked} accessibilityRole="button" accessibilityState={{ selected: kind === k }}
                                style={{ flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: kind === k ? theme.surface : 'transparent' }}>
                <Text style={{ color: kind === k ? (k === 'INCOME' ? '#16A34A' : theme.primary) : theme.textMuted, fontWeight: '700', fontSize: 13 }}>{t(k === 'INCOME' ? 'add.income' : 'add.expense')}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {label(t('add.amount'))}
          <View style={{ ...box, flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 8 }}>
            <TextInput testID="edit-amount" value={amount} onChangeText={v => setAmount(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.textMuted}
                       style={{ flex: 1, minWidth: 0, fontSize: 24, fontWeight: '700', color: accent, borderWidth: 0, backgroundColor: 'transparent' }} />
            <Text style={{ color: theme.textMuted, fontWeight: '600' }}>{cur}</Text>
          </View>

          {label(t('add.category'))}
          <TouchableOpacity testID="edit-category" onPress={() => !tx.edit.categoryLocked && setCatOpen(true)} disabled={tx.edit.categoryLocked} accessibilityRole="button"
                            style={{ ...box, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: tx.edit.categoryLocked ? 0.6 : 1 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${catDef.color}22` }}><MaterialIcons name={catDef.icon} size={19} color={catDef.color} /></View>
            <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
              {category === 'loan' ? 'Loan' : t(categoryLabelKey(category, kind) as any)}{subCategory ? `  ›  ${subCategory}` : ''}
            </Text>
            {tx.edit.categoryLocked ? null : <MaterialIcons name="expand-more" size={22} color={theme.textMuted} />}
          </TouchableOpacity>

          {label(t('add.description'))}
          <TextInput testID="edit-title" value={title} onChangeText={setTitle} multiline maxLength={200} placeholder={t('add.descriptionPh')} placeholderTextColor={theme.textMuted}
                     style={{ ...box, minHeight: 84, paddingVertical: 12, textAlignVertical: 'top' as any }} />

          {label(t('add.wallet'))}
          {tx.edit.walletLocked ? (
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>{t('edt.noWalletFunded')}</Text>
          ) : (
            <PayFromField wallets={wallets.filter(w => !w.archived || w.id === tx.walletId)} loans={[]} walletId={walletId} loanId={null} allowNone
                          onWallet={setWalletId} onLoan={() => undefined} />
          )}

          {label(t('add.date'))}
          <TouchableOpacity testID="edit-date" onPress={() => setPickDate(true)} accessibilityRole="button" style={{ ...box, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialIcons name="calendar-today" size={16} color={theme.textMuted} />
            <Text style={{ flex: 1, color: theme.text, fontSize: 15 }}>
              {formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <MaterialIcons name="expand-more" size={20} color={theme.textMuted} />
          </TouchableOpacity>

          {label(t('hx.tags.tags'))}
          <TextInput testID="edit-tags" value={tags} onChangeText={setTags} autoCapitalize="none" placeholder={t('edt.tagsPh')} placeholderTextColor={theme.textMuted} style={{ ...box, minHeight: 50 }} />
          {label(t('hx.tags.note'))}
          <TextInput testID="edit-note" value={note} onChangeText={setNote} multiline maxLength={1000} placeholder={t('hx.tags.notePlaceholder')} placeholderTextColor={theme.textMuted}
                     style={{ ...box, minHeight: 84, paddingVertical: 12, textAlignVertical: 'top' as any }} />

          {effects.length ? (
            <View testID="edit-effects" style={{ marginTop: 18, borderRadius: 14, padding: 12, backgroundColor: theme.primaryBg }}>
              <Text style={{ color: theme.primary, fontSize: 12.5, fontWeight: '700', marginBottom: 4 }}>{t('edt.effects')}</Text>
              {effects.map(e => <Text key={e.walletId} testID="edit-effect" style={{ color: theme.text, fontSize: 13 }}>{nameOf(e.walletId)}: {money(e.change, curOf(e.walletId))}</Text>)}
            </View>
          ) : null}
          {currencyChanged ? <Text testID="edit-currency-warning" style={{ color: '#D97706', fontSize: 12.5, marginTop: 10 }}>{t('edt.currencyChange', { from: oldCur, to: newCur })}</Text> : null}
          {error ? <Text testID="edit-error" style={{ color: theme.negative, fontSize: 13, marginTop: 12 }}>{error}</Text> : null}
        </View>
      ) : null}

      <CategorySheet visible={catOpen} kind={kind} category={category} subCategory={subCategory} mine={mine} startOnSub={!!subCategory}
                     onClose={() => setCatOpen(false)} onSelect={(c, sub) => { setCategory(c); setSubCategory(sub); setCatOpen(false); }} onForget={forget} />
      <DatePickerModal visible={pickDate} title={t('add.date')} value={date} showTime maxDate={new Date()} onClose={() => setPickDate(false)} onConfirm={d => { setDate(d); setPickDate(false); }} />
    </SheetFrame>
  );
}
