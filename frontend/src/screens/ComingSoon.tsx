import { View, Text, MaterialIcons } from '@/rn';
import { useAppTheme } from '@/theme/theme-context';

/** Stand-in for a screen that has not been ported yet. Removed screen by screen. */
export default function ComingSoon({ title, icon = 'construction' }: { title: string; icon?: string }) {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <MaterialIcons name={icon} size={48} color={theme.textMuted} />
      <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 12 }}>{title}</Text>
      <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6, textAlign: 'center' }}>This screen is being ported from the phone app.</Text>
    </View>
  );
}
