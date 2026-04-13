/* =====================================================
   Lua — Service Worker (PWA + Push Notifications)
   ===================================================== */
const CACHE_NAME   = 'lua-v9';
const STATIC_SHELL = [
  '/',
  '/onboarding',
  '/dashboard',
  '/calendar',
  '/daily-log',
  '/partner',
  '/settings',
  '/forgot-password',
  '/css/variables.css',
  '/css/main.css',
  '/css/auth.css',
  '/css/onboarding.css',
  '/css/dashboard.css',
  '/css/calendar.css',
  '/css/daily-log.css',
  '/css/partner.css',
  '/css/settings.css',
  '/js/config.js',
  '/js/auth.js',
  '/js/cycle.js',
  '/js/onboarding.js',
  '/js/dashboard.js',
  '/js/calendar.js',
  '/js/daily-log.js',
  '/js/partner.js',
  '/js/notifications.js',
  '/js/settings.js',
  '/js/sw-register.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/logo.svg',
];

// ---- Install: pre-cache app shell ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_SHELL))
  );
  self.skipWaiting();
});

// ---- Activate: clean up old caches ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---- Fetch: Network-first for API, Cache-first for shell ----
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and Supabase API requests (always network)
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // App shell: cache-first
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a fallback offline page if available
    return caches.match('/index.html');
  }
}

// ---- Push Notifications ----
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'Lua', body: event.data.text() }; }

  const { title = 'Lua', body = '', icon = '/icons/icon-192.png', url = '/' } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge:  '/icons/icon-192.png',
      data:   { url },
      vibrate: [200, 100, 200],
    })
  );
});

// ---- Notification click: open/focus app ----
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
