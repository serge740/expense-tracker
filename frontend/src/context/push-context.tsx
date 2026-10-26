import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from '@/rn';
import {
  attachThisDevice, enableThisDevice, getPushStatus, listDevices, markThisDeviceSeen, removeAllDevices, removeDevice, renameDevice,
  sendTestPush, turnOffThisDevice, type PushDevice, type PushStatus,
} from '@/lib/push';

interface PushContextValue {
  status: PushStatus;
  devices: PushDevice[];
  refresh: () => Promise<void>;
  enable: (label?: string) => Promise<NotificationPermission | undefined>;
  attach: () => Promise<void | undefined>;
  turnOff: () => Promise<void | undefined>;
  rename: (id: string, label: string) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  removeAll: () => Promise<unknown>;
  test: (id?: string) => Promise<{ sent: number; failed: number } | undefined>;
}

const PushContext = createContext<PushContextValue | null>(null);

const message = (e: unknown, fallback: string) => {
  const err = e as { response?: { data?: { message?: string } }; message?: string };
  return err?.response?.data?.message ?? err?.message ?? fallback;
};

/** This browser's push state and the account's device list. Mounted while signed in. */
export function PushProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PushStatus>({ state: 'loading', thisHash: null });
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const seenSent = useRef(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const attempt = ++latest.current;
    try {
      const next = await getPushStatus();
      const list = next.state === 'unsupported' || next.state === 'insecure' || next.state === 'server-off' ? [] : await listDevices().catch(() => []);
      if (attempt !== latest.current) return;
      setStatus(next);
      setDevices(list);
    } catch {
      if (attempt === latest.current) setStatus({ state: 'error', thisHash: null });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Tell the server this browser is still in use, once per visit.
  useEffect(() => {
    if (status.state !== 'subscribed' || seenSent.current) return;
    seenSent.current = true;
    markThisDeviceSeen().catch(() => {});
  }, [status.state]);

  const run = async <T,>(work: () => Promise<T>, failure: string): Promise<T | undefined> => {
    try {
      const result = await work();
      await refresh();
      return result;
    } catch (e) {
      Alert.alert('Notifications', message(e, failure));
      return undefined;
    }
  };

  const value: PushContextValue = {
    status, devices, refresh,
    enable: label => run(() => enableThisDevice(label), 'Could not turn on notifications'),
    attach: () => run(() => attachThisDevice(), 'Could not move this device'),
    turnOff: () => run(() => turnOffThisDevice(), 'Could not turn off notifications'),
    rename: (id, label) => run(() => renameDevice(id, label), 'Could not rename the device'),
    remove: id => run(() => removeDevice(id), 'Could not remove the device'),
    removeAll: () => run(() => removeAllDevices(), 'Could not remove devices'),
    test: id => run(() => sendTestPush(id), 'Could not send a test'),
  };
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush(): PushContextValue {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error('usePush must be used inside a PushProvider');
  return ctx;
}
