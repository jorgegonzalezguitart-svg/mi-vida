// Avisos en el móvil (notificaciones push).
// - El texto de cada aviso se guarda SOLO en este dispositivo (IndexedDB).
// - A Supabase solo se le dice "a tal hora hay un aviso" (mivida_avisos.cuando), sin contenido.
// - Una función programada (mivida-avisos) envía un push genérico a esa hora y el móvil muestra el texto local.
import { VAPID_PUBLICA } from './vapid.js';
import { ocurrencias } from './calendario.js';

const T_AVISOS = 'mivida_avisos';
const T_PUSH = 'mivida_push';
const DIAS_CADUCIDAD = [90, 30, 7, 0];

// ---------- IndexedDB (compartido con sw.js) ----------
function abrirBD() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('mivida', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('avisos', { keyPath: 'clave' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function guardarLocal(lista) {
  const bd = await abrirBD();
  await new Promise((ok, ko) => {
    const tx = bd.transaction('avisos', 'readwrite');
    const st = tx.objectStore('avisos');
    st.clear();
    for (const a of lista) st.put(a);
    tx.oncomplete = ok; tx.onerror = () => ko(tx.error);
  });
  bd.close();
}
export async function borrarAvisosLocales() { try { await guardarLocal([]); } catch { /* nada */ } }

// ---------- Cálculo de avisos ----------
const a2 = (n) => String(n).padStart(2, '0');
const fechaLocal = (iso, hora = '09:00') => { const [y, m, d] = iso.split('-').map(Number); const [h, mi] = hora.split(':').map(Number); return new Date(y, m - 1, d, h, mi); };
const corta = (d) => `${a2(d.getDate())}/${a2(d.getMonth() + 1)}/${d.getFullYear()}`;

export function calcularAvisos(estado) {
  const ahora = Date.now();
  const limite = ahora + 400 * 86400000;
  const lista = [];
  for (const d of estado.docs || []) {
    if (!d.caduca) continue;
    const dia = fechaLocal(d.caduca);
    for (const n of DIAS_CADUCIDAD) {
      const cuando = new Date(dia.getTime() - n * 86400000);
      if (cuando.getTime() < ahora || cuando.getTime() > limite) continue;
      lista.push({ cuando, titulo: `⏰ ${d.titulo}`, cuerpo: n ? `Caduca en ${n} días (${corta(dia)}).` : 'Caduca hoy.', url: `#doc/${d.id}` });
    }
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const fin = new Date(limite).toISOString().slice(0, 10);
  for (const ev of (estado.registros || []).filter((r) => r.tipo === 'evento' && r.aviso && r.aviso !== 'no')) {
    for (const f of ocurrencias(ev, hoy, fin)) {
      const momento = fechaLocal(f, ev.hora || '09:00');
      const cuando = new Date(momento.getTime() - Number(ev.aviso) * 60000);
      if (cuando.getTime() < ahora || cuando.getTime() > limite) continue;
      lista.push({ cuando, titulo: `📌 ${ev.titulo}`, cuerpo: `${corta(momento)}${ev.hora ? ' a las ' + ev.hora : ''}`, url: `#calendario?m=${f.slice(0, 7)}&d=${f}` });
    }
  }
  lista.sort((a, b) => a.cuando - b.cuando);
  return lista.slice(0, 300).map((a, k) => ({ ...a, cuando: a.cuando.toISOString(), clave: `${a.cuando.toISOString()}#${k}` }));
}

// ---------- Estado y activación ----------
export function pushDisponible() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function suscripcion() {
  if (!pushDisponible()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

const deBase64Url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export async function activarPush(ctx) {
  if (!pushDisponible()) throw new Error('Este navegador no admite avisos. En Android usa Chrome y, mejor, instala la app.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para esta web.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deBase64Url(VAPID_PUBLICA) });
  const j = sub.toJSON();
  const { error } = await ctx.sb.from(T_PUSH).upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
  await sincronizar(ctx);
  await reg.showNotification('Mi Vida', { body: '✅ Avisos activados en este dispositivo.', icon: 'iconos/icon-192.png', badge: 'iconos/icon-192.png' });
}

export async function desactivarPush(ctx) {
  const sub = await suscripcion();
  if (sub) {
    await ctx.sb.from(T_PUSH).delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  await borrarAvisosLocales();
}

// Recalcula los avisos y los sube (solo horas) si este dispositivo tiene los avisos activados
export async function sincronizar(ctx) {
  try {
    const sub = await suscripcion();
    if (!sub || Notification.permission !== 'granted') return { activos: false };
    const lista = calcularAvisos(ctx.estado);
    await guardarLocal(lista);
    const ahora = new Date().toISOString();
    await ctx.sb.from(T_AVISOS).delete().eq('enviado', false).gte('cuando', ahora);
    const horas = [...new Set(lista.map((a) => a.cuando.slice(0, 16) + ':00.000Z'))];
    for (let k = 0; k < horas.length; k += 200) {
      const { error } = await ctx.sb.from(T_AVISOS).insert(horas.slice(k, k + 200).map((cuando) => ({ cuando })));
      if (error) throw error;
    }
    return { activos: true, n: lista.length, proximo: lista[0] };
  } catch (e) {
    console.warn('Avisos sin sincronizar:', e);
    return { activos: false, error: e.message || String(e) };
  }
}

// Tarjeta reutilizable (Calendario y Ajustes)
export async function pintarAvisos(ctx, caja) {
  if (!caja) return;
  const { esc } = ctx;
  if (!pushDisponible()) {
    caja.innerHTML = '<section class="tarjeta"><h2>🔔 Avisos en el móvil</h2><p class="ayuda">Este navegador no admite avisos. En Android, abre la app en Chrome e instálala.</p></section>';
    return;
  }
  const sub = await suscripcion();
  const activos = !!sub && Notification.permission === 'granted';
  const lista = calcularAvisos(ctx.estado);
  caja.innerHTML = `<section class="tarjeta"><h2>🔔 Avisos en el móvil</h2>
    ${activos
      ? `<p>✅ Activados en este dispositivo. ${lista.length} avisos programados${lista[0] ? `; el próximo: <b>${esc(lista[0].titulo)}</b> (${new Date(lista[0].cuando).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })})` : ''}.</p>
         <p class="ayuda">Caducidades: 3 meses, 1 mes, 1 semana antes y el mismo día (9:00). Eventos: según elijas en cada uno.
         A Supabase solo le llega la hora; el texto se queda en tu móvil.</p>
         <div class="acciones"><button class="btn" id="av-sync">🔄 Recalcular</button><button class="btn texto" id="av-off">Desactivar</button></div>`
      : `<p class="ayuda">Recibe una notificación cuando algo vaya a caducar o tengas un evento, aunque la app esté cerrada.</p>
         <button class="btn primario" id="av-on">🔔 Activar avisos</button>`}
    <p class="error" id="av-err"></p></section>`;
  const err = caja.querySelector('#av-err');
  caja.querySelector('#av-on')?.addEventListener('click', (e) => ctx.ocupado(e.target, 'Activando…', async () => {
    try { await activarPush(ctx); ctx.aviso('Avisos activados 🔔'); pintarAvisos(ctx, caja); } catch (x) { err.textContent = x.message || x; }
  }));
  caja.querySelector('#av-off')?.addEventListener('click', (e) => ctx.ocupado(e.target, 'Desactivando…', async () => {
    await desactivarPush(ctx); ctx.aviso('Avisos desactivados'); pintarAvisos(ctx, caja);
  }));
  caja.querySelector('#av-sync')?.addEventListener('click', (e) => ctx.ocupado(e.target, 'Recalculando…', async () => {
    const r = await sincronizar(ctx); if (r.error) err.textContent = r.error; else { ctx.aviso(`${r.n} avisos programados`); pintarAvisos(ctx, caja); }
  }));
}
