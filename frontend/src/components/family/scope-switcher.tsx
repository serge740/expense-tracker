// Ported from expo_app/components/family/scope-switcher.tsx
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/context/language-context';
import { useScope } from '@/context/scope-context';
import { OptionRow, OptionSheet, Tile } from '@/components/add/option-sheet';
import { FAMILY_PURPLE } from '@/constants/family-theme';

/** The sheet that says where you are and lets you move: Personal, your family, or create / join one. */
export function ScopeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { isFamily, family, role, memberCount, switchTo } = useScope();

  const go = (path: string) => () => { onClose(); router.push(path as any); };
  const pick = (target: 'personal' | 'family') => async () => { onClose(); await switchTo(target); };
  const members = t(memberCount === 1 ? 'family.sheet.membersOne' : 'family.sheet.members', { n: memberCount });

  return (
    <OptionSheet visible={visible} title={t('family.sheet.title')} onClose={onClose}>
      <Text style={[s.sub, { color: theme.textSecondary }]}>{t('family.sheet.sub')}</Text>
      <OptionRow testID="scope-personal" title={t('family.sheet.personal')} sub={t('family.sheet.personalSub')} selected={!isFamily}
                 tile={<Tile icon="person-outline" color="#FFFFFF" bg="#00627F" />} onPress={pick('personal')} />
      {family ? (
        <>
          <OptionRow testID="scope-family" title={family.name} selected={isFamily}
                     sub={t('family.sheet.you', { members, role: role ? t(`role.${role}` as any).toLowerCase() : '' })}
                     tile={<Tile icon="groups" color="#FFFFFF" bg={FAMILY_PURPLE} />} onPress={pick('family')} />
          <OptionRow testID="scope-manage" title={t('family.sheet.manage')}
                     tile={<Tile icon="settings" color={theme.primary} bg={theme.primaryBg} />} onPress={go('/(dashboard)/family')} />
        </>
      ) : (
        <>
          <OptionRow testID="scope-create" title={t('family.sheet.create')} sub={t('family.sheet.createSub')}
                     tile={<Tile icon="group-add" color="#FFFFFF" bg={FAMILY_PURPLE} />} onPress={go('/(dashboard)/family-create')} />
          <OptionRow testID="scope-join" title={t('family.sheet.join')} sub={t('family.sheet.joinSub')}
                     tile={<Tile icon="vpn-key" color={theme.primary} bg={theme.primaryBg} />} onPress={go('/(dashboard)/family-join')} />
        </>
      )}
    </OptionSheet>
  );
}

/**
 * The small button that shows where you are ("Personal" or the family's name) and opens the sheet above.
 * `onHeader` is for a coloured header (a translucent white pill); otherwise it is a plain card-coloured pill.
 */
export function ScopePill({ onHeader = false }: { onHeader?: boolean }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { isFamily, family } = useScope();
  const [open, setOpen] = useState(false);
  const label = isFamily && family ? family.name : t('family.pill.personal');
  const fg = onHeader ? '#FFFFFF' : theme.text;

  return (
    <>
      <TouchableOpacity testID="scope-pill" activeOpacity={0.8} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${t('family.sheet.title')} ${label}`}
                        style={[s.pill, onHeader ? s.pillOnHeader : { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <MaterialIcons name={isFamily ? 'groups' : 'person-outline'} size={15} color={fg} />
        <Text style={[s.pillText, { color: fg }]} numberOfLines={1}>{label}</Text>
        <MaterialIcons name="expand-more" size={16} color={fg} />
      </TouchableOpacity>
      <ScopeSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  sub: { fontSize: 12, marginBottom: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: 200, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: 'transparent' },
  pillOnHeader: { backgroundColor: 'rgba(255,255,255,0.16)' },
  pillText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
