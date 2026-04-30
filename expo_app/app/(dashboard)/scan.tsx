import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

type ScanState = 'idle' | 'scanning' | 'result';

export default function ScanScreen() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const scanLine = useRef(new Animated.Value(0)).current;

  const startScan = () => {
    setScanState('scanning');
    scanLine.setValue(0);
    Animated.loop(
      Animated.timing(scanLine, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true })
    ).start();
    setTimeout(() => {
      scanLine.stopAnimation();
      setScanState('result');
    }, 2800);
  };

  const lineY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, 220] });

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A12" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Receipt</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Viewfinder */}
        <View style={styles.viewfinderArea}>
          <View style={styles.viewfinder}>
            {/* Corner brackets */}
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />

            {/* Receipt lines preview */}
            {[80, 60, 70, 50, 65, 45].map((w, i) => (
              <View key={i} style={[styles.receiptLine, { width: `${w}%`, opacity: 0.25 + i * 0.04, marginTop: i === 0 ? 30 : 10 }]} />
            ))}

            {/* Scan line */}
            {scanState === 'scanning' && (
              <Animated.View style={[styles.scanLine, { transform: [{ translateY: lineY }] }]} />
            )}

            {scanState === 'result' && (
              <View style={styles.successOverlay}>
                <MaterialIcons name="check-circle" size={52} color="#4ADE80" />
                <Text style={styles.successText}>Receipt Detected!</Text>
              </View>
            )}
          </View>

          {/* Instructions */}
          <Text style={styles.instructionMain}>Point camera at your receipt</Text>
          <Text style={styles.instructionSub}>Hold steady until detected</Text>
        </View>

        {/* Bottom controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlSide} activeOpacity={0.7}>
            <MaterialIcons name="upload" size={24} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.captureButton}
            activeOpacity={0.85}
            onPress={scanState === 'idle' ? startScan : undefined}
          >
            {scanState === 'result'
              ? <MaterialIcons name="check" size={32} color="#2D336B" />
              : <View style={styles.captureInner} />
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlSide} activeOpacity={0.7}>
            <MaterialIcons name="grid-on" size={24} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Save button when result ready */}
        {scanState === 'result' && (
          <TouchableOpacity
            style={styles.saveButton}
            activeOpacity={0.85}
            onPress={() => router.push('/(dashboard)/add')}
          >
            <Text style={styles.saveButtonText}>Review & Save Expense</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  );
}

const BRACKET_COLOR = '#2D336B';
const BRACKET_SIZE  = 28;
const BRACKET_W     = 3;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A12' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  viewfinderArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  viewfinder: {
    width: '100%', height: 260, backgroundColor: '#12121E',
    borderRadius: 18, overflow: 'hidden', alignItems: 'center',
    marginBottom: 24, position: 'relative',
  },

  // Corner brackets
  corner: { position: 'absolute', width: BRACKET_SIZE, height: BRACKET_SIZE },
  tl: { top: 14, left: 14, borderTopWidth: BRACKET_W, borderLeftWidth: BRACKET_W, borderColor: BRACKET_COLOR, borderTopLeftRadius: 5 },
  tr: { top: 14, right: 14, borderTopWidth: BRACKET_W, borderRightWidth: BRACKET_W, borderColor: BRACKET_COLOR, borderTopRightRadius: 5 },
  bl: { bottom: 14, left: 14, borderBottomWidth: BRACKET_W, borderLeftWidth: BRACKET_W, borderColor: BRACKET_COLOR, borderBottomLeftRadius: 5 },
  br: { bottom: 14, right: 14, borderBottomWidth: BRACKET_W, borderRightWidth: BRACKET_W, borderColor: BRACKET_COLOR, borderBottomRightRadius: 5 },

  receiptLine: { height: 10, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 3 },

  scanLine: {
    position: 'absolute', left: 14, right: 14, height: 2,
    backgroundColor: BRACKET_COLOR,
    shadowColor: BRACKET_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8,
  },

  successOverlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  successText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  instructionMain: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginBottom: 6 },
  instructionSub: { fontSize: 13, color: 'rgba(255,255,255,0.45)' },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 40, paddingBottom: 16 },
  controlSide: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  captureButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#FFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#E0E0E0' },

  saveButton: { marginHorizontal: 20, marginBottom: 16, backgroundColor: BRACKET_COLOR, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
