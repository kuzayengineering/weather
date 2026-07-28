// App-shell service worker. Bump CACHE_VERSION on any deploy that changes a
// precached file so clients pick up the new set and drop the old cache.
//
// Scope: only caches this app's own static files (HTML/CSS/JS/icons) so the
// app can load at all when offline. Weather data itself is cached separately,
// with its own staleness tracking, by js/lib/storage.js + js/api/nws.js —
// this worker deliberately leaves api.weather.gov (and other cross-origin)
// requests alone rather than trying to cache them too.

const CACHE_VERSION = 'v3';
const CACHE_NAME = `weather-realm-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './img/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.ico',
  './js/app.js',
  './js/api/nws.js',
  './js/lib/airnow.js',
  './js/lib/dailySymbol.js',
  './js/lib/geo.js',
  './js/lib/geocode.js',
  './js/lib/griddata.js',
  './js/lib/icons.js',
  './js/lib/mapTiles.js',
  './js/lib/psychro.js',
  './js/lib/storage.js',
  './js/lib/sun.js',
  './js/lib/theme.js',
  './js/lib/units.js',
  './js/lib/wind.js',
  './js/tabs/daily.js',
  './js/tabs/home.js',
  './js/tabs/hourly.js',
  './js/tabs/maps.js',
  './js/tabs/settings.js',
  './js/vendor/chart.umd.js',
  './js/vendor/leaflet.js',
  './js/vendor/leaflet.css',
  './js/vendor/images/layers.png',
  './js/vendor/images/layers-2x.png',
  './js/vendor/images/marker-icon.png',
  './js/vendor/images/marker-icon-2x.png',
  './js/vendor/images/marker-shadow.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle our own same-origin app-shell files — everything else
  // (api.weather.gov, Nominatim, AirNow, radar/satellite tiles, OSM tiles)
  // passes straight through to the network untouched.
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
