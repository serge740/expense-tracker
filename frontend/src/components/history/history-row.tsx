import React from 'react';
import { StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { usePreferences } from '@/context/preferences-context';
import { MemberAvatar } from '@/components/family/member-avatar';
import { categoryLabelKey, categoryOf } from '@/constants/categories';
import {
  currencyOf, metaParts, repaymentProgress, rowBadges, rowFlags, shortAmount, signedAmount, transferAmounts, variantOf, VARIANT_ICON, ZERO_DECIMAL,
  type FeedRow, type Tone,
} from '@/utils/history';

/** Time of day only, in the person's language and 12 / 24 hour choice. */
export const clock = (iso: string | Date, locale: string, hour12: boolean) => {
  try { return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12 }); } catch { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12 }); }
};

const LOAN_COLOR = '#C98A00';
const TRANSFER_COLOR = '#00839F';

/** Splits text around the searched words, so the match can be highlighted. */
export function splitMatch(text: string, query: string): [string, string, string] {
  const q = query.trim();
  if (!q) return [text, '', ''];
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? [text, '', ''] : [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
}

function Highlight({ text, query, style, matchStyle }: { text: string; query: string; style: object; matchStyle: object }) {
  const [a, b, c] = splitMatch(text, query);
  return (
    <Text style={style}>
      {a}{b ? <Text style={matchStyle}>{b}</Text> : null}{c}
    </Text>
  );
}

export function useToneColors() {
  const theme = useAppTheme();
  return (tone: Tone): { fg: string; bg: string } => {
    switch (tone) {
      case 'primary': return { fg: theme.primary, bg: theme.primaryBg };
      case 'positive': return { fg: theme.positive, bg: theme.positiveTint };
      case 'negative': return { fg: theme.negative, bg: theme.negativeTint };
      case 'warn': return { fg: theme.warn, bg: theme.warnTint };
      default: return { fg: theme.textSecondary, bg: theme.surface2 };
    }
  };
}

/**
 * One row of History: category icon, title, category and sub-category (or the person of a loan, or "A → B" for a transfer),
 * the wallet it touched (tap it to see only that wallet), badges with an icon and a word, the signed amount and the time.
 */
export function HistoryRow({ row, hidden, fallbackCurrency, showWallet, query = '', onPress, onWalletPress, selecting = false, selected = false, onLongPress, onMore }: {
  row: FeedRow; hidden: boolean; fallbackCurrency: string; showWallet: boolean; query?: string;
  onPress: (row: FeedRow) => void; onWalletPress?: (walletId: string) => void;
  /** Select mode: a tap chooses the row instead of opening it. */
  selecting?: boolean; selected?: boolean;
  /** Press and hold chooses the row; the small button opens the quick look. */
  onLongPress?: (row: FeedRow) => void; onMore?: (row: FeedRow) => void;
}) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { prefs } = usePreferences();
  const tone = useToneColors();

  const variant = variantOf(row);
  const currency = currencyOf(row, fallbackCurrency);
  const zero = ZERO_DECIMAL.has(currency);
  const cat = categoryOf(row.category);
  const iconColor = variant === 'transfer' ? TRANSFER_COLOR : variant === 'expense' || variant === 'income' ? cat.color : LOAN_COLOR;
  const iconName = VARIANT_ICON[variant] ?? cat.icon;
  const badges = rowBadges(row);
  const progress = repaymentProgress(row);
  const flags = rowFlags(row);
  const meta = metaParts(row);
  const when = clock(row.date, locale, prefs.timeFormat === '12h');

  // The amount: income green, spending red, a transfer plain, borrowed and lent money plain (it is not income or spending).
  const amountColor = variant === 'income' || variant === 'repayReceived' ? theme.positive : variant === 'expense' || variant === 'repayPaid' ? theme.negative : theme.text;
  const mask = '•••••';
  let amountText: string;
  let sub: string;
  if (variant === 'transfer') {
    const x = transferAmounts(row);
    amountText = hidden ? mask : x.in != null ? `−${shortAmount(x.out, zero)} → +${shortAmount(x.in, ZERO_DECIMAL.has(x.inCurrency ?? ''))}` : shortAmount(x.out, zero);
    sub = x.in != null ? `${x.outCurrency} → ${x.inCurrency} · ${when}` : `${currency} · ${when}`;
  } else {
    const signed = variant === 'borrowed' || variant === 'lent' ? signedAmount(row.type === 'INCOME' ? Math.abs(row.amount) : -Math.abs(row.amount), { zeroDecimal: zero }) : signedAmount(row.amount, { zeroDecimal: zero });
    amountText = hidden ? mask : signed;
    sub = `${currency} · ${when}`;
  }

  const categoryText = meta.category ? `${t(categoryLabelKey(meta.category, row.type === 'INCOME' ? 'INCOME' : 'EXPENSE') as any)}${meta.sub ? ` › ${meta.sub}` : ''}` : null;
  const metaText = variant === 'transfer'
    ? `${meta.from ?? '—'} → ${meta.to ?? '—'} · ${row.transfer?.exchangeRate && row.transfer.toWallet && row.wallet && row.transfer.toWallet.currency !== row.wallet.currency
        ? t('history.rate', { from: row.transfer.toWallet.currency, rate: shortAmount(1 / row.transfer.exchangeRate), to: row.wallet.currency }) : t('history.notSpending')}`
    : meta.person ?? categoryText ?? '';

  const title = row.title.trim() || t('history.noTitle');
  const a11y = [title, metaText, `${amountText} ${currency}`, row.wallet?.name, when].filter(Boolean).join(', ');
  const mark = { backgroundColor: theme.warnTint, color: theme.text };

  return (
    <TouchableOpacity testID="history-row" activeOpacity={0.8} onPress={() => onPress(row)} onLongPress={onLongPress ? () => onLongPress(row) : undefined} accessibilityLabel={a11y} accessibilityState={selecting ? { checked: selected } : undefined} style={[s.row, selected && { backgroundColor: theme.primaryBg }]}>
      {selecting ? <View testID={selected ? 'row-checked' : 'row-unchecked'}><MaterialIcons name={selected ? 'check-box' : 'check-box-outline-blank'} size={24} color={selected ? theme.primary : theme.textMuted} /></View> : null}
      {row.author && variant !== 'transfer' ? (
        <View style={s.avatarWrap}><MemberAvatar id={row.author.clientId} name={row.author.name} size={40} /></View>
      ) : (
        <View style={[s.icon, { backgroundColor: `${iconColor}26` }]}><MaterialIcons name={iconName} size={21} color={iconColor} /></View>
      )}

      <View style={s.mid}>
        <Highlight text={title} query={query} style={[s.title, { color: theme.text }]} matchStyle={mark} />
        {metaText ? <Text style={[s.meta, { color: theme.textSecondary }]} numberOfLines={2}>{metaText}{row.author ? ` · ${row.author.isYou ? t('family.tx.you') : row.author.name}` : ''}</Text> : null}
        {(showWallet && row.wallet && variant !== 'transfer') || badges.length ? (
          <View style={s.tags}>
            {showWallet && row.wallet && variant !== 'transfer' ? (
              <TouchableOpacity testID="row-wallet" activeOpacity={0.7} accessibilityLabel={t('history.openWalletTag', { name: row.wallet.name })}
                                onPress={e => { (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.(); if (row.walletId) onWalletPress?.(row.walletId); }}
                                style={[s.walletTag, { backgroundColor: theme.surface2 }]}>
                <View style={[s.walletDot, { backgroundColor: row.wallet.archived ? '#9AA8AE' : row.wallet.color }]} />
                <Text style={[s.walletText, { color: theme.text }]} numberOfLines={1}>{row.wallet.name}{row.wallet.archived ? ' ⁎' : ''}</Text>
              </TouchableOpacity>
            ) : null}
            {badges.map((b, i) => {
              const c = tone(b.tone);
              return (
                <View key={i} style={[s.badge, { backgroundColor: c.bg }]}>
                  <MaterialIcons name={b.icon} size={13} color={c.fg} />
                  <Text style={[s.badgeText, { color: c.fg }]} numberOfLines={1}>{t(b.label, b.vars)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
        {progress ? (
          <View style={s.progress}>
            <View style={[s.track, { backgroundColor: theme.surface2 }]}><View style={[s.fill, { backgroundColor: theme.primary, width: `${Math.round((progress.done / progress.total) * 100)}%` as any }]} /></View>
            <Text style={[s.progressText, { color: theme.textSecondary }]}>{progress.done} / {progress.total}</Text>
          </View>
        ) : null}
        {flags.includes('duplicate') ? (
          <View testID="flag-duplicate" style={[s.flag, { backgroundColor: theme.warnTint }]}>
            <MaterialIcons name="content-copy" size={15} color={theme.warn} />
            <Text style={{ flex: 1, color: theme.warn, fontSize: 12, lineHeight: 16 }}><Text style={{ fontWeight: '600' }}>{t('flag.duplicate')}.</Text> {t('flag.duplicateHint')}</Text>
          </View>
        ) : null}
        {flags.includes('uncategorised') ? (
          <View testID="flag-uncategorised" style={[s.flag, { backgroundColor: theme.primaryBg }]}>
            <MaterialIcons name="category" size={15} color={theme.primary} />
            <Text style={{ flex: 1, color: theme.primary, fontSize: 12, fontWeight: '600' }}>{t('flag.uncategorised')}</Text>
          </View>
        ) : null}
        {query && row.description ? <Highlight text={`“${row.description}”`} query={query} style={[s.note, { color: theme.textSecondary }]} matchStyle={mark} /> : null}
      </View>

      <View style={s.right}>
        <Text style={[s.amount, { color: amountColor }]}>{amountText}</Text>
        <Text style={[s.sub, { color: theme.textSecondary }]}>{sub}</Text>
        {row.balanceAfter != null ? <Text testID="row-balance" style={[s.sub, { color: theme.textMuted }]}>{hidden ? mask : t('stmt.after', { amount: shortAmount(row.balanceAfter, zero) })}</Text> : null}
        {row.receiptUrl ? <MaterialIcons name="attach-file" size={16} color={theme.textMuted} style={{ marginTop: 4 }} /> : null}
        {onMore && !selecting ? (
          <TouchableOpacity testID="row-peek" onPress={e => { (e as { stopPropagation?: () => void } | undefined)?.stopPropagation?.(); onMore(row); }} accessibilityRole="button" accessibilityLabel={t('peek.more', { title })} style={s.more}>
            <MaterialIcons name="more-horiz" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  more: { width: 36, height: 28, alignItems: 'flex-end', justifyContent: 'center', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { width: 40, height: 40 },
  mid: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  meta: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 6 },
  walletTag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2, paddingLeft: 6, paddingRight: 8, borderRadius: 99, maxWidth: 150 },
  walletDot: { width: 8, height: 8, borderRadius: 3 },
  walletText: { fontSize: 11, fontWeight: '500', flexShrink: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingLeft: 5, paddingRight: 8, borderRadius: 99 },
  badgeText: { fontSize: 11, fontWeight: '500', lineHeight: 16, flexShrink: 1 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  track: { flex: 1, height: 6, borderRadius: 9 },
  fill: { height: 6, borderRadius: 9 },
  progressText: { fontSize: 11 },
  note: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  flag: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 },
  right: { alignItems: 'flex-end', maxWidth: '44%', flexShrink: 0 },
  amount: { fontSize: 15, fontWeight: '600', lineHeight: 20, textAlign: 'right' },
  sub: { fontSize: 11, marginTop: 2, textAlign: 'right' },
});
