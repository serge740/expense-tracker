import api from '../api';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

export type DeviceInfo = {
  id: string;
  deviceName: string;
  platform: string;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
};

export async function registerDevice(): Promise<void> {
  try {
    const deviceName = Device.deviceName || Device.modelName || 'Unknown Device';
    const platform   = Platform.OS;

    let pushToken: string | undefined;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        pushToken = tokenData.data;
      }
    } catch { /* push token is optional */ }

    await api.post('/devices/register', { deviceName, platform, pushToken });
  } catch { /* device registration is best-effort */ }
}

export async function getDevices(): Promise<DeviceInfo[]> {
  const res = await api.get<DeviceInfo[]>('/devices');
  return res.data;
}

export async function removeDevice(deviceId: string): Promise<{ message: string }> {
  const res = await api.delete<{ message: string }>(`/devices/${deviceId}`);
  return res.data;
}
