const CACHE_NAME = 'habitlink-v1.0.2';  // Cambia de v1.0.1 a v1.0.2
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './js/config.js',
    './js/supabase.js',
    './js/auth.js',
    './js/habits.js',
    './js/partners.js',
    './js/app.js',
    './manifest.json'
];

// 1. Instalación: Cachear archivos estáticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Service Worker: Cacheando archivos de la app');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Forzar al nuevo SW a activarse inmediatamente
    self.skipWaiting();
});

// 2. Activación: Limpiar cachés antiguas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('Service Worker: Eliminando caché antigua', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// 3. Interceptación de peticiones: red primero para mantener la app actualizada
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(async () => {
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) return cachedResponse;
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return Response.error();
            })
    );
});