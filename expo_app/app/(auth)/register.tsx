import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, Modal, Animated, Easing, Dimensions,
} from 'react-native';
import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  registerClient,
  googleAuthClient,
  enrollFace,
} from '@/services/client-auth.service';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const OVAL_W = 224;
const OVAL_H = 288;
const MESH_ROWS = 8;
const MESH_COLS = 7;

type EnrollState = 'idle' | 'scanning' | 'success' | 'failed';
const STEPS = ['ACCOUNT', 'SECURITY'];

// ── Animated face mesh grid ───────────────────────────────────────────────
function FaceMesh({ visible, color }: { visible: boolean; color: string }) {
  const rowAnims = useRef(
    Array.from({ length: MESH_ROWS }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (!visible) {
      rowAnims.forEach(a => a.setValue(0));
      return;
    }
    const loops = rowAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 100),
          Animated.timing(anim, { toValue: 0.6, duration: 350, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.1, duration: 350, useNativeDriver: true }),
          Animated.delay(Math.max(0, (MESH_ROWS - i) * 100)),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [visible]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {rowAnims.map((anim, row) => (
        <Animated.View
          key={row}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
            opacity: anim,
          }}
        >
          {Array.from({ length: MESH_COLS }, (_, col) => (
            <View key={col} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
          ))}
        </Animated.View>
      ))}
    </View>
  );
}

