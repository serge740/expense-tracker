/** expo-camera for the browser: a live camera view (getUserMedia) that can take a picture. */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { toCss, type RNStyle } from '@/rn/style';

export type CameraType = 'front' | 'back';
export type FlashMode = 'off' | 'on' | 'auto';

export interface CameraViewHandle {
  takePictureAsync: (opts?: { quality?: number; base64?: boolean }) => Promise<{ uri: string; width: number; height: number } | undefined>;
}

export const CameraView = forwardRef<CameraViewHandle, { style?: RNStyle; facing?: CameraType; flash?: FlashMode; children?: ReactNode }>(
  function CameraView({ style, facing = 'back', flash = 'off', children }, ref) {
    const video = useRef<HTMLVideoElement>(null);
    const stream = useRef<MediaStream | null>(null);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facing === 'front' ? 'user' : 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
          if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
          stream.current = s;
          if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}); }
        } catch { /* permission denied or no camera: the screen shows its own message */ }
      })();
      return () => { cancelled = true; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
    }, [facing]);

    // The torch is only available on some phones; ignore it where it is not.
    useEffect(() => {
      const track = stream.current?.getVideoTracks()[0];
      (track as unknown as { applyConstraints?: (c: object) => Promise<void> } | undefined)
        ?.applyConstraints?.({ advanced: [{ torch: flash === 'on' }] }).catch(() => {});
    }, [flash]);

    useImperativeHandle(ref, () => ({
      async takePictureAsync(opts) {
        const v = video.current;
        if (!v || !v.videoWidth) return undefined;
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext('2d')?.drawImage(v, 0, 0);
        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', opts?.quality ?? 0.85));
        return blob ? { uri: URL.createObjectURL(blob), width: canvas.width, height: canvas.height } : undefined;
      },
    }));

    return (
      <div style={{ position: 'relative', overflow: 'hidden', background: '#000', ...toCss(style) }}>
        <video ref={video} playsInline muted autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'front' ? 'scaleX(-1)' : undefined }} />
        {children}
      </div>
    );
  },
);

export interface CameraPermission { granted: boolean; canAskAgain: boolean; status: 'granted' | 'denied' | 'undetermined' }

/** [permission, ask]: permission is null until it is known, like on the phone. */
export function useCameraPermissions(): [CameraPermission | null, () => Promise<CameraPermission>] {
  const [permission, setPermission] = useState<CameraPermission | null>(null);

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const apply = (state: PermissionState) => setPermission({ granted: state === 'granted', canAskAgain: state !== 'denied', status: state === 'prompt' ? 'undetermined' : state });
    navigator.permissions?.query({ name: 'camera' as PermissionName })
      .then(s => { status = s; apply(s.state); s.onchange = () => apply(s.state); })
      .catch(() => setPermission({ granted: false, canAskAgain: true, status: 'undetermined' })); // Safari cannot tell in advance
    return () => { if (status) status.onchange = null; };
  }, []);

  const request = useCallback(async (): Promise<CameraPermission> => {
    let next: CameraPermission;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach(t => t.stop());
      next = { granted: true, canAskAgain: true, status: 'granted' };
    } catch {
      next = { granted: false, canAskAgain: false, status: 'denied' };
    }
    setPermission(next);
    return next;
  }, []);

  return [permission, request];
}

/** The type of a camera view reference, like on the phone: useRef<CameraView>(null). */
export type CameraView = CameraViewHandle;
