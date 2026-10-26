// AbyExpense service worker. It only handles notifications: it shows a push when one arrives (even if the
// app is closed) and routes the click. It never caches app files, so an update to the app is always seen at once.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { title: 'AbyExpense', body: event.data.text() };
  }
}

self.addEventListener('push', (event) => {
  const p = readPayload(event);
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(p.title || 'AbyExpense', {
        body: p.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        // The same tag replaces the notification already on screen instead of stacking a copy.
        tag: p.tag,
        renotify: Boolean(p.tag),
        // Urgent alerts and reminders stay until they are tapped.
        requireInteraction: Boolean(p.urgent || p.stay),
        timestamp: p.timestamp,
        data: { url: p.url || '/app/notifications', recipientRowId: p.recipientRowId },
      });
      // Tell any open tab, so its unread count and reminder pop-up update right away.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      windows.forEach((client) => client.postMessage({ type: 'push-received', tag: p.tag }));
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || '/app/notifications', self.location.origin);
  // The app marks this inbox row as read when it opens with this marker.
  if (data.recipientRowId) target.searchParams.set('fromPush', data.recipientRowId);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const same = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (same) {
        await same.focus();
        return same.navigate(target.href);
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
