import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, Alert, Modal, Animated, Easing, Dimensions,
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
  googleAuthClient,
  faceIdentify,
} from '@/services/client-auth.service';
import { FadeInView } from '@/components/fade-in-view';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const OVAL_W = 224;
const OVAL_H = 288;
const MESH_ROWS = 8;
const MESH_COLS = 7;

type ScanState = 'idle' | 'scanning' | 'success' | 'failed';

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
            <View
              key={col}
              style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }}
            />
          ))}
        </Animated.View>
      ))}
    </View>
  );
}

// ── Face scanner overlay ──────────────────────────────────────────────────
function FaceScanner({
  onClose,
  onIdentified,
}: {
  onClose: () => void;
  onIdentified: () => void;
}) {
  const cameraRef    = useRef<CameraView>(null);
  const scanLine     = useRef(new Animated.Value(0)).current;
  const borderPulse  = useRef(new Animated.Value(1)).current;
  const lineLoop     = useRef<Animated.CompositeAnimation | null>(null);
  const pulseLoop    = useRef<Animated.CompositeAnimation | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [noFace, setNoFace]       = useState(false);
  const scanRef  = useRef<ScanState>('idle');
  const noFaceRef = useRef(false);

  const setScan = (s: ScanState) => { scanRef.current = s; setScanState(s); };
  const setNF   = (v: boolean)   => { noFaceRef.current = v; setNoFace(v); };

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
    if (scanState === 'scanning') {
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
  }, [scanState]);

  const scheduleCapture = () => {
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureTimer.current = setTimeout(() => {
      if (scanRef.current === 'idle') capture();
    }, 1800);
  };

  const capture = async () => {
    if (!cameraRef.current || scanRef.current !== 'idle') return;
    setNF(false);
    setScan('scanning');
    lineLoop.current?.stop();

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75, skipMetadata: true });
      if (!photo?.uri) throw new Error('No photo captured');

      await faceIdentify(photo.uri);

      setScan('success');
      setTimeout(onIdentified, 900);
    } catch (err: any) {
      const msg: string = err?.response?.data?.message || err?.message || '';
      const isNoFace = msg.toLowerCase().includes('no face') || msg.toLowerCase().includes('not detected');

      if (isNoFace) {
        setNF(true);
        setScan('idle');
        startSweep();
        captureTimer.current = setTimeout(() => {
          if (scanRef.current === 'idle') { setNF(false); capture(); }
        }, 2500);
      } else {
        setScan('failed');
        setTimeout(() => { setScan('idle'); startSweep(); scheduleCapture(); }, 2000);
      }
    }
  };

  const ovalColor =
    scanState === 'success'  ? '#22c55e' :
    scanState === 'failed'   ? '#ef4444' :
    scanState === 'scanning' ? '#60a5fa' :
    noFace ? 'rgba(251,191,36,0.85)' :
    'rgba(255,255,255,0.65)';

  const meshColor =
    scanState === 'success' ? '#22c55e' : '#60a5fa';

  const statusMsg =
    scanState === 'success'  ? 'Face recognised!' :
    scanState === 'failed'   ? 'Not recognised — try again' :
    scanState === 'scanning' ? 'Analysing…' :
    noFace ? "We can't see your face" :
    'Position your face in the oval';

  const hintMsg =
    noFace ? 'Move closer or improve lighting' : 'Scanning automatically…';

  const scanLineY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, OVAL_H - 2] });
  const showMesh  = scanState === 'scanning' || scanState === 'success';
  const showLine  = !showMesh && scanState !== 'failed';

  return (
    <View style={sf.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="front" />

      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <View style={sf.overlay} pointerEvents="none" />

        <SafeAreaView edges={['top']} style={sf.topBar}>
          <TouchableOpacity style={sf.closeBtn} onPress={onClose}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={sf.title}>ABY Face ID</Text>
          <View style={{ width: 44 }} />
        </SafeAreaView>

        <View style={sf.ovalWrap} pointerEvents="none">
          <Animated.View style={[sf.oval, {
            borderColor: ovalColor,
            opacity: scanState === 'scanning' ? borderPulse : 1,
          }]}>
            {/* Mesh overlay when scanning or success */}
            <FaceMesh visible={showMesh} color={meshColor} />

            {/* Sweep line when idle / no-face */}
            {showLine && (
              <Animated.View style={[sf.line, {
                transform: [{ translateY: scanLineY }],
                backgroundColor: noFace
                  ? 'rgba(251,191,36,0.6)'
                  : 'rgba(255,255,255,0.35)',
              }]} />
            )}

            {scanState === 'success' && (
              <View style={sf.iconOverlay}>
                <MaterialIcons name="check-circle" size={72} color="#22c55e" />
              </View>
            )}
            {scanState === 'failed' && (
              <View style={sf.iconOverlay}>
                <MaterialIcons name="cancel" size={72} color="#ef4444" />
              </View>
            )}
            {noFace && scanState === 'idle' && (
              <View style={sf.iconOverlay}>
                <MaterialIcons name="face-retouching-off" size={54} color="rgba(251,191,36,0.9)" />
              </View>
            )}
          </Animated.View>

          {/* Corner markers */}
          <View style={[sf.corner, { top: -3, left: -3 }, sf.cornerTL, { borderColor: ovalColor }]} />
          <View style={[sf.corner, { top: -3, right: -3 }, sf.cornerTR, { borderColor: ovalColor }]} />
          <View style={[sf.corner, { bottom: -3, left: -3 }, sf.cornerBL, { borderColor: ovalColor }]} />
          <View style={[sf.corner, { bottom: -3, right: -3 }, sf.cornerBR, { borderColor: ovalColor }]} />
        </View>

        <View style={sf.statusWrap} pointerEvents="none">
          {scanState === 'scanning' && (
            <ActivityIndicator color="#60a5fa" size="small" style={{ marginBottom: 8 }} />
          )}
          <Text style={[sf.statusText, {
            color: scanState === 'success' ? '#22c55e' :
                   scanState === 'failed'  ? '#ef4444' :
                   noFace ? '#FBBF24' : '#ffffff',
          }]}>
            {statusMsg}
          </Text>
          {(scanState === 'idle') && (
            <Text style={[sf.hintText, noFace ? { color: 'rgba(251,191,36,0.7)' } : {}]}>
              {hintMsg}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Login screen ──────────────────────────────────────────────────────────
export default function LoginScreen() {
  const theme = useAppTheme();
  const [loading, setLoading]            = useState<'google' | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [permission, requestPermission]  = useCameraPermissions();

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '936996911068-a2e2v1jjq9c7hmotp339l1spqe75g102.apps.googleusercontent.com',
      offlineAccess: true,
    });
  }, []);

  const handleGoogle = async () => {
    setLoading('google');
    try {
      await GoogleSignin.hasPlayServices();
      try { await GoogleSignin.signOut(); } catch {}
      const response = await GoogleSignin.signIn();
      const idToken  = response.data?.idToken;
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

  return (
    <View style={[s.root, { backgroundColor: theme.headerBg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />

      <Modal visible={cameraVisible} animationType="slide" onRequestClose={() => setCameraVisible(false)}>
        <FaceScanner
          onClose={() => setCameraVisible(false)}
          onIdentified={() => { setCameraVisible(false); router.replace('/(dashboard)'); }}
        />
      </Modal>

      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.headerBg }}>
        <FadeInView delay={60} slideFrom="top" distance={16}>
          <View style={s.header}>
            <View style={[s.logoWrap, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <MaterialIcons name="account-balance-wallet" size={28} color="#FFFFFF" />
            </View>
            <Text style={s.headerTitle}>Welcome back</Text>
            <Text style={s.headerSub}>Sign in to ABY Expense</Text>
          </View>
        </FadeInView>
      </SafeAreaView>

      <View style={[s.sheet, { backgroundColor: theme.surface }]}>
        <View style={s.content}>
          <FadeInView delay={120} slideFrom="bottom" distance={20}>
            <Text style={[s.sheetTitle, { color: theme.text }]}>Choose sign-in method</Text>
            <Text style={[s.sheetSub, { color: theme.textSecondary }]}>
              Quick and secure — no password needed
            </Text>
          </FadeInView>

          <FadeInView delay={200} slideFrom="bottom" distance={20}>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: theme.buttonBg }]}
              activeOpacity={0.85}
              onPress={handleFaceLogin}
              disabled={loading !== null}
            >
              <MaterialIcons name="face" size={26} color="#FFFFFF" />
              <View style={s.btnText}>
                <Text style={s.btnTitle}>Face Recognition</Text>
                <Text style={s.btnSub}>Auto-scans your face to sign in</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </FadeInView>

          <FadeInView delay={280} slideFrom="none">
            <View style={s.divider}>
              <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[s.dividerText, { color: theme.textMuted }]}>or</Text>
              <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
            </View>
          </FadeInView>

          <FadeInView delay={340} slideFrom="bottom" distance={20}>
            <TouchableOpacity
              style={[s.googleBtn, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
              activeOpacity={0.8}
              onPress={handleGoogle}
              disabled={loading !== null}
            >
              {loading === 'google'
                ? <ActivityIndicator color={theme.text} size="small" />
                : <MaterialIcons name="language" size={22} color={theme.text} />}
              <Text style={[s.googleText, { color: theme.text }]}>Continue with Google</Text>
            </TouchableOpacity>
          </FadeInView>

          <FadeInView delay={420} slideFrom="none">
            <View style={s.signupRow}>
              <Text style={[s.signupPrompt, { color: theme.textSecondary }]}>Don't have an account?{' '}</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')} activeOpacity={0.7}>
                <Text style={[s.signupLink, { color: theme.buttonBg }]}>Sign up</Text>
              </TouchableOpacity>
            </View>
          </FadeInView>
        </View>
      </View>
    </View>
  );
}

// ── Scanner StyleSheet ────────────────────────────────────────────────────
const sf = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8,
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },

  ovalWrap: {
    position: 'absolute',
    top: (SCREEN_H - OVAL_H) / 2 - 20,
    left: (SCREEN_W - OVAL_W) / 2,
    width: OVAL_W,
    height: OVAL_H,
  },
  oval: {
    width: OVAL_W, height: OVAL_H,
    borderRadius: OVAL_W / 2,
    borderWidth: 2.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { position: 'absolute', left: 0, right: 0, height: 2, top: 0 },

  corner: { position: 'absolute', width: 30, height: 30 },
  cornerTL: { borderTopWidth: 3, borderLeftWidth: 3,  borderTopLeftRadius: 14 },
  cornerTR: { borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 },
  cornerBL: { borderBottomWidth: 3, borderLeftWidth: 3,  borderBottomLeftRadius: 14 },
  cornerBR: { borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 },

  statusWrap: {
    position: 'absolute', bottom: 100,
    left: 0, right: 0, alignItems: 'center',
  },
  statusText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  hintText:   { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
});

// ── Login screen StyleSheet ───────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  header: { paddingHorizontal: 28, paddingTop: 16, paddingBottom: 36 },
  logoWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  headerSub:   { fontSize: 15, color: 'rgba(255,255,255,0.55)' },

  sheet:   { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  content: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40 },

  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  sheetSub:   { fontSize: 14, marginBottom: 20 },

  btn: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 12, gap: 14,
  },
  btnText:  { flex: 1 },
  btnTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  btnSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  divider:     { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, gap: 10, borderWidth: 1, marginBottom: 28,
  },
  googleText: { fontSize: 15, fontWeight: '600' },

  signupRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signupPrompt: { fontSize: 14 },
  signupLink:   { fontSize: 14, fontWeight: '700' },
});
