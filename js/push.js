import { VAPID_PUBLIC_KEY } from './config.js';
import { supabaseFetch } from './core.js';
import { toast } from './ui.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function initPush(userEmail) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'denied') return;

  try {
    const registration = await navigator.serviceWorker.register('push-sw.js');

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'push-foreground') {
        const { title, body } = event.data;
        toast(body ? `${title}: ${body}` : title);
      }
    });

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const sub = subscription.toJSON();
    await supabaseFetch('push_subscriptions', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_email: userEmail,
        endpoint: sub.endpoint,
        subscription: sub,
        device_info: navigator.userAgent
      })
    });
  } catch (e) {
    console.error('initPush failed:', e);
  }
}