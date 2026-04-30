import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function WelcomeScreen() {
  const theme = useAppTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <View style={styles.container}>
        <View style={[styles.decorCircle1, { backgroundColor: theme.isDark ? 'rgba(45,51,107,0.6)' : 'rgba(45,51,107,0.08)' }]} />
        <View style={[styles.decorCircle2, { backgroundColor: theme.isDark ? 'rgba(45,51,107,0.4)' : 'rgba(45,51,107,0.05)' }]} />
        <View style={[styles.decorCircle3, { backgroundColor: theme.isDark ? 'rgba(45,51,107,0.35)' : 'rgba(45,51,107,0.04)' }]} />

        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={[styles.logoContainer, { backgroundColor: theme.primary }]}>
            <MaterialIcons name="account-balance-wallet" size={44} color="#FFFFFF" />
          </View>
          <Text style={[styles.appName, { color: theme.text }]}>ABY EXPENSE</Text>
          <Text style={[styles.appTagline, { color: theme.textSecondary }]}>
            Track smarter. Spend wiser.
          </Text>
        </View>

        {/* Illustration */}
        <View style={styles.illustrationArea}>
          <View style={[styles.illustrationCard, { backgroundColor: theme.surface }]}>
            {[
              { color: theme.income,  width: '75%' },
              { color: theme.expense, width: '60%' },
              { color: '#60A5FA',     width: '80%' },
            ].map((row, i) => (
              <View key={i} style={[styles.illustrationRow, i > 0 && { marginTop: 14 }]}>
                <View style={[styles.illustrationDot, { backgroundColor: row.color }]} />
                <View style={[styles.illustrationLine, { width: row.width as any, backgroundColor: theme.border }]} />
              </View>
            ))}
          </View>
          <Text style={[styles.illustrationCaption, { color: theme.textSecondary }]}>
            Manage all your expenses{'\n'}in one place
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonSection}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            activeOpacity={0.8}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            activeOpacity={0.8}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, overflow: 'hidden' },

  decorCircle1: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -80, right: -80 },
  decorCircle2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: 60, left: -80 },
  decorCircle3: { position: 'absolute', width: 160, height: 160, borderRadius: 80, bottom: 80, right: -50 },

  logoSection: { alignItems: 'center', marginTop: 48 },
  logoContainer: {
    width: 84, height: 84, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: '#2D336B', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  appName: { fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  appTagline: { fontSize: 15, marginTop: 6 },

  illustrationArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  illustrationCard: { width: '100%', borderRadius: 20, padding: 24 },
  illustrationRow: { flexDirection: 'row', alignItems: 'center' },
  illustrationDot: { width: 12, height: 12, borderRadius: 6, marginRight: 14 },
  illustrationLine: { height: 10, borderRadius: 5 },
  illustrationCaption: { fontSize: 16, textAlign: 'center', marginTop: 24, lineHeight: 24 },

  buttonSection: { paddingBottom: 32, gap: 12 },
  primaryButton: {
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#2D336B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  secondaryButton: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1 },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.5 },
});
