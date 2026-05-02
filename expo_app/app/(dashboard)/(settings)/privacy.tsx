import React from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { FadeInView } from '@/components/fade-in-view';

const LAST_UPDATED = 'May 1, 2026';

const SECTIONS = [
  {
    icon: 'info-outline' as const,
    title: '1. Information We Collect',
    body: 'We collect information you provide when creating an account: your name, email address, and phone number. We also collect your facial biometric data solely for authentication purposes. Usage data such as transaction records and spending categories are stored securely and are only accessible to you.',
  },
  {
    icon: 'lock-outline' as const,
    title: '2. How We Use Your Information',
    body: 'Your information is used to:\n• Authenticate your identity using Face Recognition\n• Personalize your expense tracking experience\n• Send account-related notifications\n• Improve app performance and features\n\nWe do not sell, rent, or share your personal information with third parties for marketing purposes.',
  },
  {
    icon: 'face' as const,
    title: '3. Biometric Data',
    body: 'Facial recognition data is encrypted and stored securely. It is used exclusively for identity verification and is never shared with third parties. You may delete your facial data at any time by removing face recognition from your account settings.',
  },
  {
    icon: 'storage' as const,
    title: '4. Data Storage & Security',
    body: 'All data is stored on secure, encrypted servers. We use industry-standard SSL/TLS encryption for all data in transit. Access tokens are short-lived and stored in your device\'s secure storage. We regularly audit our security practices to protect your data.',
  },
  {
    icon: 'share' as const,
    title: '5. Third-Party Services',
    body: 'ABY Expense uses the following trusted third-party services:\n• Google Sign-In for authentication\n• Expo Notifications for push notifications\n\nThese services have their own privacy policies. We only share the minimum data necessary for them to function.',
  },
  {
    icon: 'notifications-none' as const,
    title: '6. Push Notifications',
    body: 'With your permission, we may send push notifications for important account activity. You can manage notification preferences in Settings → Notifications. You may disable notifications at any time without affecting your account.',
  },
  {
    icon: 'person-outline' as const,
    title: '7. Your Rights',
    body: 'You have the right to:\n• Access the personal data we hold about you\n• Request correction of inaccurate data\n• Request deletion of your account and associated data\n• Export your transaction history\n\nTo exercise any of these rights, contact us at privacy@abyexpense.com.',
  },
  {
    icon: 'child-care' as const,
    title: '8. Children\'s Privacy',
    body: 'ABY Expense is not intended for users under the age of 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us immediately.',
  },
  {
    icon: 'update' as const,
    title: '9. Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via email. Your continued use of ABY Expense after changes constitutes acceptance of the updated policy.',
  },
  {
    icon: 'mail-outline' as const,
    title: '10. Contact Us',
    body: 'If you have any questions about this Privacy Policy or how we handle your data, please reach out:\n\nEmail: privacy@abyexpense.com\nWebsite: www.abyexpense.com\nAddress: ABY Tech Hub LLC, Financial District, USA',
  },
];

export default function PrivacyScreen() {
  const theme = useAppTheme();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <FadeInView delay={0} slideFrom="top" distance={12}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: theme.text }]}>Privacy Policy</Text>
          <View style={{ width: 40 }} />
        </View>
      </FadeInView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <FadeInView delay={60} slideFrom="bottom" distance={16}>
          <View style={[s.heroBox, { backgroundColor: theme.primaryBg }]}>
            <View style={[s.heroIcon, { backgroundColor: theme.buttonBg }]}>
              <MaterialIcons name="privacy-tip" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.heroTitle, { color: theme.text }]}>Your Privacy Matters</Text>
              <Text style={[s.heroSub, { color: theme.textSecondary }]}>Last updated: {LAST_UPDATED}</Text>
            </View>
          </View>
        </FadeInView>

        <FadeInView delay={100} slideFrom="bottom" distance={14}>
          <View style={s.intro}>
            <Text style={[s.introText, { color: theme.textSecondary }]}>
              ABY Expense ("we", "our", "us") is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information when you use our mobile application.
            </Text>
          </View>
        </FadeInView>

        {SECTIONS.map((sec, i) => (
          <FadeInView key={sec.title} delay={140 + i * 40} slideFrom="bottom" distance={12}>
            <View style={[s.section, { backgroundColor: theme.surface }]}>
              <View style={s.secHeader}>
                <View style={[s.secIcon, { backgroundColor: theme.primaryBg }]}>
                  <MaterialIcons name={sec.icon} size={18} color={theme.primary} />
                </View>
                <Text style={[s.secTitle, { color: theme.text }]}>{sec.title}</Text>
              </View>
              <Text style={[s.secBody, { color: theme.textSecondary }]}>{sec.body}</Text>
            </View>
          </FadeInView>
        ))}

        <FadeInView delay={560} slideFrom="none">
          <Text style={[s.footer, { color: theme.textMuted }]}>
            © 2026 ABY Tech Hub LLC. All rights reserved.
          </Text>
        </FadeInView>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1 },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 18, fontWeight: '700' },
  scroll:  { paddingBottom: 40 },

  heroBox:  { flexDirection: 'row', alignItems: 'center', gap: 14, margin: 20, borderRadius: 18, padding: 18 },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroTitle:{ fontSize: 16, fontWeight: '700', marginBottom: 2 },
  heroSub:  { fontSize: 12 },

  intro:     { paddingHorizontal: 20, marginBottom: 8 },
  introText: { fontSize: 14, lineHeight: 22 },

  section:   { marginHorizontal: 20, marginBottom: 10, borderRadius: 16, padding: 16 },
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  secIcon:   { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secTitle:  { flex: 1, fontSize: 14, fontWeight: '700' },
  secBody:   { fontSize: 13, lineHeight: 21 },

  footer:    { textAlign: 'center', fontSize: 12, marginTop: 12, marginBottom: 8 },
});
