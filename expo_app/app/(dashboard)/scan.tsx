import React, { useState, useRef, useCallback } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar,
  Animated, Easing, Image, Alert, ScrollView, Dimensions,
} from 'react-native';
import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { router, useFocusEffect } from 'expo-router';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { processReceipt, ProcessedReceipt } from '@/services/receipts.service';
import { CATEGORY_ICON, CATEGORY_LABEL } from '@/services/transaction.service';

type Phase = 'aligning' | 'capturing' | 'analyzing' | 'result';

const BRAND   = '#00627F';
const BRACKET = '#5B6AD4';
const GOLD    = '#FBBF24';
const SUCCESS = '#4ADE80';

const AUTO_CAPTURE_MS = 3400;
const MIN_ANALYSIS_MS = 2600;
const SHEET_HEIGHT     = Dimensions.get('window').height * 0.72;
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CAT_COLOR: Record<string, string> = {
  food: '#FF8C42', transport: '#60A5FA', shopping: '#A78BFA', health: '#F472B6',
  entertainment: '#FBBF24', travel: '#7B7FD4', groceries: '#4ADE80', salary: '#34D399', other: '#94A3B8',
};

const STAGES: { ms: number; text: string; pct: number; found?: 'merchant' | 'date' | 'total' }[] = [
  { ms: 300,  text: 'Detecting edges…',   pct: 22 },
  { ms: 950,  text: 'Reading merchant…',  pct: 48, found: 'merchant' },
  { ms: 1600, text: 'Finding the date…',  pct: 68, found: 'date' },
  { ms: 2250, text: 'Extracting total…',  pct: 85, found: 'total' },
];

