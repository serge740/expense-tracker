import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, MaterialIcons } from '@/rn';
import { useAppTheme } from '@/theme/theme-context';
import { router } from '@/router/router';
import { getMe, logout, type ClientProfile } from '@/services/client-auth.service';

/** Stand-in until the real Home screen is ported: proves sign-in, the API client and the theme work end to end. */
export default function DashboardHome() {
  const theme = useAppTheme();
  const [me, setMe] = useState<ClientProfile | null>(null);
  useEffect(() => { getMe().then(setMe).catch(() => {}); }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: theme.background }}>
      <MaterialIcons name="check-circle" size={56} color={theme.income} />
      <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text, marginTop: 14 }}>
        {me ? `Hi, ${me.firstName}` : 'Signed in'}
      </Text>
      <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6, textAlign: 'center' }}>
        The dashboard screens are being ported next.
      </Text>
      <TouchableOpacity
        onPress={async () => { await logout(); router.replace('/(auth)/login'); }}
        style={{ marginTop: 22, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999, backgroundColor: theme.buttonBg }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
