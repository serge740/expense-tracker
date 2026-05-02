import React from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { FadeInView } from '@/components/fade-in-view';

const APP_VERSION = '1.0.0';
const BUILD_NUMBER = '100';

const FEATURES = [
  { icon: 'face' as const,                  label: 'Passwordless Face Login' },
  { icon: 'account-balance-wallet' as const,label: 'Multi-wallet Management' },
  { icon: 'receipt-long' as const,          label: 'Expense Tracking' },
  { icon: 'bar-chart' as const,             label: 'Spending Reports & Charts' },
  { icon: 'notifications' as const,         label: 'Smart Notifications' },
  { icon: 'devices' as const,               label: 'Multi-device Support' },
];

const LINKS: { icon: keyof typeof MaterialIcons.glyphMap; label: string; url: string }[] = [
  { icon: 'language',     label: 'Website',        url: 'https://www.abyexpense.com' },
  { icon: 'mail-outline', label: 'Contact Support', url: 'mailto:support@abyexpense.com' },
  { icon: 'privacy-tip',  label: 'Privacy Policy',  url: 'https://www.abyexpense.com/privacy' },
  { icon: 'description',  label: 'Terms of Service',url: 'https://www.abyexpense.com/terms' },
];

export default function AboutScreen() {
  const theme = useAppTheme();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <FadeInView delay={0} slideFrom="top" distance={12}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: theme.text }]}>About App</Text>
          <View style={{ width: 40 }} />
        </View>
      </FadeInView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Logo + version card */}
        <FadeInView delay={60} slideFrom="bottom" distance={20}>
          <View style={[s.brandCard, { backgroundColor: theme.buttonBg }]}>
            <Image
              source={require('@/assets/images/logo/dark.png')}
              style={s.logoImg}
              resizeMode="contain"
            />
            <Text style={s.appName}>ABY Expense</Text>
            <Text style={s.tagline}>Smart Money Management</Text>
            <View style={[s.versionBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Text style={s.versionText}>v{APP_VERSION} · Build {BUILD_NUMBER}</Text>
            </View>
          </View>
        </FadeInView>

        {/* Description */}
        <FadeInView delay={140} slideFrom="bottom" distance={14}>
          <View style={[s.section, { backgroundColor: theme.surface }]}>
            <Text style={[s.sectionTitle, { color: theme.text }]}>About ABY Expense</Text>
            <Text style={[s.body, { color: theme.textSecondary }]}>
              ABY Expense is a modern personal finance app designed to help you track spending, manage wallets, and gain insights into your financial habits — all secured with cutting-edge face recognition technology.{'\n\n'}
              Built with privacy-first principles, ABY never connects to your bank accounts. You stay in full control of your data.
            </Text>
          </View>
        </FadeInView>

        {/* Features */}
        <FadeInView delay={200} slideFrom="bottom" distance={14}>
          <View style={s.featSection}>
            <Text style={[s.labelSmall, { color: theme.textMuted }]}>KEY FEATURES</Text>
            <View style={[s.featGrid, { backgroundColor: theme.surface }]}>
              {FEATURES.map((f, i) => (
                <React.Fragment key={f.label}>
                  <View style={s.featRow}>
                    <View style={[s.featIcon, { backgroundColor: theme.primaryBg }]}>
                      <MaterialIcons name={f.icon} size={18} color={theme.primary} />
                    </View>
                    <Text style={[s.featLabel, { color: theme.text }]}>{f.label}</Text>
                    <MaterialIcons name="check-circle" size={16} color={theme.income ?? '#22C55E'} />
                  </View>
                  {i < FEATURES.length - 1 && <View style={[s.divider, { backgroundColor: theme.border }]} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        </FadeInView>

        {/* Links */}
        <FadeInView delay={280} slideFrom="bottom" distance={14}>
          <View style={s.featSection}>
            <Text style={[s.labelSmall, { color: theme.textMuted }]}>LINKS</Text>
            <View style={[s.featGrid, { backgroundColor: theme.surface }]}>
              {LINKS.map((link, i) => (
                <React.Fragment key={link.label}>
                  <TouchableOpacity style={s.featRow} activeOpacity={0.7} onPress={() => Linking.openURL(link.url)}>
                    <View style={[s.featIcon, { backgroundColor: theme.primaryBg }]}>
                      <MaterialIcons name={link.icon} size={18} color={theme.primary} />
                    </View>
                    <Text style={[s.featLabel, { color: theme.text }]}>{link.label}</Text>
                    <MaterialIcons name="open-in-new" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                  {i < LINKS.length - 1 && <View style={[s.divider, { backgroundColor: theme.border }]} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        </FadeInView>

        {/* Developer */}
        <FadeInView delay={360} slideFrom="bottom" distance={12}>
          <View style={[s.section, { backgroundColor: theme.surface }]}>
            <Text style={[s.sectionTitle, { color: theme.text }]}>Developer</Text>
            <View style={s.devRow}>
              <View style={[s.devAvatar, { backgroundColor: theme.primaryBg }]}>
                <Text style={[s.devInitial, { color: theme.primary }]}>A</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.devName, { color: theme.text }]}>ABY Tech Hub LLC</Text>
                <Text style={[s.devSub, { color: theme.textSecondary }]}>abytechhubllc@gmail.com</Text>
              </View>
            </View>
          </View>
        </FadeInView>

        <FadeInView delay={420} slideFrom="none">
          <Text style={[s.footer, { color: theme.textMuted }]}>
            © 2026 ABY Tech Hub LLC. All rights reserved.{'\n'}Made with ♥ for smart savers everywhere.
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
  scroll:  { paddingBottom: 48 },

  brandCard: { alignItems: 'center', marginHorizontal: 20, marginTop: 20, borderRadius: 24, paddingVertical: 32, paddingHorizontal: 24 },
  logoImg:   { width: 80, height: 80, marginBottom: 12 },
  appName:   { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 1, marginBottom: 4 },
  tagline:   { fontSize: 13, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, marginBottom: 16 },
  versionBadge:{ borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  versionText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600', letterSpacing: 0.5 },

  section:      { marginHorizontal: 20, marginTop: 16, borderRadius: 18, padding: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  body:         { fontSize: 13, lineHeight: 22 },

  featSection: { marginHorizontal: 20, marginTop: 16 },
  labelSmall:  { fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  featGrid:    { borderRadius: 18, overflow: 'hidden' },
  featRow:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  featIcon:    { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  featLabel:   { flex: 1, fontSize: 14, fontWeight: '500' },
  divider:     { height: 1, marginHorizontal: 14 },

  devRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  devAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  devInitial:{ fontSize: 20, fontWeight: '800' },
  devName:   { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  devSub:    { fontSize: 12 },

  footer: { textAlign: 'center', fontSize: 12, lineHeight: 20, marginTop: 20, marginHorizontal: 32 },
});
