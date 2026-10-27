const CACHE_NAME = 'habitlink-v1.0.0';
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
    // Tomar el control de todas las páginas inmediatamente
    self.clients.claim();
});

// 3. Interceptación de peticiones: Estrategia "Cache First, Network Fallback"
self.addEventListener('fetch', (event) => {
    // Ignorar peticiones que no sean GET o que sean de la API de Supabase (necesitan red)
    if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse; // Servir desde caché si existe
            }
            // Si no está en caché, ir a la red
            return fetch(event.request).catch(() => {
                // Fallback offline si no hay red y no está en caché
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});