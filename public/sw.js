// No application responses or private records are cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {}
  const allowed = ['/', '/tarefas', '/financeiro', '/metas', '/configuracoes'];
  const url = allowed.includes(payload.url) ? payload.url : '/';
  event.waitUntil(
    self.registration.showNotification('Level01', {
      body:
        typeof payload.body === 'string'
          ? payload.body.slice(0, 160)
          : 'Você tem um novo lembrete.',
      icon: '/icon-192.png?v=level01-original-v2',
      badge: '/icon-192.png?v=level01-original-v2',
      tag: typeof payload.tag === 'string' ? payload.tag : 'level01-reminder',
      data: { url },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === url.origin) {
          await client.navigate(url.href);
          return client.focus();
        }
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
