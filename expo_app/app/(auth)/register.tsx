import React, { useState, useEffect, useRef } from 'react';
import {
  View, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import * as LocalAuthentication from 'expo-local-authentication';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  registerClient,
  googleAuthClient,
  enrollFace,
  enableBiometric,
} from '@/services/client-auth.service';

const STEPS = ['ACCOUNT', 'SECURITY'];

export default function RegisterScreen() {
  const theme = useAppTheme();
  const [step, setStep]           = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [done, setDone]           = useState(false);
  const [loading, setLoading]     = useState<'face' | 'fingerprint' | 'google' | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '936996911068-a2e2v1jjq9c7hmotp339l1spqe75g102.apps.googleusercontent.com',
      offlineAccess: true,
    });
  }, []);

  const handleNext = () => {
    if (step === 0) {
      if (!firstName.trim() || !email.trim() || !phone.trim()) {
        Alert.alert('Required', 'Please enter your name, email, and phone number.');
        return;
      }
      setStep(1);
    }
  };

  // ── Fingerprint ───────────────────────────────────────────────────────────
  const handleFingerprint = async () => {
    setLoading('fingerprint');
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !enrolled) {
        Alert.alert('Not Available', 'Fingerprint is not set up on this device. Please enable it in your device Settings first.');
        return;
      }

      // Create account first
      await registerClient({ firstName, lastName, email, phone });

      // Prompt biometric enrollment
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Register your fingerprint for future logins',
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        await enableBiometric();
      }

      setDone(true);
      setTimeout(() => router.replace('/(dashboard)'), 400);
    } catch (error: any) {
      Alert.alert(
        'Registration Failed',
        error?.response?.data?.message || error.message || 'Please try again.',
      );
    } finally {
      setLoading(null);
    }
  };

  // ── Face Recognition ──────────────────────────────────────────────────────
  const handleFaceRegister = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Camera Permission', 'Camera access is required for face recognition.');
        return;
      }
    }
    setCameraVisible(true);
  };

  const takePictureForEnroll = async () => {
    if (!cameraRef.current) return;
    setLoading('face');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setCameraVisible(false);
      if (!photo?.uri) throw new Error('Failed to capture photo');

      // Create account
      await registerClient({ firstName, lastName, email, phone });

      // Enroll face
      await enrollFace(photo.uri);

      setDone(true);
      router.replace('/(dashboard)');
    } catch (error: any) {
      setCameraVisible(false);
      Alert.alert(
        'Face Enrollment Failed',
        error?.response?.data?.message || error.message || 'Please try again.',
      );
    } finally {
      setLoading(null);
    }
  };

  // ── Google ────────────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setLoading('google');
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      if (!idToken) throw new Error('No ID token received');
      await googleAuthClient(idToken, phone);
      router.replace('/(dashboard)');
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (error.code === statusCodes.IN_PROGRESS) return;
      Alert.alert('Google Sign-Up Failed', error.message || 'Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />

      {/* Camera Modal */}
      <Modal visible={cameraVisible} animationType="slide" onRequestClose={() => setCameraVisible(false)}>
        <View style={styles.cameraContainer}>
          {permission?.granted && (
            <CameraView ref={cameraRef} style={styles.camera} facing="front">
              <SafeAreaView edges={['top']} style={styles.cameraHeader}>
                <TouchableOpacity onPress={() => setCameraVisible(false)} style={styles.cameraCloseBtn}>
                  <MaterialIcons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </SafeAreaView>
              <View style={styles.cameraGuide}>
                <View style={styles.faceOutline} />
                <Text style={styles.cameraHint}>Look straight at the camera</Text>
              </View>
              <View style={styles.cameraFooter}>
                <TouchableOpacity onPress={takePictureForEnroll} style={styles.captureBtn} disabled={loading !== null}>
                  {loading === 'face'
                    ? <ActivityIndicator color="#000" size="large" />
                    : <MaterialIcons name="camera" size={36} color="#000" />}
                </TouchableOpacity>
              </View>
            </CameraView>
          )}
        </View>
      </Modal>

      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.headerBg }}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => (step > 0 ? setStep(s => s - 1) : router.back())}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Create Account</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.stepRow}>
            {STEPS.map((label, i) => (
              <View key={label} style={styles.stepItem}>
                <Text style={[styles.stepLabel, {
                  color: i <= step ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                  fontWeight: i === step ? '700' : '500',
                }]}>
                  {label}
                </Text>
                <View style={[styles.stepLine, {
                  backgroundColor: i < step
                    ? 'rgba(255,255,255,0.6)'
                    : i === step ? '#FFFFFF' : 'rgba(255,255,255,0.2)',
                }]} />
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={[styles.formSheet, { backgroundColor: theme.surface }]}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── STEP 0: Account info ── */}
          {step === 0 && (
            <>
              <Text style={[styles.stepHeading, { color: theme.text }]}>Your details</Text>
              <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
                No password needed — you'll sign in with your face, fingerprint, or Google.
              </Text>

              {/* Name row */}
              <View style={styles.nameRow}>
                <View style={[styles.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border, flex: 1 }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="First name"
                    placeholderTextColor={theme.textMuted}
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                  />
                </View>
                <View style={{ width: 10 }} />
                <View style={[styles.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border, flex: 1 }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Last name"
                    placeholderTextColor={theme.textMuted}
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Email */}
              <View style={[styles.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <MaterialIcons name="email" size={18} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Email address"
                  placeholderTextColor={theme.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Phone */}
              <View style={[styles.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <MaterialIcons name="phone" size={18} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Phone number"
                  placeholderTextColor={theme.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Info box */}
              <View style={[styles.infoBox, {
                backgroundColor: theme.primaryBg,
                borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(123,92,240,0.15)',
              }]}>
                <View style={[styles.infoIconWrap, { backgroundColor: theme.buttonBg }]}>
                  <MaterialIcons name="security" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoTitle, { color: theme.text }]}>Passwordless Security</Text>
                  <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
                    Your account is protected by biometric authentication — no password to forget or steal.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.buttonBg }]}
                activeOpacity={0.85}
                onPress={handleNext}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
                <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </>
          )}

          {/* ── STEP 1: Set up sign-in method ── */}
          {step === 1 && (
            <>
              <Text style={[styles.stepHeading, { color: theme.text }]}>Set up sign-in</Text>
              <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
                Choose how you'll sign in. You can set up multiple methods later.
              </Text>

              {/* Face Recognition */}
              <TouchableOpacity
                style={[styles.authBtn, { backgroundColor: theme.buttonBg }]}
                activeOpacity={0.85}
                onPress={handleFaceRegister}
                disabled={loading !== null || done}
              >
                {loading === 'face' ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : done ? (
                  <MaterialIcons name="check-circle" size={26} color="#FFFFFF" />
                ) : (
                  <MaterialIcons name="face" size={26} color="#FFFFFF" />
                )}
                <View style={styles.btnTextCol}>
                  <Text style={styles.authBtnTitle}>Register Face</Text>
                  <Text style={styles.authBtnSub}>Our own face recognition — works on any device</Text>
                </View>
                {!done && <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.6)" />}
              </TouchableOpacity>

              {/* Fingerprint */}
              <TouchableOpacity
                style={[styles.authBtn, { backgroundColor: theme.inputBg, borderWidth: 1, borderColor: theme.border }]}
                activeOpacity={0.85}
                onPress={handleFingerprint}
                disabled={loading !== null || done}
              >
                {loading === 'fingerprint' ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : done ? (
                  <MaterialIcons name="check-circle" size={26} color={theme.primary} />
                ) : (
                  <MaterialIcons name="fingerprint" size={26} color={theme.primary} />
                )}
                <View style={styles.btnTextCol}>
                  <Text style={[styles.authBtnTitle, { color: theme.text }]}>Register Fingerprint</Text>
                  <Text style={[styles.authBtnSub, { color: theme.textSecondary }]}>Sign in with touch sensor</Text>
                </View>
                {!done && <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <Text style={[styles.dividerText, { color: theme.textMuted }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>

              {/* Google */}
              <TouchableOpacity
                style={[styles.googleBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                activeOpacity={0.8}
                onPress={handleGoogle}
                disabled={loading !== null}
              >
                {loading === 'google' ? (
                  <ActivityIndicator color={theme.text} size="small" />
                ) : (
                  <MaterialIcons name="language" size={20} color={theme.text} />
                )}
                <Text style={[styles.googleBtnText, { color: theme.text }]}>Sign up with Google</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.loginRow}>
            <Text style={[styles.loginPrompt, { color: theme.textSecondary }]}>Have an account?{' '}</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')} activeOpacity={0.7}>
              <Text style={[styles.loginLink, { color: theme.buttonBg }]}>Sign in</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  stepRow: { flexDirection: 'row', gap: 8 },
  stepItem: { flex: 1, alignItems: 'center', gap: 8 },
  stepLabel: { fontSize: 10, letterSpacing: 0.8 },
  stepLine: { width: '100%', height: 3, borderRadius: 2 },

  formSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  formContent: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40, flexGrow: 1 },

  stepHeading: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  stepDesc: { fontSize: 14, lineHeight: 20, marginBottom: 24 },

  nameRow: { flexDirection: 'row', marginBottom: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 54, marginBottom: 14 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular' },

  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1 },
  infoIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  infoDesc: { fontSize: 13, lineHeight: 19 },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 16, shadowColor: '#2D336B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 6 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  authBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, gap: 14 },
  btnTextCol: { flex: 1 },
  authBtnTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  authBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },

  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 14, gap: 10, borderWidth: 1, marginBottom: 28 },
  googleBtnText: { fontSize: 15, fontWeight: '600' },

  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  loginPrompt: { fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '700' },

  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: 'flex-end',
  },
  cameraCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraGuide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceOutline: {
    width: 220,
    height: 280,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  cameraHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '500',
  },
  cameraFooter: {
    alignItems: 'center',
    paddingBottom: 50,
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
});