// ── Face enroll scanner ───────────────────────────────────────────────────
function FaceEnrollScanner({
  onClose,
  onEnrolled,
}: {
  onClose: () => void;
  onEnrolled: (imageUri: string) => void;
}) {
  const cameraRef    = useRef<CameraView>(null);
  const scanLine     = useRef(new Animated.Value(0)).current;
  const borderPulse  = useRef(new Animated.Value(1)).current;
  const lineLoop     = useRef<Animated.CompositeAnimation | null>(null);
  const pulseLoop    = useRef<Animated.CompositeAnimation | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<EnrollState>('idle');
  const [noFace, setNoFace] = useState(false);
  const stateRef  = useRef<EnrollState>('idle');
  const noFaceRef = useRef(false);

  const setS  = (s: EnrollState) => { stateRef.current = s; setState(s); };
  const setNF = (v: boolean)      => { noFaceRef.current = v; setNoFace(v); };

  const startSweep = useCallback(() => {
    lineLoop.current?.stop();
    scanLine.setValue(0);
    lineLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    lineLoop.current.start();
  }, [scanLine]);

  useEffect(() => {
    startSweep();
    scheduleCapture();
    return () => {
      lineLoop.current?.stop();
      pulseLoop.current?.stop();
      if (captureTimer.current) clearTimeout(captureTimer.current);
    };
  }, []);

  useEffect(() => {
    pulseLoop.current?.stop();
    if (state === 'scanning') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(borderPulse, { toValue: 0.3, duration: 500, useNativeDriver: false }),
          Animated.timing(borderPulse, { toValue: 1, duration: 500, useNativeDriver: false }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      borderPulse.setValue(1);
    }
  }, [state]);

  const scheduleCapture = () => {
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureTimer.current = setTimeout(() => {
      if (stateRef.current === 'idle') capture();
    }, 1800);
  };

  const capture = async () => {
    if (!cameraRef.current || stateRef.current !== 'idle') return;
    setNF(false);
    setS('scanning');
    lineLoop.current?.stop();
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipMetadata: true });
      if (!photo?.uri) throw new Error('No photo');
      setS('success');
      setTimeout(() => onEnrolled(photo.uri), 700);
    } catch (err: any) {
      const msg: string = err?.message || '';
      // If capture itself failed (not a backend "no face") — treat as no face so UI shows helpful message
      setNF(true);
      setS('idle');
      startSweep();
      captureTimer.current = setTimeout(() => {
        if (stateRef.current === 'idle') { setNF(false); capture(); }
      }, 2500);
    }
  };

  const color =
    state === 'success'  ? '#22c55e' :
    state === 'failed'   ? '#ef4444' :
    state === 'scanning' ? '#60a5fa' :
    noFace ? 'rgba(251,191,36,0.85)' : 'rgba(255,255,255,0.65)';

  const meshColor = state === 'success' ? '#22c55e' : '#60a5fa';

  const statusMsg =
    state === 'success'  ? 'Face captured!' :
    state === 'failed'   ? 'Capture failed — retrying…' :
    state === 'scanning' ? 'Hold still…' :
    noFace ? "We can't see your face" : 'Position your face in the oval';

  const hintMsg = noFace ? 'Move closer or improve lighting' : 'Scanning automatically…';
  const lineY   = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, OVAL_H - 2] });
  const showMesh = state === 'scanning' || state === 'success';
  const showLine = !showMesh && state !== 'failed';

  return (
    <View style={ef.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="front" />

      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <View style={ef.overlay} pointerEvents="none" />

        <SafeAreaView edges={['top']} style={ef.topBar}>
          <TouchableOpacity style={ef.closeBtn} onPress={onClose}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={ef.title}>Register Face</Text>
          <View style={{ width: 44 }} />
        </SafeAreaView>

        <View style={ef.ovalWrap} pointerEvents="none">
          <Animated.View style={[ef.oval, { borderColor: color, opacity: state === 'scanning' ? borderPulse : 1 }]}>
            <FaceMesh visible={showMesh} color={meshColor} />

            {showLine && (
              <Animated.View style={[ef.line, {
                transform: [{ translateY: lineY }],
                backgroundColor: noFace ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.35)',
              }]} />
            )}

            {state === 'success' && (
              <View style={ef.iconOverlay}>
                <MaterialIcons name="check-circle" size={72} color="#22c55e" />
              </View>
            )}
            {state === 'failed' && (
              <View style={ef.iconOverlay}>
                <MaterialIcons name="cancel" size={72} color="#ef4444" />
              </View>
            )}
            {noFace && state === 'idle' && (
              <View style={ef.iconOverlay}>
                <MaterialIcons name="face-retouching-off" size={54} color="rgba(251,191,36,0.9)" />
              </View>
            )}
          </Animated.View>

          <View style={[ef.corner, { top: -3, left:  -3 }, ef.cTL, { borderColor: color }]} />
          <View style={[ef.corner, { top: -3, right: -3 }, ef.cTR, { borderColor: color }]} />
          <View style={[ef.corner, { bottom: -3, left:  -3 }, ef.cBL, { borderColor: color }]} />
          <View style={[ef.corner, { bottom: -3, right: -3 }, ef.cBR, { borderColor: color }]} />
        </View>

        <View style={ef.statusWrap} pointerEvents="none">
          {state === 'scanning' && <ActivityIndicator color="#60a5fa" size="small" style={{ marginBottom: 8 }} />}
          <Text style={[ef.statusText, {
            color: state === 'success' ? '#22c55e' :
                   state === 'failed'  ? '#ef4444' :
                   noFace ? '#FBBF24' : '#ffffff',
          }]}>
            {statusMsg}
          </Text>
          {state === 'idle' && (
            <Text style={[ef.hintText, noFace ? { color: 'rgba(251,191,36,0.7)' } : {}]}>
              {hintMsg}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Register screen ───────────────────────────────────────────────────────
export default function RegisterScreen() {
  const theme = useAppTheme();
  const [step, setStep]                   = useState(0);
  const [firstName, setFirstName]         = useState('');
  const [lastName,  setLastName]          = useState('');
  const [email,     setEmail]             = useState('');
  const [phone,     setPhone]             = useState('');
  const [loading,   setLoading]           = useState<'face' | 'google' | 'next' | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [permission, requestPermission]   = useCameraPermissions();

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '936996911068-a2e2v1jjq9c7hmotp339l1spqe75g102.apps.googleusercontent.com',
      offlineAccess: true,
    });
  }, []);

  // ── Step 0: submit account info → register + proceed to security ────────
  const handleNext = async () => {
    if (!firstName.trim() || !email.trim() || !phone.trim()) {
      Alert.alert('Required', 'Please enter your name, email, and phone number.');
      return;
    }
    setLoading('next');
    try {
      await registerClient({ firstName, lastName, email, phone });
      setStep(1);
    } catch (error: any) {
      Alert.alert('Registration Failed', error?.response?.data?.message || error.message || 'Please try again.');
    } finally {
      setLoading(null);
    }
  };

  // ── Step 1: face enroll ─────────────────────────────────────────────────
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

  const handleFaceCaptured = async (imageUri: string) => {
    setCameraVisible(false);
    setLoading('face');
    try {
      await enrollFace(imageUri);
      router.replace('/(dashboard)');
    } catch (error: any) {
      Alert.alert('Face Enrollment Failed', error?.response?.data?.message || error.message || 'Please try again.');
    } finally {
      setLoading(null);
    }
  };

  // ── Step 2: Google ──────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setLoading('google');
    try {
      await GoogleSignin.hasPlayServices();
      try { await GoogleSignin.signOut(); } catch {}
      const response = await GoogleSignin.signIn();
      const idToken  = response.data?.idToken;
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
    <View style={[rs.root, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />

      <Modal visible={cameraVisible} animationType="slide" onRequestClose={() => setCameraVisible(false)}>
        <FaceEnrollScanner onClose={() => setCameraVisible(false)} onEnrolled={handleFaceCaptured} />
      </Modal>

      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.headerBg }}>
        <View style={rs.header}>
          <View style={rs.topRow}>
            <TouchableOpacity
              style={rs.backBtn}
              onPress={() => (step > 0 ? setStep(s => s - 1) : router.back())}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={rs.headerTitle}>Create Account</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={rs.stepRow}>
            {STEPS.map((label, i) => (
              <View key={label} style={rs.stepItem}>
                <Text style={[rs.stepLabel, {
                  color: i <= step ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                  fontWeight: i === step ? '700' : '500',
                }]}>
                  {label}
                </Text>
                <View style={[rs.stepLine, {
                  backgroundColor: i < step ? 'rgba(255,255,255,0.6)' : i === step ? '#FFFFFF' : 'rgba(255,255,255,0.2)',
                }]} />
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={[rs.sheet, { backgroundColor: theme.surface }]}
          contentContainerStyle={rs.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── STEP 0: Account info ─── */}
          {step === 0 && (
            <>
              <Text style={[rs.heading, { color: theme.text }]}>Your details</Text>
              <Text style={[rs.desc, { color: theme.textSecondary }]}>
                No password needed — you'll sign in with your face or Google.
              </Text>

              <View style={rs.nameRow}>
                <View style={[rs.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border, flex: 1 }]}>
                  <TextInput style={[rs.input, { color: theme.text }]} placeholder="First name" placeholderTextColor={theme.textMuted} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
                </View>
                <View style={{ width: 10 }} />
                <View style={[rs.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border, flex: 1 }]}>
                  <TextInput style={[rs.input, { color: theme.text }]} placeholder="Last name" placeholderTextColor={theme.textMuted} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
                </View>
              </View>

              <View style={[rs.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <MaterialIcons name="email" size={18} color={theme.textMuted} style={rs.icon} />
                <TextInput style={[rs.input, { color: theme.text }]} placeholder="Email address" placeholderTextColor={theme.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              </View>

              <View style={[rs.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <MaterialIcons name="phone" size={18} color={theme.textMuted} style={rs.icon} />
                <TextInput style={[rs.input, { color: theme.text }]} placeholder="Phone number" placeholderTextColor={theme.textMuted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" autoCorrect={false} />
              </View>

              <View style={[rs.infoBox, { backgroundColor: theme.primaryBg, borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(123,92,240,0.15)' }]}>
                <View style={[rs.infoIcon, { backgroundColor: theme.buttonBg }]}>
                  <MaterialIcons name="security" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[rs.infoTitle, { color: theme.text }]}>Passwordless Security</Text>
                  <Text style={[rs.infoDesc, { color: theme.textSecondary }]}>Your account is protected by face recognition — no password to forget or steal.</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[rs.primaryBtn, { backgroundColor: theme.buttonBg }]}
                activeOpacity={0.85}
                onPress={handleNext}
                disabled={loading === 'next'}
              >
                {loading === 'next'
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Text style={rs.primaryBtnText}>Continue</Text>
                      <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
                    </>
                }
              </TouchableOpacity>
            </>
          )}

          {/* ── STEP 1: Auth method ─── */}
          {step === 1 && (
            <>
              <Text style={[rs.heading, { color: theme.text }]}>Set up sign-in</Text>
              <Text style={[rs.desc, { color: theme.textSecondary }]}>
                Choose how you'll sign in to your account.
              </Text>

              <TouchableOpacity
                style={[rs.authBtn, { backgroundColor: theme.buttonBg }]}
                activeOpacity={0.85}
                onPress={handleFaceRegister}
                disabled={loading !== null}
              >
                {loading === 'face'
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <MaterialIcons name="face" size={26} color="#FFFFFF" />}
                <View style={rs.btnText}>
                  <Text style={rs.authTitle}>Register Face</Text>
                  <Text style={rs.authSub}>Auto-scan — works on any device</Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>

              <View style={rs.divider}>
                <View style={[rs.dividerLine, { backgroundColor: theme.border }]} />
                <Text style={[rs.dividerText, { color: theme.textMuted }]}>or</Text>
                <View style={[rs.dividerLine, { backgroundColor: theme.border }]} />
              </View>

              <TouchableOpacity
                style={[rs.googleBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
                activeOpacity={0.8}
                onPress={handleGoogle}
                disabled={loading !== null}
              >
                {loading === 'google'
                  ? <ActivityIndicator color={theme.text} size="small" />
                  : <MaterialIcons name="language" size={20} color={theme.text} />}
                <Text style={[rs.googleText, { color: theme.text }]}>Sign up with Google</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={rs.loginRow}>
            <Text style={[rs.loginPrompt, { color: theme.textSecondary }]}>Have an account?{' '}</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')} activeOpacity={0.7}>
              <Text style={[rs.loginLink, { color: theme.buttonBg }]}>Sign in</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Enroll scanner styles ─────────────────────────────────────────────────
const ef = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  topBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  closeBtn:{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  title:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  ovalWrap:{ position: 'absolute', top: (SCREEN_H - OVAL_H) / 2 - 20, left: (SCREEN_W - OVAL_W) / 2, width: OVAL_W, height: OVAL_H },
  oval:    { width: OVAL_W, height: OVAL_H, borderRadius: OVAL_W / 2, borderWidth: 2.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  iconOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  line:    { position: 'absolute', left: 0, right: 0, height: 2, top: 0 },
  corner:  { position: 'absolute', width: 30, height: 30 },
  cTL:     { borderTopWidth: 3, borderLeftWidth: 3,   borderTopLeftRadius: 14 },
  cTR:     { borderTopWidth: 3, borderRightWidth: 3,  borderTopRightRadius: 14 },
  cBL:     { borderBottomWidth: 3, borderLeftWidth: 3,  borderBottomLeftRadius: 14 },
  cBR:     { borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 },
  statusWrap: { position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center' },
  statusText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  hintText:   { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
});

// ── Register screen styles ────────────────────────────────────────────────
const rs = StyleSheet.create({
  root: { flex: 1 },
  header:    { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 },
  topRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backBtn:   { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  stepRow:   { flexDirection: 'row', gap: 8 },
  stepItem:  { flex: 1, alignItems: 'center', gap: 8 },
  stepLabel: { fontSize: 10, letterSpacing: 0.8 },
  stepLine:  { width: '100%', height: 3, borderRadius: 2 },
  sheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  content:   { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40, flexGrow: 1 },
  heading:   { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  desc:      { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  nameRow:   { flexDirection: 'row', marginBottom: 14 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 54, marginBottom: 14 },
  icon:      { marginRight: 10 },
  input:     { flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular' },
  infoBox:   { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1 },
  infoIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  infoDesc:  { fontSize: 13, lineHeight: 19 },
  primaryBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 16, elevation: 6 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  authBtn:   { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, gap: 14 },
  btnText:   { flex: 1 },
  authTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  authSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  divider:   { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 14, gap: 10, borderWidth: 1, marginBottom: 28 },
  googleText:{ fontSize: 15, fontWeight: '600' },
  loginRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  loginPrompt:{ fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '700' },
});
