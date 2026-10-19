import api from '../api';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

export type DeviceInfo = {
  id: string;
  deviceName: string;
  platform: string;
  ipAddress: string | null;
  lastActiveAt: string;
  createdAt: string;
};

/**
 * Registers this device with the server. Asks for notification permission
 * (once) and sends the Expo push token plus the Android channel / iOS sound
 * the server should use, so pushes ring even when the app is closed.
 */
export async function registerDevice(push?: { channelId?: string; sound?: string }): Promise<void> {
  try {
    const deviceName = Device.deviceName || Device.modelName || 'Unknown Device';
    const platform   = Platform.OS;

    let pushToken: string | undefined;
    try {
      let { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== 'granted' && canAskAgain) {
        ({ status } = await Notifications.requestPermissionsAsync());
      }
      if (status === 'granted' && Device.isDevice) {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        pushToken = tokenData.data;
      }
    } catch { /* push token is optional (e.g. Expo Go on Android) */ }

    await api.post('/devices/register', { deviceName, platform, pushToken, ...push });
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
