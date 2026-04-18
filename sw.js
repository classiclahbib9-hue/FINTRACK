const CACHE = 'fintrack-v27';
const STATIC = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// App files: always try network first so updates land instantly
const APP_FILES = [
    './style.css',
    './app.js'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll([...STATIC, ...APP_FILES]))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);
    const isAppFile = APP_FILES.some(f => url.pathname.endsWith(f.replace('./', '/')));

    if (isAppFile) {
        // Network-first: always fetch fresh, fall back to cache only if offline
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
    } else {
        // Cache-first for static assets (icons, manifest)
        e.respondWith(
            caches.match(e.request)
                .then(cached => cached || fetch(e.request).then(res => {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                    return res;
                }))
        );
    }
});
