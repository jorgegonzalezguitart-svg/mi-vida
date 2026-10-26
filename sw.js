// Permite instalar la app, abrirla aunque falle la red un momento y recibir avisos.
// Solo guarda los archivos de la app, NUNCA tus datos (que van cifrados en Supabase).
const CACHE = 'mi-vida-v16';
const ARCHIVOS = [
  './', 'index.html', 'css/estilos.css',
  'js/app.js', 'js/cripto.js', 'js/datos.js', 'js/config.js',
  'js/fiscal.js', 'js/graficos.js', 'js/inversiones-vistas.js',
  'js/seguridad.js', 'js/dinero.js', 'js/calendario.js', 'js/avisos.js', 'js/vapid.js', 'js/hipoteca.js', 'js/contactos.js', 'js/datos-importantes.js', 'js/contratos.js',
  'manifest.webmanifest', 'iconos/icono.svg', 'iconos/icon-192.png', 'iconos/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
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
    fetch(e.request, { cache: 'no-cache' }) // pregunta siempre al servidor si hay versión nueva
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// ---------- Avisos ----------
function abrirBD() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('mivida', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('avisos', { keyPath: 'clave' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function avisosPendientes() {
  const bd = await abrirBD();
  const todos = await new Promise((ok) => {
    const rq = bd.transaction('avisos').objectStore('avisos').getAll();
    rq.onsuccess = () => ok(rq.result || []);
    rq.onerror = () => ok([]);
  });
  const ahora = Date.now();
  const toca = todos.filter((a) => !a.mostrado && new Date(a.cuando).getTime() <= ahora + 5 * 60000);
  if (toca.length) {
    await new Promise((ok) => {
      const tx = bd.transaction('avisos', 'readwrite');
      for (const a of toca) tx.objectStore('avisos').put({ ...a, mostrado: true });
      tx.oncomplete = ok; tx.onerror = ok;
    });
  }
  bd.close();
  return toca;
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let lista = [];
    try { lista = await avisosPendientes(); } catch { /* sin datos locales */ }
    const base = { icon: 'iconos/icon-192.png', badge: 'iconos/icon-192.png' };
    if (!lista.length) {
      return self.registration.showNotification('Mi Vida', { ...base, body: 'Tienes un aviso pendiente. Abre la app para verlo.', data: { url: './#calendario' } });
    }
    for (const a of lista.slice(-3)) {
      await self.registration.showNotification(a.titulo, { ...base, body: a.cuerpo, tag: a.clave, data: { url: './' + (a.url || '#inicio') } });
    }
    if (lista.length > 3) {
      await self.registration.showNotification('Mi Vida', { ...base, body: `Y ${lista.length - 3} avisos más.`, data: { url: './#calendario' } });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if (v.url.startsWith(self.registration.scope)) { await v.focus(); return v.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
