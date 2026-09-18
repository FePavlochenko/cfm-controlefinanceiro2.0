// CFM Service Worker v2.2 - corrige cache indevido das chamadas do Supabase (dados presos)
const CACHE_NAME = 'cfm-v5';
const URLS_TO_CACHE = [
  '/',
  '/manifest.json'
  // index.html propositalmente fora do cache — sempre busca do servidor
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // index.html: SEMPRE busca do servidor (Network Only)
  // Isso garante que o iPhone sempre pegue a versão mais recente
  if (url.includes('/index.html') || url.endsWith('/') || url === self.location.origin + '/') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Supabase (banco de dados): NUNCA cachear — precisa sempre ser dado fresco.
  // Antes essas chamadas caíam sem querer na regra de CDN abaixo (porque a URL
  // contém "supabase"), o que travava as transações na primeira versão baixada.
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }

  // CDN externos: Cache First (fonts, tailwind, fontawesome, biblioteca supabase-js via jsdelivr)
  if (url.includes('cdn.') || url.includes('cdnjs.') ||
      url.includes('fonts.google') || url.includes('fontawesome') ||
      url.includes('jsdelivr')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Demais recursos: Network First
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});