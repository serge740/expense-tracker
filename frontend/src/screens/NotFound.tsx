import { View, Text, TouchableOpacity, MaterialIcons } from '@/rn';
import { useAppTheme } from '@/theme/theme-context';
import { router } from '@/router/router';

export default function NotFound() {
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: theme.background }}>
      <MaterialIcons name="explore-off" size={56} color={theme.textMuted} />
      <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 14 }}>Page not found</Text>
      <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6, textAlign: 'center' }}>This page doesn't exist.</Text>
      <TouchableOpacity onPress={() => router.replace('/')} style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999, backgroundColor: theme.buttonBg }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Go to start</Text>
      </TouchableOpacity>
    </View>
  );
}
