importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAVSkmo77MV4nQWsvXUHJ2gNqU5IsgmL4w',
  authDomain: 'hotelss-5d21e.firebaseapp.com',
  projectId: 'hotelss-5d21e',
  storageBucket: 'hotelss-5d21e.firebasestorage.app',
  messagingSenderId: '690208902258',
  appId: '1:690208902258:web:e340e732a111fa6df306eb'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const notification = payload.notification || {};
  const title = notification.title || payload.data?.title || 'Cityport Hotel';
  const options = {
    body: notification.body || payload.data?.body || '',
    icon: notification.icon || 'https://cityporthotel.com/wp-content/uploads/2021/04/city-port-mini-1.png',
    badge: notification.badge || 'https://cityporthotel.com/wp-content/uploads/2021/04/city-port-mini-1.png',
    data: { url: payload.data?.url || '/' }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    const matchingClient = windowClients.find(client => client.url.startsWith(self.location.origin));
    return matchingClient ? matchingClient.focus() : clients.openWindow(targetUrl);
  }));
});

const CACHE_NAME = 'cityport-guest-shell-v22';
const APP_SHELL = ['/', '/styles.css', '/app.js', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith('/api/')) return;

  if (requestUrl.pathname === '/' || requestUrl.pathname === '/app.js' || requestUrl.pathname === '/sw.js') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('/'))
    )
  );
});
