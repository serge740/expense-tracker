import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/** Runs the real public/sw.js inside a fake service-worker scope and returns its listeners and spies. */
function load(windows: { url: string; focus: () => Promise<void>; navigate: (u: string) => Promise<void>; postMessage: (m: unknown) => void }[] = []) {
  const listeners: Record<string, (e: any) => void> = {};
  const shown: { title: string; options: any }[] = [];
  const openWindow = vi.fn(async (_: string) => undefined);
  const self = {
    location: { origin: 'https://rabbit.test' },
    addEventListener: (type: string, fn: (e: any) => void) => { listeners[type] = fn; },
    skipWaiting: vi.fn(),
    registration: { showNotification: async (title: string, options: any) => { shown.push({ title, options }); } },
    clients: { claim: vi.fn(async () => {}), matchAll: async () => windows, openWindow },
  };
  vm.runInNewContext(readFileSync(join(__dirname, '../../public/sw.js'), 'utf8'), { self, URL, JSON, Boolean });
  const run = async (type: string, event: object) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    await pending;
  };
  return { self, shown, openWindow, run, listeners };
}

const pushEvent = (payload: object | string | null) => ({
  data: payload === null ? null : { json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload), text: () => String(payload) },
});

describe('push', () => {
  test('shows the notification with the app icon, a tag and the link to open', async () => {
    const { shown, run } = load();
    await run('push', pushEvent({ title: 'Payment due', body: 'John, 75,000', tag: 'reminder-r1', url: '/app/debts?openId=d1', timestamp: 5, recipientRowId: 'n7' }));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('Payment due');
    expect(shown[0].options).toMatchObject({
      body: 'John, 75,000', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: 'reminder-r1', renotify: true, timestamp: 5,
      data: { url: '/app/debts?openId=d1', recipientRowId: 'n7' },
    });
  });

  test('reminders and urgent alerts stay on screen until tapped; ordinary ones do not', async () => {
    const { shown, run } = load();
    await run('push', pushEvent({ title: 'a', stay: true }));
    await run('push', pushEvent({ title: 'b', urgent: true }));
    await run('push', pushEvent({ title: 'c' }));
    expect(shown.map(s => s.options.requireInteraction)).toEqual([true, true, false]);
  });

  test('without a tag it does not renotify, and the link defaults to the inbox', async () => {
    const { shown, run } = load();
    await run('push', pushEvent({ title: 'x' }));
    expect(shown[0].options.renotify).toBe(false);
    expect(shown[0].options.data.url).toBe('/app/notifications');
  });

  test('a plain-text or empty push still shows something', async () => {
    const { shown, run } = load();
    await run('push', { data: { json: () => { throw new Error('not json'); }, text: () => 'hello' } });
    await run('push', pushEvent(null));
    expect(shown.map(s => [s.title, s.options.body])).toEqual([['AbyEx', 'hello'], ['AbyEx', '']]);
  });

  test('tells every open tab, so its unread count refreshes', async () => {
    const postMessage = vi.fn();
    const { run } = load([{ url: 'https://rabbit.test/app', focus: async () => {}, navigate: async () => {}, postMessage }]);
    await run('push', pushEvent({ title: 'x', tag: 't1' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'push-received', tag: 't1' });
  });
});

describe('click', () => {
  const click = (data: object) => { const close = vi.fn(); return { event: { notification: { close, data } }, close }; };

  test('closes the notification and focuses an open tab, taking it to the link (marking the inbox row as read)', async () => {
    const focus = vi.fn(async () => {});
    const navigate = vi.fn(async (_: string) => {});
    const { run } = load([{ url: 'https://rabbit.test/app/wallets', focus, navigate, postMessage: () => {} }]);
    const { event, close } = click({ url: '/app/debts?openId=d1', recipientRowId: 'n7' });
    await run('notificationclick', event);
    expect(close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('https://rabbit.test/app/debts?openId=d1&fromPush=n7');
  });

  test('opens a new window when the app is not open', async () => {
    const { run, openWindow } = load([]);
    await run('notificationclick', click({ url: '/app/scheduled?id=s1' }).event);
    expect(openWindow).toHaveBeenCalledWith('https://rabbit.test/app/scheduled?id=s1');
  });

  test('ignores tabs of other sites, and defaults to the inbox', async () => {
    const focus = vi.fn(async () => {});
    const { run, openWindow } = load([{ url: 'https://other.example/app', focus, navigate: async () => {}, postMessage: () => {} }]);
    await run('notificationclick', click({}).event);
    expect(focus).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith('https://rabbit.test/app/notifications');
  });
});

describe('lifecycle', () => {
  test('takes over straight away on install and activate, and never caches files', async () => {
    const { self, run, listeners } = load();
    listeners['install']({});
    expect(self.skipWaiting).toHaveBeenCalled();
    await run('activate', {});
    expect(self.clients.claim).toHaveBeenCalled();
    expect(listeners['fetch']).toBeUndefined();
  });
});
