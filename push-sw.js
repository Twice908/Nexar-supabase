self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  const { title, body, ...data } = payload;

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visibleClient = allClients.find(c => c.visibilityState === 'visible');

    if (visibleClient) {
      visibleClient.postMessage({ type: 'push-foreground', title, body, data });
    } else {
      await self.registration.showNotification(title || 'Nexar', {
        body: body || '',
        icon: 'assets/logo-short-dark.svg',
        data
      });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rideId = event.notification.data?.rideId;
  const target = new URL(rideId ? `?ride=${rideId}` : '', self.registration.scope).href;
  event.waitUntil(clients.openWindow(target));
});