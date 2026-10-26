// Ported from expo_app/components/image-viewer-modal.tsx
// Pinch and pan use pointer events (touch, mouse and pen); the mouse wheel zooms too.
import { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Clipboard, MaterialIcons } from '@/rn';
import { downloadFromUrl, extensionOf } from '@/lib/download';

interface Props {
  visible: boolean;
  uri: string;
  onClose: () => void;
}

const MIN = 0.5;
const MAX = 5;
const clamp = (n: number) => Math.max(MIN, Math.min(n, MAX));

export function ImageViewerModal({ visible, uri, onClose }: Props) {
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef({ dist: 0, scale: 1, x: 0, y: 0, px: 0, py: 0 });
  const tapAt = useRef(0);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const resetTransform = () => { setAnimate(true); setT({ scale: 1, x: 0, y: 0 }); };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimate(false);
    start.current = { dist: pointers.current.size === 2 ? distance() : 0, scale: t.scale, x: t.x, y: t.y, px: e.clientX, py: e.clientY };
    // A quick second tap resets, like double-tap on a phone.
    if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - tapAt.current < 280) resetTransform();
      tapAt.current = now;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && start.current.dist > 0) {
      setT(prev => ({ ...prev, scale: clamp(start.current.scale * (distance() / start.current.dist)) }));
    } else if (pointers.current.size === 1 && t.scale > 1) {
      setT(prev => ({ ...prev, x: start.current.x + (e.clientX - start.current.px), y: start.current.y + (e.clientY - start.current.py) }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    start.current = { dist: 0, scale: t.scale, x: t.x, y: t.y, px: e.clientX, py: e.clientY };
    if (pointers.current.size === 0 && t.scale < 1) resetTransform(); // snap back after zooming out
  };

  const onWheel = (e: React.WheelEvent) => {
    setAnimate(false);
    setT(prev => ({ ...prev, scale: clamp(prev.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)) }));
  };

  const handleDownload = async () => {
    if (!uri) return;
    setSaving(true);
    try {
      await downloadFromUrl(uri, `receipt_${Date.now()}.${extensionOf(uri)}`);
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

  const handleClose = () => { resetTransform(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={s.root}>
        {/* Background tap to close */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} accessibilityLabel="Close" />

        {/* Top bar */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.iconBtn} onPress={handleClose} activeOpacity={0.8} accessibilityLabel="Close">
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Receipt</Text>
          <TouchableOpacity style={s.iconBtn} onPress={resetTransform} activeOpacity={0.8} accessibilityLabel="Fit to screen">
            <MaterialIcons name="fit-screen" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Zoomable image */}
        <div
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
          style={{ height: '70%', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: t.scale > 1 ? 'grab' : 'zoom-in', position: 'relative', zIndex: 1 }}
        >
          <img
            src={uri} alt="Receipt" draggable={false}
            style={{
              width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none',
              transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transition: animate ? 'transform 220ms ease' : 'none',
            }}
          />
        </div>

        {/* Bottom actions */}
        <View style={s.bottomBar}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]} onPress={handleCopy} disabled={copying} activeOpacity={0.8}>
            {copying ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="content-copy" size={20} color="#fff" />}
            <Text style={s.actionLabel}>Copy URL</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.actionBtn, { backgroundColor: 'rgba(99,102,241,0.85)' }]} onPress={handleDownload} disabled={saving} activeOpacity={0.8}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="download" size={20} color="#fff" />}
            <Text style={s.actionLabel}>Save image</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  topTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10,
  },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
