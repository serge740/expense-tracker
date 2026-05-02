import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { FadeInView } from '@/components/fade-in-view';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FAQ { q: string; a: string }

const FAQS: { category: string; icon: keyof typeof MaterialIcons.glyphMap; items: FAQ[] }[] = [
  {
    category: 'Getting Started',
    icon: 'rocket-launch',
    items: [
      { q: 'How do I create an account?', a: 'Open the app, tap "Sign up" on the login screen, enter your name, email, and phone number, then set up your sign-in method — either Face Recognition or Google.' },
      { q: 'How does face recognition work?', a: 'ABY uses your device camera to capture your facial features. These are stored securely on our servers and used only to verify your identity when signing in. No password is ever needed.' },
      { q: 'Can I use multiple sign-in methods?', a: 'Yes. You can register your face and also link your Google account. Either method will sign you in to the same account.' },
    ],
  },
  {
    category: 'Transactions',
    icon: 'receipt-long',
    items: [
      { q: 'How do I add an expense?', a: 'Tap the "+" button on the home screen or navigate to "Add". Choose the transaction type (Income/Expense), select a category, enter the amount, and save.' },
      { q: 'Can I edit or delete a transaction?', a: 'Yes. Open the transaction from your History or Expense list, then tap the edit icon to modify or the delete icon to remove it.' },
      { q: 'What categories are available?', a: 'ABY supports: Food, Transport, Shopping, Health, Entertainment, Travel, Groceries, Salary, and Other. More categories will be added in future updates.' },
    ],
  },
  {
    category: 'Wallets',
    icon: 'account-balance-wallet',
    items: [
      { q: 'How do I add a wallet?', a: 'Go to the Wallets tab, then tap "Add Wallet". Enter your wallet name, bank, last 4 digits (optional), and starting balance.' },
      { q: 'Can I have multiple wallets?', a: 'Yes. You can manage as many wallets as you like — checking, savings, credit cards, or cash. Your total balance is the sum of all wallets.' },
      { q: 'Does ABY connect to my bank?', a: 'No. ABY does not connect to real bank accounts. All transactions and balances are entered manually by you for privacy and security.' },
    ],
  },
  {
    category: 'Notifications',
    icon: 'notifications',
    items: [
      { q: 'How do I enable push notifications?', a: 'Go to Settings → Notifications → Settings tab. Make sure "Push Notifications" is enabled. You may also need to allow notifications in your device settings.' },
      { q: 'Why am I not receiving notifications?', a: 'Check that push notifications are enabled in both ABY settings and your device system settings. Also ensure your device token is registered by opening the app at least once.' },
    ],
  },
  {
    category: 'Account & Security',
    icon: 'security',
    items: [
      { q: 'How do I update my profile?', a: 'Go to Settings → Edit Profile. You can change your name, phone number, and profile photo from there.' },
      { q: 'What devices are signed in to my account?', a: 'Go to Settings → Devices to see all devices that have accessed your account. You can remove any device you don\'t recognise.' },
      { q: 'How do I sign out?', a: 'Scroll to the bottom of the Settings screen and tap "Sign Out". This will clear your session on the current device.' },
    ],
  },
];

function FaqItem({ item, theme }: { item: FAQ; theme: ReturnType<typeof useAppTheme> }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(v => !v);
  };

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.8} style={s.faqItem}>
      <View style={s.faqQ}>
        <Text style={[s.faqQText, { color: theme.text }]}>{item.q}</Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={22} color={theme.textMuted} />
      </View>
      {open && (
        <Text style={[s.faqA, { color: theme.textSecondary }]}>{item.a}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function HelpScreen() {
  const theme = useAppTheme();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <FadeInView delay={0} slideFrom="top" distance={12}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: theme.text }]}>Help & FAQ</Text>
          <View style={{ width: 40 }} />
        </View>
      </FadeInView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <FadeInView delay={60} slideFrom="bottom" distance={16}>
          <View style={[s.heroBox, { backgroundColor: theme.primaryBg }]}>
            <View style={[s.heroIcon, { backgroundColor: theme.buttonBg }]}>
              <MaterialIcons name="help-outline" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.heroTitle, { color: theme.text }]}>How can we help?</Text>
              <Text style={[s.heroSub, { color: theme.textSecondary }]}>Find answers to common questions below.</Text>
            </View>
          </View>
        </FadeInView>

        {FAQS.map((section, si) => (
          <FadeInView key={section.category} delay={120 + si * 60} slideFrom="bottom" distance={14}>
            <View style={s.section}>
              <View style={s.catRow}>
                <View style={[s.catIcon, { backgroundColor: theme.primaryBg }]}>
                  <MaterialIcons name={section.icon} size={16} color={theme.primary} />
                </View>
                <Text style={[s.catLabel, { color: theme.textMuted }]}>{section.category.toUpperCase()}</Text>
              </View>
              <View style={[s.card, { backgroundColor: theme.surface }]}>
                {section.items.map((item, i) => (
                  <React.Fragment key={item.q}>
                    <FaqItem item={item} theme={theme} />
                    {i < section.items.length - 1 && <View style={[s.divider, { backgroundColor: theme.border }]} />}
                  </React.Fragment>
                ))}
              </View>
            </View>
          </FadeInView>
        ))}

        <FadeInView delay={480} slideFrom="bottom" distance={12}>
          <View style={[s.contactBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialIcons name="mail-outline" size={22} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.contactTitle, { color: theme.text }]}>Still need help?</Text>
              <Text style={[s.contactSub, { color: theme.textSecondary }]}>Contact us at support@abyexpense.com</Text>
            </View>
          </View>
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

  heroBox: { flexDirection: 'row', alignItems: 'center', gap: 14, margin: 20, borderRadius: 18, padding: 18 },
  heroIcon:{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroTitle:{ fontSize: 16, fontWeight: '700', marginBottom: 2 },
  heroSub: { fontSize: 13, lineHeight: 18 },

  section: { paddingHorizontal: 20, marginTop: 8 },
  catRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  catIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  catLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  card:    { borderRadius: 18, overflow: 'hidden', marginBottom: 6 },

  faqItem: { paddingHorizontal: 16, paddingVertical: 14 },
  faqQ:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  faqQText:{ flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  faqA:    { fontSize: 13, lineHeight: 20, marginTop: 10, paddingRight: 28 },
  divider: { height: 1, marginHorizontal: 16 },

  contactBox: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginTop: 16, borderRadius: 16, padding: 16, borderWidth: 1 },
  contactTitle:{ fontSize: 14, fontWeight: '700', marginBottom: 2 },
  contactSub: { fontSize: 13 },
});
