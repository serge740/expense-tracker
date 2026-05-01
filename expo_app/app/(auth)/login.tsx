import React, { useState, useEffect, useRef } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar,
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
  getToken,
  googleAuthClient,
  faceIdentify,
} from '@/services/client-auth.service';

export default function LoginScreen() {
  const theme = useAppTheme();
  const [loading, setLoading] = useState<'face' | 'fingerprint' | 'google' | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '936996911068-a2e2v1jjq9c7hmotp339l1spqe75g102.apps.googleusercontent.com',
      offlineAccess: true,
    });
  }, []);

  // ── Fingerprint ───────────────────────────────────────────────────────────
  const handleFingerprint = async () => {
    setLoading('fingerprint');
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !enrolled) {
        Alert.alert('Not Available', 'Fingerprint is not set up on this device. Please enable it in Settings.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Place your finger to sign in',
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        const token = await getToken();
        if (!token) {
          Alert.alert('No account found', 'Please register an account first.');
          router.replace('/(auth)/register');
          return;
        }
        router.replace('/(dashboard)');
      } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        Alert.alert('Authentication Failed', 'Could not verify your identity. Please try again.');
      }
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
      await googleAuthClient(idToken);
      router.replace('/(dashboard)');
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (error.code === statusCodes.IN_PROGRESS) return;
      Alert.alert('Google Sign-In Failed', error.message || 'Please try again.');
    } finally {
      setLoading(null);
    }
  };

  // ── Face Recognition ──────────────────────────────────────────────────────
  const handleFaceLogin = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Camera Permission', 'Camera access is required for face recognition.');
        return;
      }
    }
    setCameraVisible(true);
  };

  const takePictureForLogin = async () => {
    if (!cameraRef.current) return;
    setLoading('face');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setCameraVisible(false);
      if (!photo?.uri) throw new Error('Failed to capture photo');
      await faceIdentify(photo.uri);
      router.replace('/(dashboard)');
    } catch (error: any) {
      setCameraVisible(false);
      Alert.alert(
        'Face Not Recognised',
        error?.response?.data?.message || error.message || 'Could not verify your face. Please try again.',
      );
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
                <Text style={styles.cameraHint}>Position your face in the oval</Text>
              </View>
              <View style={styles.cameraFooter}>
                <TouchableOpacity onPress={takePictureForLogin} style={styles.captureBtn} disabled={loading !== null}>
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
          <View style={[styles.logoWrap, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <MaterialIcons name="account-balance-wallet" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.headerTitle}>Welcome back</Text>
          <Text style={styles.headerSubtitle}>Sign in to ABY Expense</Text>
        </View>
      </SafeAreaView>

      {/* Form sheet */}
      <View style={[styles.formSheet, { backgroundColor: theme.surface }]}>
        <View style={styles.formContent}>

          <Text style={[styles.sheetTitle, { color: theme.text }]}>Choose sign-in method</Text>
          <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>
            Quick and secure — no password needed
          </Text>

          {/* Face Recognition */}
          <TouchableOpacity
            style={[styles.authBtn, { backgroundColor: theme.buttonBg }]}
            activeOpacity={0.85}
            onPress={handleFaceLogin}
            disabled={loading !== null}
          >
            {loading === 'face' ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <MaterialIcons name="face" size={26} color="#FFFFFF" />
            )}
            <View style={styles.btnTextCol}>
              <Text style={styles.authBtnTitle}>Face Recognition</Text>
              <Text style={styles.authBtnSub}>Scan your face to sign in</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>

          {/* Fingerprint */}
          <TouchableOpacity
            style={[styles.authBtn, { backgroundColor: theme.inputBg, borderWidth: 1, borderColor: theme.border }]}
            activeOpacity={0.85}
            onPress={handleFingerprint}
            disabled={loading !== null}
          >
            {loading === 'fingerprint' ? (
              <ActivityIndicator color={theme.primary} size="small" />
            ) : (
              <MaterialIcons name="fingerprint" size={26} color={theme.primary} />
            )}
            <View style={styles.btnTextCol}>
              <Text style={[styles.authBtnTitle, { color: theme.text }]}>Fingerprint</Text>
              <Text style={[styles.authBtnSub, { color: theme.textSecondary }]}>Touch sensor to sign in</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
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
              <MaterialIcons name="language" size={22} color={theme.text} />
            )}
            <Text style={[styles.googleBtnText, { color: theme.text }]}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={[styles.signupPrompt, { color: theme.textSecondary }]}>
              Don't have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')} activeOpacity={0.7}>
              <Text style={[styles.signupLink, { color: theme.buttonBg }]}>Sign up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 36,
  },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
  },

  formSheet: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  formContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },

  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  sheetSub: { fontSize: 14, marginBottom: 20 },

  authBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    gap: 14,
  },
  btnTextCol: { flex: 1 },
  authBtnTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  authBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 10,
    borderWidth: 1,
    marginBottom: 28,
  },
  googleBtnText: { fontSize: 15, fontWeight: '600' },

  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupPrompt: { fontSize: 14 },
  signupLink: { fontSize: 14, fontWeight: '700' },

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
