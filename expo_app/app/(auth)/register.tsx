import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';

const STEPS = ['ACCOUNT', 'PERSONAL', 'SECURITY'];

export default function RegisterScreen() {
  const theme = useAppTheme();
  const [step]                                = useState(1);
  const [firstName, setFirstName]             = useState('');
  const [lastName, setLastName]               = useState('');
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible]   = useState(false);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.surface} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.inputBg }]} onPress={() => router.back()} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={20} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Create Account</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Step tabs */}
          <View style={styles.stepRow}>
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <TouchableOpacity style={styles.stepItem}>
                  <Text style={[styles.stepLabel, { color: i <= step ? theme.primary : theme.textMuted, fontWeight: i === step ? '700' : '500' }]}>
                    {s}
                  </Text>
                  <View style={[styles.stepLine, { backgroundColor: i <= step ? theme.primary : theme.border }]} />
                </TouchableOpacity>
                {i < STEPS.length - 1 && <View style={{ width: 8 }} />}
              </React.Fragment>
            ))}
          </View>

          {/* Name row */}
          <View style={styles.nameRow}>
            <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.border, flex: 1 }]}>
              <TextInput style={[styles.input, { color: theme.text }]} placeholder="First name" placeholderTextColor={theme.textMuted} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
            </View>
            <View style={{ width: 10 }} />
            <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.border, flex: 1 }]}>
              <TextInput style={[styles.input, { color: theme.text }]} placeholder="Last name" placeholderTextColor={theme.textMuted} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
            </View>
          </View>

          {/* Email */}
          <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="email" size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="Email address" placeholderTextColor={theme.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          </View>

          {/* Password */}
          <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="lock" size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="Password" placeholderTextColor={theme.textMuted} value={password} onChangeText={setPassword} secureTextEntry={!passwordVisible} autoCapitalize="none" />
            <TouchableOpacity onPress={() => setPasswordVisible(v => !v)} style={styles.eyeButton}>
              <MaterialIcons name={passwordVisible ? 'visibility' : 'visibility-off'} size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Confirm password */}
          <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            <MaterialIcons name="lock" size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput style={[styles.input, { color: theme.text }]} placeholder="Confirm password" placeholderTextColor={theme.textMuted} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!confirmVisible} autoCapitalize="none" />
            <TouchableOpacity onPress={() => setConfirmVisible(v => !v)} style={styles.eyeButton}>
              <MaterialIcons name={confirmVisible ? 'visibility' : 'visibility-off'} size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Receipt scanning info box */}
          <View style={[styles.infoBox, { backgroundColor: theme.primaryBg, borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(45,51,107,0.12)' }]}>
            <MaterialIcons name="photo-camera" size={22} color={theme.primary} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoTitle, { color: theme.primary }]}>Receipt Scanning</Text>
              <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
                After signing up you can scan receipts to auto-log expenses.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            activeOpacity={0.85}
            onPress={() => router.replace('/(dashboard)')}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={[styles.loginPrompt, { color: theme.textSecondary }]}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')} activeOpacity={0.7}>
              <Text style={[styles.loginLink, { color: theme.primary }]}>Sign In</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  stepRow: { flexDirection: 'row', marginBottom: 24 },
  stepItem: { flex: 1, alignItems: 'center', gap: 6 },
  stepLabel: { fontSize: 11, letterSpacing: 0.5 },
  stepLine: { width: '100%', height: 3, borderRadius: 2 },
  nameRow: { flexDirection: 'row', marginBottom: 14 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 54, marginBottom: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15 },
  eyeButton: { padding: 4 },
  infoBox: {
    flexDirection: 'row', gap: 12, borderRadius: 14,
    padding: 14, marginBottom: 24, borderWidth: 1,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  infoDesc: { fontSize: 13, lineHeight: 20 },
  primaryButton: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#2D336B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  loginPrompt: { fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '700' },
});
