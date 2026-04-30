import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function LoginScreen() {
  const theme = useAppTheme();
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.surface} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Avatar initial */}
          <View style={[styles.avatarCircle, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarLetter}>A</Text>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Sign in to continue</Text>

          {/* Email */}
          <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="email" size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="you@example.com"
              placeholderTextColor={theme.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="lock" size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="••••••••"
              placeholderTextColor={theme.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setPasswordVisible(v => !v)} style={styles.eyeButton}>
              <MaterialIcons name={passwordVisible ? 'visibility' : 'visibility-off'} size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.forgotRow} activeOpacity={0.7}>
            <Text style={[styles.forgotText, { color: theme.primary }]}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            activeOpacity={0.85}
            onPress={() => router.replace('/(dashboard)')}
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textMuted }]}>or continue with</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.googleButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
            activeOpacity={0.8}
          >
            <MaterialIcons name="language" size={20} color={theme.text} />
            <Text style={[styles.googleButtonText, { color: theme.text }]}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={[styles.signupPrompt, { color: theme.textSecondary }]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')} activeOpacity={0.7}>
              <Text style={[styles.signupLink, { color: theme.primary }]}>Sign up</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 },
  avatarCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginTop: 48, marginBottom: 20,
  },
  avatarLetter: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 15, marginBottom: 32 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14,
    height: 54, marginBottom: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15 },
  eyeButton: { padding: 4 },
  forgotRow: { alignSelf: 'flex-end', marginBottom: 24 },
  forgotText: { fontSize: 14, fontWeight: '600' },
  primaryButton: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#2D336B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, gap: 10, borderWidth: 1,
  },
  googleButtonText: { fontSize: 15, fontWeight: '600' },
  signupRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  signupPrompt: { fontSize: 14 },
  signupLink: { fontSize: 14, fontWeight: '700' },
});
