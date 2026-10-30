import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { addComment, getComments, removeComment, type FamilyComment } from '@/services/family-extras.service';
import { can } from '@/utils/family-permissions';

/** The conversation under a family transaction. */
export function Comments({ transactionId }: { transactionId: string }) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const scope = useScope();
  const familyId = scope.family?.id;
  const [items, setItems] = useState<FamilyComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!familyId) return;
    try { setItems((await getComments(familyId, transactionId)).items); } catch { setItems([]); }
  }, [familyId, transactionId]);
  useEffect(() => { load(); }, [load]);
  if (!familyId) return null;

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try { setItems((await addComment(familyId, transactionId, body)).items); setText(''); } catch { /* the text stays so it can be sent again */ } finally { setBusy(false); }
  };
  const del = async (c: FamilyComment) => { try { await removeComment(familyId, c.id); setItems(x => (x ?? []).filter(y => y.id !== c.id)); } catch { /* ignore */ } };
  const mayDeleteOthers = can(scope.role, 'comment.delete.other');

  return (
    <View testID="comments" style={{ marginTop: 14, borderRadius: 16, padding: 14, backgroundColor: theme.surface }}>
      <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700', marginBottom: 8 }}>{t('comments.title')}</Text>
      {items === null ? <ActivityIndicator color={theme.primary} /> : items.length === 0 ? <Text testID="comments-empty" style={{ color: theme.textMuted, fontSize: 13 }}>{t('comments.empty')}</Text> : items.map(c => (
        <View key={c.id} testID="comment" style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>{c.author.name}{c.author.isYou ? ' ★' : ''} · <Text style={{ color: theme.textMuted, fontWeight: '400' }}>{formatDate(c.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text></Text>
            {c.author.isYou || mayDeleteOthers ? <TouchableOpacity testID="comment-delete" onPress={() => del(c)} accessibilityRole="button" accessibilityLabel={t('comments.delete')} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="close" size={16} color={theme.textMuted} /></TouchableOpacity> : null}
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>{c.body}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <TextInput testID="comment-input" value={text} onChangeText={setText} placeholder={t('comments.placeholder')} placeholderTextColor={theme.textMuted} maxLength={500} onSubmitEditing={send}
                   style={{ flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.inputBg, paddingHorizontal: 14, color: theme.text, fontSize: 14 }} />
        <TouchableOpacity testID="comment-send" disabled={busy || !text.trim()} onPress={send} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: theme.primary, justifyContent: 'center', opacity: text.trim() ? 1 : 0.5 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>{t('comments.send')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
