/**
 * Web push for this browser: asking permission, subscribing with the server's public key, and managing the
 * list of devices. The server's key is fetched every time, so the browser and the server can never disagree.
 */
import api from '@/lib/api';

export type PushState =
  | 'loading' | 'error' | 'unsupported' | 'insecure' | 'server-off' | 'default' | 'denied'
  | 'granted-not-subscribed' | 'subscribed-elsewhere' | 'subscribed';

export interface PushStatus { state: PushState; thisHash: string | null }

export interface PushDevice {
  id: string;
  label: string | null;
  browser: string | null;
  os: string | null;
  deviceType: 'MOBILE' | 'TABLET' | 'DESKTOP' | null;
  createdAt: string;
  lastSeenAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  endpointHash: string;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The first 12 hex digits of the SHA-256 of the subscription address, the same value the server sends back for each device. */
export async function endpointHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

export const pushSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The service worker may never become ready (it failed to register); do not wait for it forever. */
async function readyRegistration(ms = 6000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The service worker is not ready')), ms)),
  ]);
}

async function currentSubscription() {
  return (await readyRegistration()).pushManager.getSubscription();
}

/** What the settings page shows for this browser. */
export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return { state: 'unsupported', thisHash: null };
  if (!window.isSecureContext) return { state: 'insecure', thisHash: null };

  const { data: key } = await api.get<{ enabled: boolean; publicKey: string | null }>('/push-notifications/public-key');
  if (!key.enabled) return { state: 'server-off', thisHash: null };
  if (Notification.permission === 'denied') return { state: 'denied', thisHash: null };

  const subscription = await currentSubscription();
  if (!subscription) {
    return { state: Notification.permission === 'granted' ? 'granted-not-subscribed' : 'default', thisHash: null };
  }
  const thisHash = await endpointHash(subscription.endpoint);
  const devices = await listDevices();
  return { state: devices.some(d => d.endpointHash === thisHash) ? 'subscribed' : 'subscribed-elsewhere', thisHash };
}

export async function listDevices(): Promise<PushDevice[]> {
  return (await api.get<PushDevice[]>('/push-notifications/subscriptions')).data;
}

async function subscribeThisBrowser(label?: string) {
  const { data: key } = await api.get<{ enabled: boolean; publicKey: string | null }>('/push-notifications/public-key');
  if (!key.enabled || !key.publicKey) throw new Error('Push is not set up on the server');

  const registration = await readyRegistration();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey) }));

  const json = subscription.toJSON();
  await api.post('/push-notifications/subscribe', {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    userAgent: navigator.userAgent,
    ...(label ? { label } : {}),
  });
}

/** Asks for permission (this must follow a tap or click), then subscribes this browser to the signed-in account. */
export async function enableThisDevice(label?: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  await subscribeThisBrowser(label);
  return 'granted';
}

/** Subscribes this browser again; the server moves it to the signed-in account. */
export const attachThisDevice = () => subscribeThisBrowser();

export async function turnOffThisDevice() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.delete('/push-notifications/unsubscribe/device', { data: { endpoint } });
}

export async function markThisDeviceSeen() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api.post('/push-notifications/seen', { endpoint: subscription.endpoint });
}

export const renameDevice = (id: string, label: string) => api.patch(`/push-notifications/subscriptions/${id}`, { label });
export const removeDevice = (id: string) => api.delete(`/push-notifications/subscriptions/${id}`);

export async function removeAllDevices() {
  await turnOffThisDevice().catch(() => {});
  await api.delete('/push-notifications/unsubscribe/all');
}

export async function sendTestPush(subscriptionId?: string): Promise<{ sent: number; failed: number }> {
  return (await api.post('/push-notifications/test', subscriptionId ? { subscriptionId } : {})).data;
}

/** Called once at start-up. Quietly does nothing where service workers are not available. */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  const register = () => navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker not registered:', err?.message ?? err));
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
