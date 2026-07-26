// CFM Service Worker v1.0
// Cache versioning para atualizar quando necessário
const CACHE_NAME = 'cfm-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE).catch(() => {
        // Se alguma URL falhar, continua anyway
        return URLS_TO_CACHE
          .filter(url => url !== '/index.html')
          .reduce((p, url) => p.then(() => cache.add(url).catch(() => {})), Promise.resolve());
      });
    })
  );
  self.skipWaiting();
});

// Ativação do Service Worker (limpa caches antigos)
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

// Estratégia de Fetch: Network First, Fall back to Cache
self.addEventListener('fetch', (event) => {
  // Ignora requisições não-GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Para recursos externos (CDN, fonts), usa estratégia de cache com fallback
  if (event.request.url.includes('cdn.tailwindcss.com') ||
      event.request.url.includes('cdnjs.cloudflare.com') ||
      event.request.url.includes('fonts.googleapis.com') ||
      event.request.url.includes('fontawesome')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clonedResponse);
            });
            return response;
          }
          return response;
        }).catch(() => {
          // Se falhar e não tem cache, retorna resposta offline
          return new Response('Offline - recurso não disponível', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
    );
    return;
  }

  // Para o index.html e páginas, estratégia Network First
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cria um clone para guardar no cache
        const clonedResponse = response.clone();
        
        if (response.status === 200 && event.request.method === 'GET') {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonedResponse);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Se offline, retorna do cache
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }
          
          // Se não tiver no cache, retorna página offline
          return caches.match('/index.html').then((indexResponse) => {
            return indexResponse || new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        });
      })
  );
});

// Notificação de atualização disponível
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
