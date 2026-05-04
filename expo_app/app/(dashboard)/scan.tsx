import React, { useState, useRef } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar,
  Animated, Easing, Image, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { scanReceipt, OcrResult } from '@/services/ocr.service';
import { CATEGORY_ICON, CATEGORY_LABEL } from '@/services/transaction.service';

type ScanState = 'idle' | 'scanning' | 'result' | 'processing' | 'preview';

const BRAND   = '#2D336B';
const BRACKET = '#5B6AD4';

const CAT_COLOR: Record<string, string> = {
  food: '#FF8C42', transport: '#60A5FA', shopping: '#A78BFA', health: '#F472B6',
  entertainment: '#FBBF24', travel: '#7B7FD4', groceries: '#4ADE80', salary: '#34D399', other: '#94A3B8',
};

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
  const [facing]                        = useState<CameraType>('back');
  const [flash, setFlash]               = useState<FlashMode>('off');
  const [scanState, setScanState]       = useState<ScanState>('idle');
  const [capturedUri, setCapturedUri]   = useState<string | null>(null);
  const [ocrResult,   setOcrResult]     = useState<OcrResult | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const scanLine  = useRef(new Animated.Value(0)).current;

  const lineY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, 210] });

  const startScan = () => {
    scanLine.setValue(0);
    Animated.loop(
      Animated.timing(scanLine, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true })
    ).start();
  };

  const handleCapture = async () => {
    if (!cameraRef.current || scanState !== 'idle') return;
    setScanState('scanning');
    startScan();
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
      scanLine.stopAnimation();
      if (photo) { setCapturedUri(photo.uri); setScanState('result'); }
      else { setScanState('idle'); }
    } catch {
      scanLine.stopAnimation();
      setScanState('idle');
      Alert.alert('Error', 'Failed to capture. Please try again.');
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
      setCapturedUri(result.assets[0].uri);
      setScanState('result');
    }
  };

  const handleReset = () => { setCapturedUri(null); setScanState('idle'); setOcrResult(null); };

  const handleAnalyze = async () => {
    if (!capturedUri) return;
    setScanState('processing');
    try {
      const result = await scanReceipt(capturedUri);
      setOcrResult(result);
      setScanState('preview');
    } catch (e: any) {
      setScanState('result');
      const msg = e?.response?.data?.message || e?.message || 'Could not analyze the receipt.';
      Alert.alert('Analysis Failed', msg + '\n\nPlease retake the photo and try again.');
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

  // ── AI Preview ──
  if (scanState === 'preview' && ocrResult) {
    const catColor = CAT_COLOR[ocrResult.category ?? 'other'] ?? '#94A3B8';
    const catIcon  = CATEGORY_ICON[ocrResult.category as keyof typeof CATEGORY_ICON] ?? 'receipt';
    const catLabel = CATEGORY_LABEL[ocrResult.category as keyof typeof CATEGORY_LABEL] ?? 'Other';
    const pct      = Math.round(ocrResult.confidence * 100);

    return (
      <View style={s.bg}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.header}>
            <TouchableOpacity style={s.backBtn} onPress={() => setScanState('result')} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Receipt Analyzed</Text>
            <View style={{ width: 38 }} />
          </View>

          <ScrollView contentContainerStyle={s.previewScroll} showsVerticalScrollIndicator={false}>
            {/* AI confidence badge */}
            <View style={s.aiBadge}>
              <MaterialIcons name="auto-awesome" size={14} color="#FBBF24" />
              <Text style={s.aiBadgeText}>GPT-4o · {pct}% confident</Text>
            </View>

            {/* Main receipt card */}
            <View style={s.previewCard}>
              {/* Category pill */}
              <View style={[s.catPill, { backgroundColor: catColor + '22' }]}>
                <View style={[s.catIconBg, { backgroundColor: catColor }]}>
                  <MaterialIcons name={catIcon} size={18} color="#fff" />
                </View>
                <Text style={[s.catLabel, { color: catColor }]}>{catLabel}</Text>
              </View>

              {/* Merchant & amount */}
              <Text style={s.merchantName}>{ocrResult.merchant ?? 'Unknown Merchant'}</Text>
              <Text style={s.amountText}>{fmtAmount(ocrResult.amount)}</Text>

              <View style={s.divider} />

              {/* Detail rows */}
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
                  <Text style={s.rawTitle}>What AI saw</Text>
                </View>
                <Text style={s.rawText} numberOfLines={6}>{ocrResult.rawText}</Text>
              </View>
            ) : null}

            <Text style={s.previewHint}>Review the details above, then confirm to add this expense.</Text>
          </ScrollView>

          {/* Action buttons */}
          <View style={s.resultRow}>
            <TouchableOpacity style={s.retakeBtn} onPress={handleReset} activeOpacity={0.8}>
              <MaterialIcons name="replay" size={18} color="rgba(255,255,255,0.8)" />
              <Text style={s.retakeText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.saveBtn, { backgroundColor: BRAND }]} onPress={handleConfirm} activeOpacity={0.85}>
              <MaterialIcons name="add-circle-outline" size={18} color="#fff" />
              <Text style={s.saveBtnText}>Confirm & Add</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Result (captured, awaiting analysis) ──
  if ((scanState === 'result' || scanState === 'processing') && capturedUri) {
    return (
      <View style={s.bg}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.header}>
            <TouchableOpacity style={s.backBtn} onPress={handleReset} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Receipt Captured</Text>
            <View style={{ width: 38 }} />
          </View>
          <View style={s.capturedWrap}>
            <Image source={{ uri: capturedUri }} style={s.capturedImg} resizeMode="contain" />
            <View style={s.successBadge}>
              <MaterialIcons name="check-circle" size={18} color="#4ADE80" />
              <Text style={s.successText}>Photo Ready</Text>
            </View>
          </View>
          <View style={s.resultRow}>
            <TouchableOpacity style={s.retakeBtn} onPress={handleReset} activeOpacity={0.8} disabled={scanState === 'processing'}>
              <MaterialIcons name="replay" size={18} color="rgba(255,255,255,0.8)" />
              <Text style={s.retakeText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: BRAND, opacity: scanState === 'processing' ? 0.7 : 1 }]}
              activeOpacity={0.85}
              onPress={handleAnalyze}
              disabled={scanState === 'processing'}
            >
              {scanState === 'processing' ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={s.saveBtnText}>Analyzing…</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="auto-awesome" size={18} color="#fff" />
                  <Text style={s.saveBtnText}>Analyze Receipt</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Camera ──
  return (
    <View style={s.bg}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />

      <View style={s.vigTop} />
      <View style={s.vigBottom} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Scan Receipt</Text>
          <TouchableOpacity
            style={s.flashBtn}
            onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={flash === 'on' ? 'flash-on' : 'flash-off'}
              size={20}
              color={flash === 'on' ? '#FBBF24' : 'rgba(255,255,255,0.7)'}
            />
          </TouchableOpacity>
        </View>

        <View style={s.vfArea}>
          <View style={s.vf}>
            <View style={[s.corner, s.cTL, { borderColor: BRACKET }]} />
            <View style={[s.corner, s.cTR, { borderColor: BRACKET }]} />
            <View style={[s.corner, s.cBL, { borderColor: BRACKET }]} />
            <View style={[s.corner, s.cBR, { borderColor: BRACKET }]} />

            {[0.25, 0.42, 0.58, 0.72, 0.84].map((pos, i) => (
              <View
                key={i}
                style={[s.mockLine, { top: `${pos * 100}%`, width: `${60 + i * 8}%`, opacity: 0.18 + i * 0.04 }]}
              />
            ))}

            {scanState === 'scanning' && (
              <Animated.View style={[s.scanLine, { transform: [{ translateY: lineY }] }]} />
            )}
          </View>

          <Text style={s.instrMain}>
            {scanState === 'scanning' ? 'Scanning…' : 'Point camera at receipt'}
          </Text>
          <Text style={s.instrSub}>
            {scanState === 'scanning' ? 'Hold steady' : 'AI will extract all expense details'}
          </Text>
        </View>

        <View style={s.controls}>
          <TouchableOpacity style={s.ctrlBtn} onPress={handleGallery} activeOpacity={0.7}>
            <MaterialIcons name="ios-share" size={22} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.shutterRing, scanState === 'scanning' && { opacity: 0.5 }]}
            onPress={handleCapture}
            activeOpacity={0.85}
            disabled={scanState === 'scanning'}
          >
            <View style={s.shutterInner} />
          </TouchableOpacity>

          <TouchableOpacity style={s.ctrlBtn} onPress={() => {}} activeOpacity={0.7}>
            <MaterialIcons name="grid-view" size={22} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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

  mockLine: { position: 'absolute', height: 1.5, borderRadius: 1, backgroundColor: 'rgba(91,106,212,0.6)', alignSelf: 'center' },
  scanLine: {
    position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: BRACKET,
    shadowColor: BRACKET, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8,
  },

  instrMain: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 6 },
  instrSub:  { fontSize: 13, color: 'rgba(255,255,255,0.45)' },

  controls:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 44, paddingBottom: 10 },
  ctrlBtn:      { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  shutterRing:  { width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },

  capturedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  capturedImg:  { width: '100%', height: '80%', borderRadius: 18 },
  successBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(74,222,128,0.12)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: 16, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  successText:  { fontSize: 14, fontWeight: '600', color: '#4ADE80' },
  resultRow:    { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 16 },
  retakeBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  retakeText:   { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  saveBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  saveBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },

  previewScroll:  { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  aiBadge:        { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)' },
  aiBadgeText:    { fontSize: 13, fontWeight: '600', color: '#FBBF24' },
  previewCard:    { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 22, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  catPill:        { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', borderRadius: 14, paddingRight: 14, paddingVertical: 4, marginBottom: 18 },
  catIconBg:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catLabel:       { fontSize: 14, fontWeight: '700' },
  merchantName:   { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  amountText:     { fontSize: 38, fontWeight: '800', color: '#4ADE80', marginBottom: 20 },
  divider:        { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  detailLabel:    { fontSize: 13, color: 'rgba(255,255,255,0.45)', width: 44 },
  detailValue:    { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  previewHint:    { fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 16 },

  rawCard:   { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  rawHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  rawTitle:  { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textTransform: 'uppercase' },
  rawText:   { fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 18 },
});
