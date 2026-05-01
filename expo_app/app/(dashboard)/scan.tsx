import React, { useState, useRef } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar,
  Animated, Easing, Image, Alert,
} from 'react-native';
import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

type ScanState = 'idle' | 'scanning' | 'result';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing]                        = useState<CameraType>('back');
  const [flash, setFlash]               = useState<FlashMode>('off');
  const [scanState, setScanState]       = useState<ScanState>('idle');
  const [capturedUri, setCapturedUri]   = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const scanLine  = useRef(new Animated.Value(0)).current;

  const lineY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, 220] });

  const startScanAnimation = () => {
    scanLine.setValue(0);
    Animated.loop(
      Animated.timing(scanLine, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true })
    ).start();
  };

  const handleCapture = async () => {
    if (!cameraRef.current || scanState !== 'idle') return;
    setScanState('scanning');
    startScanAnimation();

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
      scanLine.stopAnimation();
      if (photo) {
        setCapturedUri(photo.uri);
        setScanState('result');
      } else {
        setScanState('idle');
      }
    } catch {
      scanLine.stopAnimation();
      setScanState('idle');
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    }
  };

  const handlePickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to import receipts.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
      setScanState('result');
    }
  };

  const handleReset = () => {
    setCapturedUri(null);
    setScanState('idle');
  };

  // ── Permission not yet determined ──
  if (!permission) {
    return <View style={styles.fullDark} />;
  }

  // ── Permission denied ──
  if (!permission.granted) {
    return (
      <View style={styles.fullDark}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A12" />
        <SafeAreaView style={styles.permissionWrap}>
          <MaterialIcons name="camera-alt" size={56} color="rgba(255,255,255,0.3)" />
          <Text style={styles.permTitle}>Camera Access Needed</Text>
          <Text style={styles.permDesc}>Allow camera access to scan receipts and auto-log expenses.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permBack} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.permBackText}>Go back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  // ── Result: show captured image ──
  if (scanState === 'result' && capturedUri) {
    return (
      <View style={styles.fullDark}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A12" />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleReset} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Receipt Captured</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.capturedContainer}>
            <Image source={{ uri: capturedUri }} style={styles.capturedImage} resizeMode="contain" />
            <View style={styles.successBadge}>
              <MaterialIcons name="check-circle" size={20} color="#4ADE80" />
              <Text style={styles.successBadgeText}>Receipt Detected</Text>
            </View>
          </View>

          <View style={styles.resultActions}>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleReset} activeOpacity={0.8}>
              <MaterialIcons name="replay" size={18} color="rgba(255,255,255,0.8)" />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              activeOpacity={0.85}
              onPress={() => router.push('/(dashboard)/add')}
            >
              <MaterialIcons name="receipt-long" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Review & Save Expense</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Camera view ──
  return (
    <View style={styles.fullDark}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
      />

      {/* Dark overlay — top */}
      <View style={styles.overlayTop} />
      {/* Dark overlay — bottom */}
      <View style={styles.overlayBottom} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Receipt</Text>
          <TouchableOpacity
            style={styles.flashButton}
            activeOpacity={0.7}
            onPress={() => setFlash(f => (f === 'off' ? 'on' : 'off'))}
          >
            <MaterialIcons
              name={flash === 'on' ? 'flash-on' : 'flash-off'}
              size={20}
              color={flash === 'on' ? '#FBBF24' : 'rgba(255,255,255,0.7)'}
            />
          </TouchableOpacity>
        </View>

        {/* Viewfinder overlay */}
        <View style={styles.viewfinderArea}>
          <View style={styles.viewfinder}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />

            {scanState === 'scanning' && (
              <Animated.View style={[styles.scanLine, { transform: [{ translateY: lineY }] }]} />
            )}
          </View>

          <Text style={styles.instructionMain}>
            {scanState === 'scanning' ? 'Scanning…' : 'Point camera at your receipt'}
          </Text>
          <Text style={styles.instructionSub}>
            {scanState === 'scanning' ? 'Hold steady' : 'Align the receipt inside the frame'}
          </Text>
        </View>

        {/* Bottom controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlSide} activeOpacity={0.7} onPress={handlePickFromGallery}>
            <MaterialIcons name="photo-library" size={24} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureButton, scanState === 'scanning' && { opacity: 0.5 }]}
            activeOpacity={0.85}
            onPress={handleCapture}
            disabled={scanState === 'scanning'}
          >
            <View style={styles.captureInner} />
          </TouchableOpacity>

          <View style={styles.controlSide} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const BRACKET_COLOR = '#7B5CF0';
const BRACKET_SIZE  = 32;
const BRACKET_W     = 3;

const styles = StyleSheet.create({
  fullDark: { flex: 1, backgroundColor: '#0A0A12' },

  // Permission screen
  permissionWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  permTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', marginTop: 8 },
  permDesc: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20 },
  permBtn: { marginTop: 12, backgroundColor: '#7B5CF0', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 36 },
  permBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  permBack: { marginTop: 4, padding: 8 },
  permBackText: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },

  // Camera overlays
  overlayTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '20%', backgroundColor: 'rgba(0,0,0,0.55)' },
  overlayBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%', backgroundColor: 'rgba(0,0,0,0.55)' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  flashButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },

  viewfinderArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  viewfinder: {
    width: '100%', height: 260,
    borderRadius: 18, overflow: 'hidden',
    alignItems: 'center', marginBottom: 20,
    position: 'relative',
    backgroundColor: 'transparent',
  },

  corner: { position: 'absolute', width: BRACKET_SIZE, height: BRACKET_SIZE },
  tl: { top: 0, left: 0, borderTopWidth: BRACKET_W, borderLeftWidth: BRACKET_W, borderColor: BRACKET_COLOR, borderTopLeftRadius: 5 },
  tr: { top: 0, right: 0, borderTopWidth: BRACKET_W, borderRightWidth: BRACKET_W, borderColor: BRACKET_COLOR, borderTopRightRadius: 5 },
  bl: { bottom: 0, left: 0, borderBottomWidth: BRACKET_W, borderLeftWidth: BRACKET_W, borderColor: BRACKET_COLOR, borderBottomLeftRadius: 5 },
  br: { bottom: 0, right: 0, borderBottomWidth: BRACKET_W, borderRightWidth: BRACKET_W, borderColor: BRACKET_COLOR, borderBottomRightRadius: 5 },

  scanLine: {
    position: 'absolute', left: 0, right: 0, height: 2,
    backgroundColor: BRACKET_COLOR,
    shadowColor: BRACKET_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8,
  },

  instructionMain: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginBottom: 6 },
  instructionSub: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 40, paddingBottom: 16 },
  controlSide: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  captureButton: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },

  // Result screen
  capturedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  capturedImage: { width: '100%', height: '80%', borderRadius: 18 },
  successBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(74,222,128,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: 16, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  successBadgeText: { fontSize: 14, fontWeight: '600', color: '#4ADE80' },

  resultActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 16 },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  retakeBtnText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  saveButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7B5CF0', borderRadius: 14, paddingVertical: 15 },
  saveButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
