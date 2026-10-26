import api from '../api';
import { deviceLabel } from '@/lib/device-label';

export type DeviceInfo = {
  id: string;
  deviceName: string;
  platform: string;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
};

/**
 * Tells the server this browser is signed in, so it shows up under Devices. (Web push for this browser is
 * added with the PWA step; until then no push token is sent.)
 */
export async function registerDevice(push?: { channelId?: string; sound?: string }): Promise<void> {
  try {
    await api.post('/devices/register', { deviceName: deviceLabel(), platform: 'web', ...push });
  } catch { /* device registration is best-effort */ }
}

/** True when this browser can receive pushes. Web push arrives with the PWA step, so not yet. */
export async function hasRegisteredPushToken(): Promise<boolean> {
  return false;
}

/** At sign-out. Nothing is registered for push on the web yet. */
export async function unregisterPush(): Promise<void> {}

export async function getDevices(): Promise<DeviceInfo[]> {
  const res = await api.get<DeviceInfo[]>('/devices');
  return res.data;
}

export async function removeDevice(deviceId: string): Promise<{ message: string }> {
  const res = await api.delete<{ message: string }>(`/devices/${deviceId}`);
  return res.data;
}
