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

const PUSH_TOKEN_KEY = 'registeredPushToken';

/** True when this phone has an Expo push token saved on the server. */
export async function hasRegisteredPushToken(): Promise<boolean> {
  try { return !!(await SecureStore.getItemAsync(PUSH_TOKEN_KEY)); } catch { return false; }
}

/** At sign-out: tell the server this phone should stop receiving this account's pushes. Never throws. */
export async function unregisterPush(): Promise<void> {
  try {
    const pushToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (!pushToken) return;
    await api.post('/devices/unregister-push', { pushToken });
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch { /* sign-out must not fail because of this */ }
}

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
        await SecureStore.setItemAsync(PUSH_TOKEN_KEY, pushToken).catch(() => {});
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
