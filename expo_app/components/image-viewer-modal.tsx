import React, { useState } from 'react';
import {
  Modal, View, TouchableOpacity, StyleSheet, Dimensions,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Text } from '@/components/text';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  uri: string;
  onClose: () => void;
}

export function ImageViewerModal({ visible, uri, onClose }: Props) {
  const [saving,  setSaving]  = useState(false);
  const [copying, setCopying] = useState(false);

  // Shared values for transform
  const scale      = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX     = useSharedValue(0);
  const savedY     = useSharedValue(0);

  const resetTransform = () => {
    scale.value      = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedX.value     = 0;
    savedY.value     = 0;
  };

  // Pinch to zoom
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.max(0.5, Math.min(next, 5));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value      = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedX.value     = 0;
        savedY.value     = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  // Pan to move when zoomed in
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedX.value + e.translationX;
        translateY.value = savedY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);

  const imgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleDownload = async () => {
    if (!uri) return;
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Allow photo library access to save images.');
        return;
      }
      const ext      = uri.split('?')[0].split('.').pop() ?? 'jpg';
      const localUri = FileSystem.cacheDirectory + `receipt_${Date.now()}.${ext}`;
      await FileSystem.downloadAsync(uri, localUri);
      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert('Saved', 'Receipt saved to your photo library.');
    } catch {
      Alert.alert('Error', 'Could not save the image.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!uri) return;
    setCopying(true);
    try {
      await Clipboard.setStringAsync(uri);
      Alert.alert('Copied', 'Image URL copied to clipboard.');
    } catch {
      Alert.alert('Error', 'Could not copy the image URL.');
    } finally {
      setCopying(false);
    }
  };

  const handleClose = () => {
    resetTransform();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <GestureHandlerRootView style={s.root}>

        {/* Background tap to close */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />

        {/* Top bar */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.iconBtn} onPress={handleClose} activeOpacity={0.8}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Receipt</Text>
          <TouchableOpacity style={s.iconBtn} onPress={resetTransform} activeOpacity={0.8}>
            <MaterialIcons name="fit-screen" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Zoomable image */}
        <GestureDetector gesture={composed}>
          <Animated.View style={s.imgWrap} pointerEvents="box-none">
            <Animated.Image
              source={{ uri }}
              style={[s.img, imgStyle]}
              resizeMode="contain"
            />
          </Animated.View>
        </GestureDetector>

        {/* Bottom actions */}
        <View style={s.bottomBar}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
            onPress={handleCopy}
            disabled={copying}
            activeOpacity={0.8}
          >
            {copying
              ? <ActivityIndicator color="#fff" size="small" />
              : <MaterialIcons name="content-copy" size={20} color="#fff" />
            }
            <Text style={s.actionLabel}>Copy URL</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: 'rgba(99,102,241,0.85)' }]}
            onPress={handleDownload}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <MaterialIcons name="download" size={20} color="#fff" />
            }
            <Text style={s.actionLabel}>Save to Gallery</Text>
          </TouchableOpacity>
        </View>

      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 20,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  topTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  imgWrap: {
    width: SW,
    height: SH * 0.7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: SW,
    height: SH * 0.7,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