function fmtAmount(n: number | null) {
  if (n === null) return '—';
  return `$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing]      = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [phase, setPhase]         = useState<Phase>('aligning');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [ocrResult,   setOcrResult]   = useState<ProcessedReceipt | null>(null);
  const [stageText,   setStageText]   = useState('Detecting edges…');
  const [progressPct, setProgressPct] = useState(0);
  const [found, setFound] = useState({ merchant: false, date: false, total: false });

  const cameraRef      = useRef<CameraView>(null);
  const scanLoop        = useRef<Animated.CompositeAnimation | null>(null);
  const scanY           = useRef(new Animated.Value(0)).current;
  const flashOpacity    = useRef(new Animated.Value(0)).current;
  const progressAnim    = useRef(new Animated.Value(0)).current;
  const sheetY           = useRef(new Animated.Value(1)).current;
  const autoCaptureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageTimers       = useRef<ReturnType<typeof setTimeout>[]>([]);

  const lineY = scanY.interpolate({ inputRange: [0, 1], outputRange: [0, 240] });
  const sheetTranslate = sheetY.interpolate({ inputRange: [0, 1], outputRange: [0, SHEET_HEIGHT] });
  const ringOffset = progressAnim.interpolate({ inputRange: [0, 1], outputRange: [RING_C, 0] });

  const clearStageTimers = () => { stageTimers.current.forEach(clearTimeout); stageTimers.current = []; };

  const startScanLoop = (durationMs: number) => {
    scanLoop.current?.stop();
    scanY.setValue(0);
    scanLoop.current = Animated.loop(
      Animated.timing(scanY, { toValue: 1, duration: durationMs, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    scanLoop.current.start();
  };
  const stopScanLoop = () => scanLoop.current?.stop();

  const setProgress = (pct: number) => {
    setProgressPct(pct);
    Animated.timing(progressAnim, { toValue: pct / 100, duration: 300, useNativeDriver: false }).start();
  };

  const resetToAligning = useCallback(() => {
    if (autoCaptureTimer.current) clearTimeout(autoCaptureTimer.current);
    clearStageTimers();
    setPhase('aligning');
    setCapturedUri(null);
    setOcrResult(null);
    setStageText('Detecting edges…');
    setProgressPct(0);
    progressAnim.setValue(0);
    setFound({ merchant: false, date: false, total: false });
    sheetY.setValue(1);
    flashOpacity.setValue(0);
    startScanLoop(2100);
    autoCaptureTimer.current = setTimeout(() => { handleCapture(); }, AUTO_CAPTURE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      resetToAligning();
      return () => {
        if (autoCaptureTimer.current) clearTimeout(autoCaptureTimer.current);
        clearStageTimers();
        stopScanLoop();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const runStagedProgress = () => {
    clearStageTimers();
    STAGES.forEach(stage => {
      stageTimers.current.push(setTimeout(() => {
        setStageText(stage.text);
        setProgress(stage.pct);
        if (stage.found) setFound(prev => ({ ...prev, [stage.found as string]: true }));
      }, stage.ms));
    });
  };

  const finishAnalysis = (result: ProcessedReceipt) => {
    clearStageTimers();
    setOcrResult(result);
    setStageText('Done');
    setProgress(100);
    setFound({ merchant: true, date: true, total: true });
    stopScanLoop();
    setTimeout(() => {
      setPhase('result');
      Animated.timing(sheetY, { toValue: 0, duration: 480, easing: Easing.out(Easing.exp), useNativeDriver: true }).start();
    }, 420);
  };

  const beginAnalysis = (uri: string) => {
    setPhase('analyzing');
    startScanLoop(1300);
    runStagedProgress();
    const startedAt = Date.now();
    processReceipt(uri, 'receipt.jpg', 'image/jpeg')
      .then(result => {
        const wait = Math.max(0, MIN_ANALYSIS_MS - (Date.now() - startedAt));
        setTimeout(() => finishAnalysis(result), wait);
      })
      .catch((e: any) => {
        clearStageTimers();
        stopScanLoop();
        const msg = e?.response?.data?.message || e?.message || 'Could not analyze the receipt.';
        Alert.alert('Analysis Failed', msg + '\n\nPlease retake the photo and try again.');
        resetToAligning();
      });
  };

  const handleCapture = async () => {
    if (phase !== 'aligning' || !cameraRef.current) return;
    if (autoCaptureTimer.current) clearTimeout(autoCaptureTimer.current);
    setPhase('capturing');
    stopScanLoop();
    flashOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
      if (!photo) { resetToAligning(); return; }
      setCapturedUri(photo.uri);
      beginAnalysis(photo.uri);
    } catch {
      Alert.alert('Error', 'Failed to capture. Please try again.');
      resetToAligning();
    }
  };

  const handleGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!result.canceled && result.assets[0]) {
      if (autoCaptureTimer.current) clearTimeout(autoCaptureTimer.current);
      setCapturedUri(result.assets[0].uri);
      beginAnalysis(result.assets[0].uri);
    }
  };

  const handleConfirm = () => {
    if (!ocrResult) return;
    router.push({
      pathname: '/(dashboard)/add',
      params: {
        amount:      ocrResult.amount?.toString() ?? '',
        merchant:    ocrResult.merchant ?? '',
        date:        ocrResult.date ?? '',
        type:        'EXPENSE',
        category:    ocrResult.category ?? '',
        description: ocrResult.description ?? '',
        receiptUrl:  ocrResult.receiptUrl ?? '',
        receiptReportUrl: ocrResult.receiptReportUrl ?? '',
      },
    });
  };

  // ── Permission ──
  if (!permission) return <View style={s.bg} />;

  if (!permission.granted) {
    return (
      <View style={s.bg}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={s.permWrap}>
          <View style={[s.permIcon, { backgroundColor: 'rgba(91,106,212,0.15)' }]}>
            <MaterialIcons name="camera-alt" size={40} color={BRACKET} />
          </View>
          <Text style={s.permTitle}>Camera Access Needed</Text>
          <Text style={s.permDesc}>Allow camera access to scan receipts and auto-log expenses.</Text>
          <TouchableOpacity style={[s.permBtn, { backgroundColor: BRAND }]} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={s.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.permBack} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.permBackText}>Go back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const showCamera     = phase === 'aligning' || phase === 'capturing';
  const showScanOverlay = phase === 'aligning' || phase === 'analyzing';
  const scanColor       = phase === 'analyzing' ? GOLD : BRACKET;
  const catColor = ocrResult ? (CAT_COLOR[ocrResult.category ?? 'other'] ?? '#94A3B8') : '#94A3B8';
  const catIcon  = ocrResult ? (CATEGORY_ICON[ocrResult.category as keyof typeof CATEGORY_ICON] ?? 'receipt') : 'receipt';
  const catLabel = ocrResult ? (CATEGORY_LABEL[ocrResult.category as keyof typeof CATEGORY_LABEL] ?? 'Other') : '';
  const confidencePct = ocrResult ? Math.round(ocrResult.confidence * 100) : 0;

  return (
    <View style={s.bg}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {showCamera ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />
      ) : capturedUri ? (
        <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}

      <View style={s.vigTop} />
      <View style={s.vigBottom} />
      <Animated.View style={[s.flashOverlay, { opacity: flashOpacity }]} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => (phase === 'aligning' ? router.back() : resetToAligning())}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>
            {phase === 'analyzing' ? 'Analyzing…' : phase === 'result' ? 'Receipt Found' : 'Scan Receipt'}
          </Text>
          <TouchableOpacity
            style={s.flashBtn}
            onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={flash === 'on' ? 'flash-on' : 'flash-off'}
              size={20}
              color={flash === 'on' ? GOLD : 'rgba(255,255,255,0.7)'}
            />
          </TouchableOpacity>
        </View>

        {showScanOverlay && (
          <View style={s.vfArea} pointerEvents="none">
            <View style={s.vf}>
              <View style={[s.corner, s.cTL, { borderColor: scanColor }]} />
              <View style={[s.corner, s.cTR, { borderColor: scanColor }]} />
              <View style={[s.corner, s.cBL, { borderColor: scanColor }]} />
              <View style={[s.corner, s.cBR, { borderColor: scanColor }]} />

              <Animated.View style={[s.scanLineWrap, { transform: [{ translateY: lineY }] }]}>
                <LinearGradient
                  colors={['transparent', scanColor, '#ffffff', scanColor, 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.scanLineGradient}
                />
              </Animated.View>

              {phase === 'analyzing' && (
                <>
                  <View style={[s.marker, s.markerMerchant, found.merchant && s.markerVisible]}>
                    <Text style={s.markerLabel}>Merchant</Text>
                  </View>
                  <View style={[s.marker, s.markerDate, found.date && s.markerVisible]}>
                    <Text style={s.markerLabel}>Date</Text>
                  </View>
                  <View style={[s.marker, s.markerTotal, found.total && s.markerVisible]}>
                    <Text style={s.markerLabel}>Total</Text>
                  </View>
                </>
              )}
            </View>

            {phase === 'aligning' && (
              <>
                <Text style={s.instrMain}>Point camera at receipt</Text>
                <Text style={s.instrSub}>Scanning automatically…</Text>
              </>
            )}

            {phase === 'analyzing' && (
              <View style={s.analyzingPanel}>
                <View style={s.ring}>
                  <Svg width={58} height={58} viewBox="0 0 58 58">
                    <Circle cx={29} cy={29} r={RING_R} stroke="rgba(255,255,255,0.14)" strokeWidth={4} fill="none" />
                    <AnimatedCircle
                      cx={29} cy={29} r={RING_R} stroke={GOLD} strokeWidth={4} fill="none"
                      strokeDasharray={`${RING_C}, ${RING_C}`}
                      strokeDashoffset={ringOffset}
                      strokeLinecap="round"
                      transform="rotate(-90 29 29)"
                    />
                  </Svg>
                  <Text style={s.ringPct}>{progressPct}%</Text>
                </View>
                <Text style={s.analyzingText}>{stageText}</Text>
                <View style={s.chipRow}>
                  {(['merchant', 'date', 'total'] as const).map(key => (
                    <View key={key} style={[s.chip, found[key] && s.chipDone]}>
                      {found[key] && <MaterialIcons name="check" size={12} color={SUCCESS} style={{ marginRight: 4 }} />}
                      <Text style={[s.chipText, found[key] && s.chipTextDone]}>
                        {key === 'merchant' ? 'Merchant' : key === 'date' ? 'Date' : 'Total'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {phase === 'aligning' && (
          <View style={s.controls}>
            <TouchableOpacity style={s.ctrlBtn} onPress={handleGallery} activeOpacity={0.7}>
              <MaterialIcons name="ios-share" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>

            <TouchableOpacity style={s.shutterRing} onPress={handleCapture} activeOpacity={0.85}>
              <View style={s.shutterInner} />
            </TouchableOpacity>

            <TouchableOpacity style={s.ctrlBtn} onPress={() => {}} activeOpacity={0.7}>
              <MaterialIcons name="grid-view" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* ── Result sheet (slides up over the frozen photo) ── */}
      <Animated.View style={[s.sheet, { height: SHEET_HEIGHT, transform: [{ translateY: sheetTranslate }] }]}>
        <View style={s.sheetHandle} />
        {ocrResult && (
          <ScrollView contentContainerStyle={s.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={s.successBadge}>
              <MaterialIcons name="check-circle" size={16} color={SUCCESS} />
              <Text style={s.successText}>Scan complete</Text>
            </View>
            <View style={s.aiBadge}>
              <MaterialIcons name="auto-awesome" size={13} color={GOLD} />
              <Text style={s.aiBadgeText}>{confidencePct}% match</Text>
            </View>

            <View style={s.previewCard}>
              <View style={[s.catPill, { backgroundColor: catColor + '22' }]}>
                <View style={[s.catIconBg, { backgroundColor: catColor }]}>
                  <MaterialIcons name={catIcon} size={18} color="#fff" />
                </View>
                <Text style={[s.catLabel, { color: catColor }]}>{catLabel}</Text>
              </View>

              <Text style={s.merchantName}>{ocrResult.merchant ?? 'Unknown Merchant'}</Text>
              <Text style={s.amountText}>{fmtAmount(ocrResult.amount)}</Text>

              <View style={s.divider} />

              <View style={s.detailRow}>
                <MaterialIcons name="event" size={16} color="rgba(255,255,255,0.45)" />
                <Text style={s.detailLabel}>Date</Text>
                <Text style={s.detailValue}>{fmtDate(ocrResult.date)}</Text>
              </View>

              {ocrResult.description ? (
                <View style={s.detailRow}>
                  <MaterialIcons name="notes" size={16} color="rgba(255,255,255,0.45)" />
                  <Text style={s.detailLabel}>Note</Text>
                  <Text style={[s.detailValue, { flex: 1 }]} numberOfLines={3}>{ocrResult.description}</Text>
                </View>
              ) : null}
            </View>

            {ocrResult.rawText ? (
              <View style={s.rawCard}>
                <View style={s.rawHeader}>
                  <MaterialIcons name="psychology" size={14} color="rgba(255,255,255,0.4)" />
                  <Text style={s.rawTitle}>Detected text</Text>
                </View>
                <Text style={s.rawText} numberOfLines={6}>{ocrResult.rawText}</Text>
              </View>
            ) : null}

            <View style={s.resultRow}>
              <TouchableOpacity style={s.retakeBtn} onPress={resetToAligning} activeOpacity={0.8}>
                <MaterialIcons name="replay" size={18} color="rgba(255,255,255,0.8)" />
                <Text style={s.retakeText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: BRAND }]} onPress={handleConfirm} activeOpacity={0.85}>
                <MaterialIcons name="add-circle-outline" size={18} color="#fff" />
                <Text style={s.saveBtnText}>Confirm & Add</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0A0A12' },

  permWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  permIcon:    { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  permTitle:   { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  permDesc:    { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20 },
  permBtn:     { marginTop: 12, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 36 },
  permBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  permBack:    { padding: 8 },
  permBackText:{ fontSize: 14, color: 'rgba(255,255,255,0.4)' },

  vigTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: '18%', backgroundColor: 'rgba(0,0,0,0.65)' },
  vigBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '26%', backgroundColor: 'rgba(0,0,0,0.65)' },
  flashOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', zIndex: 5 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  backBtn:     { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  flashBtn:    { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },

  vfArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  vf: { width: '100%', height: 240, marginBottom: 24, position: 'relative', overflow: 'hidden', alignItems: 'center' },
  corner:  { position: 'absolute', width: 28, height: 28 },
  cTL: { top: 0, left: 0,  borderTopWidth: 2.5, borderLeftWidth: 2.5,  borderTopLeftRadius: 6 },
  cTR: { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: 6 },
  cBL: { bottom: 0, left: 0,  borderBottomWidth: 2.5, borderLeftWidth: 2.5,  borderBottomLeftRadius: 6 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 6 },

  scanLineWrap:     { position: 'absolute', left: 0, right: 0, height: 3 },
  scanLineGradient: { flex: 1, borderRadius: 2 },

  marker: {
    position: 'absolute', borderWidth: 1.5, borderColor: GOLD, borderRadius: 6,
    backgroundColor: 'rgba(251,191,36,0.08)', opacity: 0,
  },
  markerVisible: { opacity: 1 },
  markerLabel: {
    position: 'absolute', top: -20, left: -1.5, backgroundColor: GOLD, color: '#1a1300',
    fontSize: 9.5, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  markerMerchant: { top: '14%', left: '18%', width: '46%', height: '9%' },
  markerDate:     { top: '30%', left: '18%', width: '30%', height: '7%' },
  markerTotal:    { top: '68%', left: '22%', width: '40%', height: '10%' },

  instrMain: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 6 },
  instrSub:  { fontSize: 13, color: 'rgba(255,255,255,0.45)' },

  analyzingPanel: { alignItems: 'center', gap: 14 },
  ring: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  ringPct: { position: 'absolute', fontSize: 13, fontWeight: '700', color: '#fff' },
  analyzingText: { fontSize: 13.5, fontWeight: '600', color: '#fff' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  chipDone: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.3)' },
  chipText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.35)' },
  chipTextDone: { color: SUCCESS },

  controls:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 44, paddingBottom: 10 },
  ctrlBtn:      { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  shutterRing:  { width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40,
    backgroundColor: '#10121a', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.4, shadowRadius: 30,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  sheetScroll: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 24 },

  successBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 },
  successText:  { fontSize: 12.5, fontWeight: '700', color: SUCCESS },
  aiBadge:      { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 6, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(251,191,36,0.28)' },
  aiBadgeText:  { fontSize: 12, fontWeight: '600', color: GOLD },

  previewCard:    { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  catPill:        { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', borderRadius: 14, paddingRight: 14, paddingVertical: 4, marginBottom: 16 },
  catIconBg:      { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  catLabel:       { fontSize: 13, fontWeight: '700' },
  merchantName:   { fontSize: 21, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  amountText:     { fontSize: 34, fontWeight: '800', color: SUCCESS, marginBottom: 16 },
  divider:        { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 14 },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 11 },
  detailLabel:    { fontSize: 12.5, color: 'rgba(255,255,255,0.4)', width: 42 },
  detailValue:    { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  rawCard:   { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  rawHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  rawTitle:  { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textTransform: 'uppercase' },
  rawText:   { fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 18 },

  resultRow:    { flexDirection: 'row', gap: 10, marginTop: 16 },
  retakeBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  retakeText:   { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  saveBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  saveBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
});
