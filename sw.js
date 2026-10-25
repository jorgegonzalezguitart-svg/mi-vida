// Permite instalar la app y abrirla aunque falle la red un momento.
// Solo guarda los archivos de la app, NUNCA tus datos (que van cifrados en Supabase).
const CACHE = 'mi-vida-v7';
const ARCHIVOS = [
  './', 'index.html', 'css/estilos.css',
  'js/app.js', 'js/cripto.js', 'js/datos.js', 'js/config.js',
  'js/fiscal.js', 'js/graficos.js', 'js/inversiones-vistas.js',
  'manifest.webmanifest', 'iconos/icono.svg', 'iconos/icon-192.png', 'iconos/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero intenta internet (así siempre tienes la última versión); si no hay, usa la copia.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
