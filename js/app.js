import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import * as C from './cripto.js';
import { CATEGORIAS, LISTA } from './datos.js';
import * as V from './inversiones-vistas.js';
import * as S from './seguridad.js';
import * as D from './dinero.js';
import * as K from './calendario.js';
import * as A from './avisos.js';

// ============================================================
//  Estado y utilidades
// ============================================================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');

const configurado = SUPABASE_URL.startsWith('https://');
const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
// Todo lleva el prefijo "mivida" para convivir sin choques en un proyecto de Supabase compartido
const BUCKET = 'mivida-documentos';
const T_BOVEDA = 'mivida_boveda';
const T_DOCS = 'mivida_documentos';
const T_CLAVES = 'mivida_contrasenas';
const T_INV = 'mivida_inversiones';
const T_REG = 'mivida_registros';
const TABLAS = { boveda: T_BOVEDA, docs: T_DOCS, claves: T_CLAVES, inversiones: T_INV, registros: T_REG };
const BLOQUEO_MINUTOS = 5;

const estado = { usuario: null, boveda: null, llave: null, docs: [], claves: [], inversiones: [], registros: [], sinTablaInv: false, sinTablaReg: false };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let urlsTemporales = [];
function liberarURLs() { urlsTemporales.forEach((u) => URL.revokeObjectURL(u)); urlsTemporales = []; }

function pintar(html) {
  liberarURLs();
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

function aviso(mensaje, tipo = 'ok') {
  const a = $('#aviso');
  a.textContent = mensaje;
  a.className = tipo;
  a.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => { a.hidden = true; }, 3500);
}

async function ocupado(boton, texto, tarea) {
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = texto;
  try { return await tarea(); } finally { boton.disabled = false; boton.textContent = original; }
}

function ir(hash) {
  if (location.hash === hash) router(); else location.hash = hash;
}

const fecha = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

function diasHasta(iso) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + 'T00:00:00') - hoy) / 86400000);
}

function estadoCaducidad(iso) {
  if (!iso) return null;
  const d = diasHasta(iso);
  if (d < 0) return { clase: 'rojo', texto: `Caducado hace ${-d} día${d === -1 ? '' : 's'}` };
  if (d === 0) return { clase: 'rojo', texto: 'Caduca hoy' };
  if (d <= 90) return { clase: 'amarillo', texto: `Caduca en ${d} día${d === 1 ? '' : 's'}` };
  return { clase: 'verde', texto: `Válido hasta ${fecha(iso)}` };
}

const categoria = (id) => CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];

// "No aplica" de la lista: preferencia de este dispositivo
function noAplica() { try { return JSON.parse(localStorage.getItem('mv-no-aplica') || '[]'); } catch { return []; } }
function guardarNoAplica(lista) { try { localStorage.setItem('mv-no-aplica', JSON.stringify(lista)); } catch { /* sin almacenamiento */ } }
const subido = (clave) => estado.docs.some((d) => d.lista === clave);

// ============================================================
//  Arranque, sesión y clave maestra
// ============================================================
async function arrancar() {
  $('#menu').hidden = true;
  if (!configurado) return vistaSinConfig();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return vistaLogin();
  estado.usuario = session.user;
  if (!estado.boveda) {
    const { data, error } = await sb.from(T_BOVEDA).select('*').maybeSingle();
    if (error) return vistaError(error);
    estado.boveda = data;
  }
  if (!estado.boveda) return vistaCrearClave();
  if (!estado.llave) return vistaDesbloquear();
  return router();
}

function vistaSinConfig() {
  pintar(`<section class="centro">
    <div class="logo">🗂️</div><h1>Mi Vida</h1>
    <div class="tarjeta"><p>Falta conectar la app con Supabase.</p>
    <p class="ayuda">Hay que poner la dirección y la clave pública del proyecto en <code>js/config.js</code>.
    Pídeselo a Claude: "conecta Mi Vida con Supabase".</p></div></section>`);
}

function vistaError(error) {
  console.error(error);
  pintar(`<section class="centro"><h1>Algo ha fallado</h1>
    <div class="tarjeta"><p>${esc(error.message || error)}</p>
    <button class="btn primario" id="reintentar">Reintentar</button></div></section>`);
  $('#reintentar').onclick = () => location.reload();
}

function vistaLogin() {
  pintar(`<section class="centro">
    <div class="logo">🗂️</div><h1>Mi Vida</h1><p class="sub">Tu vida, ordenada y protegida.</p>
    <form id="f" class="tarjeta">
      <label>Correo<input type="email" name="email" autocomplete="username" required></label>
      <label>Contraseña<input type="password" name="pass" autocomplete="current-password" required></label>
      <button class="btn primario" type="submit">Entrar</button>
      <p class="error" id="err"></p>
    </form></section>`);
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    ocupado(e.submitter || $('#f button'), 'Entrando…', async () => {
      const { error } = await sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('pass') });
      if (error) { $('#err').textContent = 'No se pudo entrar: revisa el correo y la contraseña.'; return; }
      await arrancar();
    });
  };
}

function vistaCrearClave() {
  pintar(`<section class="centro">
    <div class="logo">🔐</div><h1>Crea tu clave maestra</h1>
    <div class="tarjeta">
      <p>Con esta clave se cifran tus documentos y contraseñas <b>en tu propio móvil</b>, antes de subirlos.
      Nadie más puede leerlos: ni Supabase, ni Claude, ni nadie que entre en la base de datos.</p>
      <p class="alerta">⚠️ Si la olvidas, <b>no hay forma de recuperar</b> tus documentos.
      Escríbela en papel y guárdala en casa.</p>
      <p class="ayuda">Es distinta de la contraseña para entrar. Usa una frase larga que recuerdes,
      por ejemplo cuatro palabras al azar.</p>
    </div>
    <form id="f" class="tarjeta">
      <label>Clave maestra (mínimo 12 caracteres)<input type="password" name="c1" minlength="12" autocomplete="new-password" required></label>
      <label>Repítela<input type="password" name="c2" minlength="12" autocomplete="new-password" required></label>
      <label class="check"><input type="checkbox" required> Entiendo que si la olvido, se pierde todo</label>
      <button class="btn primario" type="submit">Crear clave maestra</button>
      <p class="error" id="err"></p>
    </form>
    <button class="btn texto" id="hoja">🖨️ Imprimir hoja de recuperación</button>
  </section>`);
  $('#hoja').onclick = imprimirHoja;
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('c1') !== f.get('c2')) { $('#err').textContent = 'Las dos claves no coinciden.'; return; }
    ocupado($('#f button'), 'Preparando el cifrado…', async () => {
      const sal = C.nuevaSal();
      const llave = await C.derivarClave(f.get('c1'), sal, C.ITERACIONES);
      const comprobacion = await C.cifrarJSON(llave, { ok: 'mi-vida' });
      const { data, error } = await sb.from(T_BOVEDA)
        .insert({ sal, iteraciones: C.ITERACIONES, comprobacion }).select().single();
      if (error) { $('#err').textContent = 'No se pudo guardar: ' + error.message; return; }
      estado.boveda = data;
      await abrirBoveda(llave);
      aviso('Clave maestra creada 🔒');
    });
  };
}

function vistaDesbloquear() {
  pintar(`<section class="centro">
    <div class="logo">🔒</div><h1>Mi Vida está bloqueada</h1>
    <form id="f" class="tarjeta">
      <label>Clave maestra<input type="password" name="c" autocomplete="current-password" required autofocus></label>
      <button class="btn primario" type="submit">Desbloquear</button>
      <p class="error" id="err"></p>
    </form>
    ${S.huellaActiva(estado.usuario?.id) ? '<button class="btn huella" id="huella">👆 Desbloquear con huella</button>' : ''}
    <button class="btn texto" id="salir">Cerrar sesión</button>
  </section>`);
  $('#salir').onclick = cerrarSesion;
  const botonHuella = $('#huella');
  if (botonHuella) {
    const usarHuella = () => ocupado(botonHuella, 'Esperando a la huella…', async () => {
      try { await abrirBoveda(await S.desbloquearConHuella(ctxApp())); } catch (e) { $('#err').textContent = e.message || 'No se pudo usar la huella.'; }
    });
    botonHuella.onclick = usarHuella;
  }
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const clave = new FormData(e.target).get('c');
    ocupado($('#f button'), 'Comprobando…', async () => {
      const b = estado.boveda;
      let llave;
      try {
        llave = await C.derivarClave(clave, b.sal, b.iteraciones);
        await C.descifrarJSON(llave, b.comprobacion);
      } catch {
        $('#err').textContent = 'Clave maestra incorrecta.';
        return;
      }
      await abrirBoveda(llave);
    });
  };
}

async function abrirBoveda(llave) {
  estado.llave = llave;
  try {
    await cargarTodo();
  } catch (error) {
    estado.llave = null;
    return vistaError(error);
  }
  vigilarInactividad();
  A.sincronizar(ctxApp()); // mantiene al día las horas de aviso (solo si este móvil tiene avisos activados)
  ir(location.hash && location.hash !== '#' ? location.hash : '#inicio');
}

async function cargarTodo() {
  const [d, c] = await Promise.all([
    sb.from(T_DOCS).select('id, datos'),
    sb.from(T_CLAVES).select('id, datos'),
  ]);
  if (d.error) throw d.error;
  if (c.error) throw c.error;
  estado.docs = await Promise.all(d.data.map(async (r) =>
    ({ ...(await C.descifrarJSON(estado.llave, r.datos)), id: r.id })));
  estado.claves = await Promise.all(c.data.map(async (r) =>
    ({ ...(await C.descifrarJSON(estado.llave, r.datos)), id: r.id })));
  // Inversiones: si aún no se ha creado la tabla en Supabase, la app sigue funcionando sin ellas
  const inv = await sb.from(T_INV).select('id, datos');
  estado.sinTablaInv = !!inv.error;
  if (inv.error) console.warn('Sin tabla de inversiones:', inv.error.message);
  estado.inversiones = inv.error ? [] : await Promise.all(inv.data.map(async (r) =>
    ({ ...(await C.descifrarJSON(estado.llave, r.datos)), id: r.id })));
  // Registros (dinero, calendario…): igual, la app funciona aunque falte la tabla
  const reg = await sb.from(T_REG).select('id, datos');
  estado.sinTablaReg = !!reg.error;
  estado.registros = reg.error ? [] : await Promise.all(reg.data.map(async (r) =>
    ({ ...(await C.descifrarJSON(estado.llave, r.datos)), id: r.id })));
}

// Guarda un registro genérico cifrado (movimiento, evento…) y recalcula los avisos
async function guardarRegistro(obj) {
  if (estado.sinTablaReg) throw new Error('Falta crear la tabla mivida_registros en Supabase (supabase/extras.sql).');
  const { id, ...datos } = obj;
  const regId = id || crypto.randomUUID();
  const { error } = await sb.from(T_REG).upsert({
    id: regId, datos: await C.cifrarJSON(estado.llave, datos), actualizado: new Date().toISOString(),
  });
  if (error) throw error;
  const r = { ...datos, id: regId };
  estado.registros = estado.registros.filter((x) => x.id !== regId).concat(r);
  A.sincronizar(ctxApp());
  return r;
}

async function borrarRegistro(id) {
  const { error } = await sb.from(T_REG).delete().eq('id', id);
  if (error) throw error;
  estado.registros = estado.registros.filter((x) => x.id !== id);
  A.sincronizar(ctxApp());
}

// Utilidades que se pasan a los módulos de pantallas (dinero, calendario, avisos, seguridad)
function ctxApp() {
  return {
    estado, sb, C, TABLAS, BUCKET, esc, fecha, num, euros, pintar, $, $$, ir, aviso, ocupado,
    guardarRegistro, borrarRegistro,
    pintarAvisos: (caja) => A.pintarAvisos(ctxApp(), caja),
  };
}

function bloquear() {
  if (!estado.llave) return;
  estado.llave = null;
  estado.docs = [];
  estado.claves = [];
  estado.inversiones = [];
  estado.registros = [];
  $('#visor').hidden = true;
  arrancar();
}

async function cerrarSesion() {
  estado.llave = null;
  estado.docs = [];
  estado.claves = [];
  estado.inversiones = [];
  estado.registros = [];
  await sb.auth.signOut();
  estado.usuario = null;
  estado.boveda = null;
  arrancar();
}

// Bloqueo automático tras unos minutos sin usar la app
let vigilando = false;
let temporizador;
let ocultaDesde = 0;
function vigilarInactividad() {
  const reiniciar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(bloquear, BLOQUEO_MINUTOS * 60000);
  };
  reiniciar();
  if (vigilando) return;
  vigilando = true;
  ['pointerdown', 'keydown', 'scroll'].forEach((ev) => addEventListener(ev, reiniciar, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ocultaDesde = Date.now(); return; }
    if (ocultaDesde && Date.now() - ocultaDesde > BLOQUEO_MINUTOS * 60000) bloquear();
    else reiniciar();
  });
}

// ============================================================
//  Navegación
// ============================================================
function router() {
  if (!estado.llave) return arrancar();
  const [ruta, consulta = ''] = location.hash.slice(1).split('?');
  const [nombre, param] = (ruta || 'inicio').split('/');
  const q = new URLSearchParams(consulta);
  const menu = $('#menu');
  menu.hidden = false;
  const seccion = { doc: 'documentos', 'nuevo-doc': 'documentos', 'editar-doc': 'documentos',
    importar: 'mas', ajustes: 'mas', lista: 'mas', contrasenas: 'mas',
    clave: 'mas', 'nueva-clave': 'mas', 'editar-clave': 'mas',
    'nuevo-mov': 'dinero', 'editar-mov': 'dinero', 'nuevo-evento': 'calendario', 'editar-evento': 'calendario',
    inversion: 'inversiones', 'nueva-inversion': 'inversiones', 'editar-inversion': 'inversiones' }[nombre] || nombre;
  $$('a', menu).forEach((a) => a.classList.toggle('activo', a.dataset.ruta === seccion));

  switch (nombre) {
    case 'documentos': return vistaDocumentos(q);
    case 'doc': return vistaDoc(param);
    case 'nuevo-doc': return vistaFormDoc(null, q);
    case 'editar-doc': return vistaFormDoc(param, q);
    case 'contrasenas': return vistaClaves();
    case 'clave': return vistaClave(param);
    case 'nueva-clave': return vistaFormClave(null);
    case 'editar-clave': return vistaFormClave(param);
    case 'inversiones': return vistaInversiones(q);
    case 'inversion': return vistaInversion(param);
    case 'nueva-inversion': return vistaFormInversion(null);
    case 'editar-inversion': return vistaFormInversion(param);
    case 'lista': return vistaLista();
    case 'ajustes': return vistaAjustes();
    case 'importar': return vistaImportar();
    case 'mas': return vistaMas();
    case 'dinero': return D.vistaDinero(ctxApp(), q);
    case 'nuevo-mov': return D.vistaFormMov(ctxApp(), null);
    case 'editar-mov': return D.vistaFormMov(ctxApp(), param);
    case 'calendario': return K.vistaCalendario(ctxApp(), q);
    case 'nuevo-evento': return K.vistaFormEvento(ctxApp(), null, q);
    case 'editar-evento': return K.vistaFormEvento(ctxApp(), param, q);
    default: return vistaInicio();
  }
}
addEventListener('hashchange', router);

// ============================================================
//  Inicio
// ============================================================
function vistaInicio() {
  const proximos = estado.docs
    .filter((d) => d.caduca && diasHasta(d.caduca) <= 120)
    .sort((a, b) => a.caduca.localeCompare(b.caduca));
  const descartados = noAplica();
  const pendientes = LISTA.filter((i) => !descartados.includes(i.clave));
  const hechos = pendientes.filter((i) => subido(i.clave)).length;
  const siguiente = pendientes.find((i) => !subido(i.clave));
  const pct = pendientes.length ? Math.round((hechos / pendientes.length) * 100) : 100;
  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  pintar(`<header class="cabecera"><h1>Hola 👋</h1><p class="sub">${esc(hoy)}</p></header>

    <section class="tarjeta">
      <h2>⏰ Caduca pronto</h2>
      ${proximos.length
        ? `<ul class="lista">${proximos.map(filaDoc).join('')}</ul>`
        : '<p class="vacio">Nada caduca en los próximos 4 meses 👍</p>'}
    </section>

    <section class="resumen">
      <a href="#documentos" class="dato"><b>${estado.docs.length}</b><span>Documentos</span></a>
      <a href="#contrasenas" class="dato"><b>${estado.claves.length}</b><span>Contraseñas</span></a>
    </section>

    ${estado.inversiones.length ? (() => {
      const t = totalesInversion();
      return `<a href="#inversiones" class="tarjeta dato-ancho">
        <span>📈 Inversiones</span><b>${euros(t.valor)}</b>
        <small class="${claseGanancia(t.eur)}">${t.eur >= 0 ? '+' : ''}${euros(t.eur)} (${pct(t.pct)})</small></a>`;
    })() : ''}

    ${(() => {
      const m = D.resumenMes(ctxApp());
      return m ? `<a href="#dinero" class="tarjeta dato-ancho"><span>💶 Este mes</span>
        <b class="${m.ahorro >= 0 ? 'sube' : 'baja'}">${m.ahorro >= 0 ? '+' : ''}${euros(m.ahorro)}</b>
        <small>Ingresos ${euros(m.ingresos)} · gastos ${euros(m.gastos)}</small></a>` : '';
    })()}

    ${(() => {
      const hoy = new Date().toISOString().slice(0, 10);
      const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const evs = K.elementos(estado, hoy, en7).filter((e) => e.clase === 'evento');
      return evs.length ? `<section class="tarjeta"><h2>📅 Esta semana</h2><ul class="lista">${evs.slice(0, 5).map((e) =>
        `<li><a class="fila-item" href="#editar-evento/${e.id}"><span class="icono">📌</span>
          <span class="texto"><b>${esc(e.titulo)}</b><small>${fecha(e.f)}${e.hora ? ' · ' + esc(e.hora) : ''}</small></span></a></li>`).join('')}</ul></section>` : '';
    })()}

    <section class="tarjeta">
      <h2>✅ Por subir</h2>
      <div class="barra"><span style="width:${pct}%"></span></div>
      <p class="ayuda">${hechos} de ${pendientes.length} cosas guardadas.</p>
      ${siguiente ? `<div class="sugerencia">
          <p><b>Siguiente: ${esc(siguiente.titulo)}</b><br><small>${esc(siguiente.como)}</small></p>
          <a class="btn primario" href="#nuevo-doc?lista=${siguiente.clave}">Subir ahora</a>
        </div>` : '<p>¡Lo tienes todo! 🎉</p>'}
      <a class="btn texto" href="#lista">Ver la lista completa</a>
    </section>

    <div class="acciones">
      <a class="btn" href="#nuevo-doc">＋ Documento</a>
      <a class="btn" href="#nueva-clave">＋ Contraseña</a>
    </div>`);
}

// ============================================================
//  Documentos
// ============================================================
function filaDoc(d) {
  const c = categoria(d.categoria);
  const e = estadoCaducidad(d.caduca);
  const n = d.archivos?.length || 0;
  return `<li><a href="#doc/${d.id}" class="fila-item">
    <span class="icono">${c.icono}</span>
    <span class="texto"><b>${esc(d.titulo)}</b><small>${esc(c.nombre)}${n ? ` · ${n} archivo${n > 1 ? 's' : ''}` : ''}</small></span>
    ${e ? `<span class="etiqueta ${e.clase}">${esc(e.texto)}</span>` : ''}
  </a></li>`;
}

function vistaDocumentos(q) {
  const filtro = q.get('cat') || '';
  pintar(`<header class="cabecera fila"><h1>Documentos</h1>
      <a class="btn primario peq" href="#nuevo-doc${filtro ? '?cat=' + filtro : ''}">＋ Añadir</a></header>
    <input type="search" id="buscar" class="buscar" placeholder="Buscar…" aria-label="Buscar documentos">
    <div class="chips">
      <a class="chip ${filtro ? '' : 'activo'}" href="#documentos">Todos</a>
      ${CATEGORIAS.map((c) => `<a class="chip ${c.id === filtro ? 'activo' : ''}" href="#documentos?cat=${c.id}">${c.icono} ${esc(c.nombre)}</a>`).join('')}
    </div>
    <ul id="lista" class="lista"></ul>`);
  const pintarLista = () => {
    const t = $('#buscar').value.trim().toLowerCase();
    const items = estado.docs
      .filter((d) => !filtro || d.categoria === filtro)
      .filter((d) => !t || `${d.titulo} ${d.numero || ''} ${d.notas || ''}`.toLowerCase().includes(t))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
    $('#lista').innerHTML = items.length ? items.map(filaDoc).join('')
      : `<li class="vacio">${estado.docs.length ? 'No hay nada que coincida.' : 'Aún no hay documentos. Mira la pestaña "Por subir" para empezar.'}</li>`;
  };
  $('#buscar').oninput = pintarLista;
  pintarLista();
}

async function descargarArchivo(archivo) {
  const { data, error } = await sb.storage.from(BUCKET).download(archivo.ruta);
  if (error) throw error;
  const bytes = await C.descifrarBytes(estado.llave, await data.arrayBuffer());
  const url = URL.createObjectURL(new Blob([bytes], { type: archivo.tipo }));
  urlsTemporales.push(url);
  return url;
}

function vistaDoc(id) {
  const d = estado.docs.find((x) => x.id === id);
  if (!d) return ir('#documentos');
  const c = categoria(d.categoria);
  const e = estadoCaducidad(d.caduca);
  const item = LISTA.find((i) => i.clave === d.lista);
  pintar(`<header class="cabecera"><a href="#documentos" class="volver">‹ Documentos</a>
      <h1>${esc(d.titulo)}</h1><p class="sub">${c.icono} ${esc(c.nombre)}</p></header>
    ${e ? `<p class="etiqueta grande ${e.clase}">${esc(e.texto)}</p>` : ''}
    <section class="tarjeta"><dl class="datos">
      ${d.numero ? `<dt>Número</dt><dd><span class="copiable">${esc(d.numero)}</span> <button class="btn texto peq" id="copiar-num">Copiar</button></dd>` : ''}
      ${d.expedicion ? `<dt>Expedición</dt><dd>${fecha(d.expedicion)}</dd>` : ''}
      ${d.caduca ? `<dt>Caducidad</dt><dd>${fecha(d.caduca)}</dd>` : ''}
      ${d.notas ? `<dt>Notas</dt><dd class="notas">${esc(d.notas)}</dd>` : ''}
      ${item ? `<dt>De la lista</dt><dd>${esc(item.titulo)}</dd>` : ''}
    </dl></section>
    <section id="archivos" class="archivos">${d.archivos?.length ? '<p class="cargando">Descifrando archivos…</p>' : '<p class="vacio">Sin archivos.</p>'}</section>
    <div class="acciones">
      <a class="btn" href="#editar-doc/${d.id}">✏️ Editar</a>
      <button class="btn peligro" id="borrar">🗑️ Borrar</button>
    </div>`);

  $('#copiar-num')?.addEventListener('click', () => copiar(d.numero, 'Número copiado'));
  $('#borrar').onclick = (ev) => {
    if (!confirm(`¿Borrar "${d.titulo}" y sus archivos? No se puede deshacer.`)) return;
    ocupado(ev.target, 'Borrando…', async () => {
      const rutas = (d.archivos || []).map((a) => a.ruta);
      if (rutas.length) await sb.storage.from(BUCKET).remove(rutas);
      const { error } = await sb.from(T_DOCS).delete().eq('id', d.id);
      if (error) { aviso('No se pudo borrar: ' + error.message, 'error'); return; }
      estado.docs = estado.docs.filter((x) => x.id !== d.id);
      aviso('Documento borrado');
      ir('#documentos');
    });
  };

  const contenedor = $('#archivos');
  if (!d.archivos?.length) return;
  Promise.all(d.archivos.map(async (a) => {
    try {
      const url = await descargarArchivo(a);
      if (a.tipo.startsWith('image/')) {
        return `<figure><img src="${url}" alt="${esc(a.nombre)}" data-visor="${url}"><figcaption>${esc(a.nombre)}</figcaption></figure>`;
      }
      return `<a class="btn archivo" href="${url}" download="${esc(a.nombre)}" target="_blank">📄 ${esc(a.nombre)}</a>`;
    } catch (error) {
      console.error(error);
      return `<p class="error">No se pudo abrir ${esc(a.nombre)}</p>`;
    }
  })).then((partes) => {
    if (!document.body.contains(contenedor)) return;
    contenedor.innerHTML = partes.join('');
    $$('[data-visor]', contenedor).forEach((img) => { img.onclick = () => abrirVisor(img.dataset.visor); });
  });
}

function abrirVisor(url) {
  const v = $('#visor');
  v.innerHTML = `<img src="${url}" alt="Documento a pantalla completa"><button class="cerrar" aria-label="Cerrar">✕</button>`;
  v.hidden = false;
  v.onclick = () => { v.hidden = true; v.innerHTML = ''; };
}

// Las fotos se reducen (máx. 2000 px) para que suban rápido y ocupen poco
async function prepararArchivo(file) {
  const esFoto = file.type.startsWith('image/') && !/gif|svg/.test(file.type);
  if (esFoto) {
    try {
      const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const escala = Math.min(1, 2000 / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.85));
      const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: 'image/jpeg', nombre };
    } catch { /* si falla, se sube tal cual */ }
  }
  if (file.size > 40 * 1024 * 1024) throw new Error(`"${file.name}" pesa más de 40 MB`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), tipo: file.type || 'application/octet-stream', nombre: file.name };
}

// Cifra un archivo y lo sube a la carpeta privada del usuario
async function subirArchivo(docId, file, nombreForzado, tipoForzado) {
  const preparado = await prepararArchivo(file);
  // Las fotos se recomprimen a JPEG: se respeta el nombre indicado, pero con extensión .jpg
  const esFotoReducida = preparado.tipo === 'image/jpeg' && preparado.nombre !== file.name;
  const tipo = esFotoReducida ? preparado.tipo : (tipoForzado || preparado.tipo);
  const nombre = esFotoReducida
    ? (nombreForzado ? nombreForzado.replace(/\.[^.]+$/, '') + '.jpg' : preparado.nombre)
    : (nombreForzado || preparado.nombre);
  const cifrado = await C.cifrarBytes(estado.llave, preparado.bytes);
  const ruta = `${estado.usuario.id}/${docId}/${crypto.randomUUID()}.bin`;
  const { error } = await sb.storage.from(BUCKET)
    .upload(ruta, new Blob([cifrado], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream' });
  if (error) throw error;
  return { ruta, tipo, nombre };
}

// Guarda (crea o actualiza) un documento cifrado y lo deja en memoria.
// La caducidad también va dentro de lo cifrado: en Supabase no queda nada legible.
async function guardarDocumento(docId, datos, caduca) {
  const { error } = await sb.from(T_DOCS).upsert({
    id: docId, datos: await C.cifrarJSON(estado.llave, { ...datos, caduca }), actualizado: new Date().toISOString(),
  });
  if (error) throw error;
  estado.docs = estado.docs.filter((x) => x.id !== docId).concat({ ...datos, id: docId, caduca });
}

function vistaFormDoc(id, q) {
  const d = id ? estado.docs.find((x) => x.id === id) : null;
  if (id && !d) return ir('#documentos');
  const item = !d && q.get('lista') ? LISTA.find((i) => i.clave === q.get('lista')) : null;
  const v = d || { titulo: item?.titulo || '', categoria: item?.categoria || q.get('cat') || 'identidad', lista: item?.clave || '', archivos: [] };

  pintar(`<header class="cabecera"><a href="${d ? '#doc/' + d.id : '#documentos'}" class="volver">‹ Volver</a>
      <h1>${d ? 'Editar documento' : 'Nuevo documento'}</h1></header>
    ${item ? `<div class="tarjeta pista"><b>Cómo conseguirlo:</b> ${esc(item.como)}</div>` : ''}
    <form id="f" class="tarjeta">
      <label>Nombre<input name="titulo" required value="${esc(v.titulo)}" placeholder="Ej: DNI"></label>
      <label>Categoría<select name="categoria">
        ${CATEGORIAS.map((c) => `<option value="${c.id}" ${c.id === v.categoria ? 'selected' : ''}>${c.icono} ${esc(c.nombre)}</option>`).join('')}
      </select></label>
      <label>Cuenta en «Por subir» como<select name="lista">
        <option value="">— Nada (no tacha nada de la lista) —</option>
        ${CATEGORIAS.map((c) => {
          const items = LISTA.filter((i) => i.categoria === c.id);
          return items.length ? `<optgroup label="${esc(c.nombre)}">${items.map((i) =>
            `<option value="${i.clave}" ${i.clave === v.lista ? 'selected' : ''}>${esc(i.titulo)}</option>`).join('')}</optgroup>` : '';
        }).join('')}
      </select></label>
      <label>Número (opcional)<input name="numero" value="${esc(v.numero)}" autocomplete="off"></label>
      <div class="dos">
        <label>Expedición<input type="date" name="expedicion" value="${esc(v.expedicion)}"></label>
        <label>Caducidad<input type="date" name="caduca" value="${esc(d?.caduca)}"></label>
      </div>
      <label>Notas<textarea name="notas" rows="3">${esc(v.notas)}</textarea></label>
      <fieldset><legend>Archivos</legend>
        <ul id="actuales" class="mini">${(v.archivos || []).map((a, i) =>
          `<li><span>${a.tipo.startsWith('image/') ? '🖼️' : '📄'} ${esc(a.nombre)}</span>
           <button type="button" class="btn texto peq" data-quitar="${i}">Quitar</button></li>`).join('')}</ul>
        <ul id="nuevos" class="mini"></ul>
        <div class="dos">
          <label class="btn subir">📷 Hacer foto<input type="file" accept="image/*" capture="environment" id="camara" hidden></label>
          <label class="btn subir">📎 Elegir archivo<input type="file" accept="image/*,application/pdf" multiple id="archivo" hidden></label>
        </div>
        <p class="ayuda">Para DNI, carnet, tarjetas… sube las dos caras. Todo se cifra antes de salir del móvil 🔒</p>
      </fieldset>
      <button class="btn primario" type="submit">Guardar</button>
      <p class="error" id="err"></p>
    </form>`);

  const quitar = new Set();
  let nuevos = [];
  const pintarNuevos = () => {
    $('#nuevos').innerHTML = nuevos.map((f, i) =>
      `<li><span>➕ ${esc(f.name)}</span><button type="button" class="btn texto peq" data-nuevo="${i}">Quitar</button></li>`).join('');
  };
  const anadir = (e) => { nuevos = nuevos.concat([...e.target.files]); e.target.value = ''; pintarNuevos(); };
  $('#camara').onchange = anadir;
  $('#archivo').onchange = anadir;
  $('#f').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-quitar], button[data-nuevo]');
    if (!b) return;
    if (b.dataset.quitar !== undefined) {
      quitar.add(Number(b.dataset.quitar));
      b.closest('li').remove();
    } else {
      nuevos.splice(Number(b.dataset.nuevo), 1);
      pintarNuevos();
    }
  });

  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    ocupado($('#f button[type=submit]'), 'Cifrando y guardando…', async () => {
      try {
        const docId = d?.id || crypto.randomUUID();
        const archivos = (v.archivos || []).filter((_, i) => !quitar.has(i));
        for (const file of nuevos) archivos.push(await subirArchivo(docId, file));
        const datos = {
          ...(d || {}),
          titulo: f.get('titulo').trim(),
          categoria: f.get('categoria'),
          numero: f.get('numero').trim(),
          expedicion: f.get('expedicion'),
          notas: f.get('notas').trim(),
          lista: f.get('lista') || '',
          archivos,
        };
        delete datos.id;
        delete datos.caduca;
        await guardarDocumento(docId, datos, f.get('caduca') || null);
        const quitadas = (v.archivos || []).filter((_, i) => quitar.has(i)).map((a) => a.ruta);
        if (quitadas.length) await sb.storage.from(BUCKET).remove(quitadas);
        aviso('Guardado y cifrado 🔒');
        ir('#doc/' + docId);
      } catch (error) {
        console.error(error);
        $('#err').textContent = 'No se pudo guardar: ' + (error.message || error);
      }
    });
  };
}

// ============================================================
//  Contraseñas
// ============================================================
async function copiar(texto, mensaje = 'Copiado') {
  try {
    await navigator.clipboard.writeText(texto);
    aviso(mensaje + ' (se borra del portapapeles en 30 s)');
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
  } catch {
    aviso('No se pudo copiar', 'error');
  }
}

function vistaClaves() {
  pintar(`<header class="cabecera fila"><h1>Contraseñas</h1>
      <a class="btn primario peq" href="#nueva-clave">＋ Añadir</a></header>
    <input type="search" id="buscar" class="buscar" placeholder="Buscar…" aria-label="Buscar contraseñas">
    <ul id="lista" class="lista"></ul>`);
  const pintarLista = () => {
    const t = $('#buscar').value.trim().toLowerCase();
    const items = estado.claves
      .filter((c) => !t || `${c.sitio} ${c.usuario || ''} ${c.web || ''}`.toLowerCase().includes(t))
      .sort((a, b) => a.sitio.localeCompare(b.sitio, 'es'));
    $('#lista').innerHTML = items.length ? items.map((c) => `<li><a href="#clave/${c.id}" class="fila-item">
        <span class="icono">🔑</span>
        <span class="texto"><b>${esc(c.sitio)}</b><small>${esc(c.usuario || 'sin usuario')}</small></span></a></li>`).join('')
      : `<li class="vacio">${estado.claves.length ? 'No hay nada que coincida.' : 'Aún no hay contraseñas guardadas.'}</li>`;
  };
  $('#buscar').oninput = pintarLista;
  pintarLista();
}

function vistaClave(id) {
  const c = estado.claves.find((x) => x.id === id);
  if (!c) return ir('#contrasenas');
  const web = /^https?:\/\//i.test(c.web || '') ? c.web : (c.web ? 'https://' + c.web : '');
  pintar(`<header class="cabecera"><a href="#contrasenas" class="volver">‹ Contraseñas</a><h1>${esc(c.sitio)}</h1></header>
    <section class="tarjeta"><dl class="datos">
      ${c.usuario ? `<dt>Usuario</dt><dd><span class="copiable">${esc(c.usuario)}</span>
        <button class="btn texto peq" id="cp-usuario">Copiar</button></dd>` : ''}
      <dt>Contraseña</dt><dd><span class="copiable secreto" id="secreto">••••••••••</span>
        <button class="btn texto peq" id="ver">Mostrar</button>
        <button class="btn texto peq" id="cp-clave">Copiar</button></dd>
      ${web ? `<dt>Web</dt><dd><a href="${esc(web)}" target="_blank" rel="noopener noreferrer">${esc(c.web)}</a></dd>` : ''}
      ${c.notas ? `<dt>Notas</dt><dd class="notas">${esc(c.notas)}</dd>` : ''}
    </dl></section>
    <div class="acciones">
      <a class="btn" href="#editar-clave/${c.id}">✏️ Editar</a>
      <button class="btn peligro" id="borrar">🗑️ Borrar</button>
    </div>`);
  let visible = false;
  $('#ver').onclick = () => {
    visible = !visible;
    $('#secreto').textContent = visible ? c.clave : '••••••••••';
    $('#ver').textContent = visible ? 'Ocultar' : 'Mostrar';
  };
  $('#cp-clave').onclick = () => copiar(c.clave, 'Contraseña copiada');
  $('#cp-usuario')?.addEventListener('click', () => copiar(c.usuario, 'Usuario copiado'));
  $('#borrar').onclick = async () => {
    if (!confirm(`¿Borrar la contraseña de "${c.sitio}"? No se puede deshacer.`)) return;
    const { error } = await sb.from(T_CLAVES).delete().eq('id', c.id);
    if (error) { aviso('No se pudo borrar: ' + error.message, 'error'); return; }
    estado.claves = estado.claves.filter((x) => x.id !== c.id);
    aviso('Contraseña borrada');
    ir('#contrasenas');
  };
}

function vistaFormClave(id) {
  const c = id ? estado.claves.find((x) => x.id === id) : null;
  if (id && !c) return ir('#contrasenas');
  const v = c || {};
  pintar(`<header class="cabecera"><a href="${c ? '#clave/' + c.id : '#contrasenas'}" class="volver">‹ Volver</a>
      <h1>${c ? 'Editar contraseña' : 'Nueva contraseña'}</h1></header>
    <form id="f" class="tarjeta" autocomplete="off">
      <label>Sitio o app<input name="sitio" required value="${esc(v.sitio)}" placeholder="Ej: Banco, Netflix, Gmail…"></label>
      <label>Usuario o correo<input name="usuario" value="${esc(v.usuario)}" autocomplete="off"></label>
      <label>Contraseña
        <span class="con-boton"><input type="password" name="clave" id="clave" required value="${esc(v.clave)}" autocomplete="new-password">
        <button type="button" class="btn peq" id="mostrar">👁️</button></span></label>
      <button type="button" class="btn texto" id="generar">🎲 Generar una segura</button>
      <label>Web (opcional)<input name="web" value="${esc(v.web)}" placeholder="ejemplo.com"></label>
      <label>Notas<textarea name="notas" rows="3" placeholder="Preguntas de seguridad, PIN…">${esc(v.notas)}</textarea></label>
      <button class="btn primario" type="submit">Guardar</button>
      <p class="error" id="err"></p>
    </form>`);
  $('#mostrar').onclick = () => { const i = $('#clave'); i.type = i.type === 'password' ? 'text' : 'password'; };
  $('#generar').onclick = () => { const i = $('#clave'); i.value = C.generarContrasena(20); i.type = 'text'; };
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    ocupado($('#f button[type=submit]'), 'Cifrando y guardando…', async () => {
      const claveId = c?.id || crypto.randomUUID();
      const datos = {
        sitio: f.get('sitio').trim(), usuario: f.get('usuario').trim(), clave: f.get('clave'),
        web: f.get('web').trim(), notas: f.get('notas').trim(),
      };
      const { error } = await sb.from(T_CLAVES).upsert({
        id: claveId, datos: await C.cifrarJSON(estado.llave, datos), actualizado: new Date().toISOString(),
      });
      if (error) { $('#err').textContent = 'No se pudo guardar: ' + error.message; return; }
      estado.claves = estado.claves.filter((x) => x.id !== claveId).concat({ ...datos, id: claveId });
      aviso('Guardada y cifrada 🔒');
      ir('#clave/' + claveId);
    });
  };
}

// ============================================================
//  Inversiones (solo seguimiento: nada de consejos)
// ============================================================
const euros = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const pct = (n) => `${n >= 0 ? '+' : ''}${(Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;
const num = (v) => {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').trim().replace(/\s/g, '');
  // Admite "1.234,56", "1234,56", "1.800" (miles) y "1234.56"
  let normal = t;
  if (t.includes(',')) normal = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, '');
  const n = parseFloat(normal);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round(n * 100) / 100;
const valorEur = (p) => (p.valorEur != null ? p.valorEur : r2(num(p.participaciones) * num(p.precio) * (p.cambio || 1)));
const ganancia = (valor, invertido) => ({ eur: r2(valor - invertido), pct: invertido ? ((valor - invertido) / invertido) * 100 : 0 });
const claseGanancia = (n) => (n >= 0 ? 'sube' : 'baja');

function totalesInversion(lista = estado.inversiones) {
  const valor = r2(lista.reduce((s, p) => s + valorEur(p), 0));
  const invertido = r2(lista.reduce((s, p) => s + num(p.invertido), 0));
  return { valor, invertido, ...ganancia(valor, invertido) };
}

function anotarHistorial(p) {
  const f = p.precioFecha || new Date().toISOString().slice(0, 10);
  const h = (p.historial || []).filter((x) => x.f !== f);
  h.push({ f, v: valorEur(p), i: num(p.invertido) });
  h.sort((a, b) => a.f.localeCompare(b.f));
  p.historial = h.slice(-1500);
}

async function guardarInversion(p) {
  const { id, ...datos } = p;
  const invId = id || crypto.randomUUID();
  const { error } = await sb.from(T_INV).upsert({
    id: invId, datos: await C.cifrarJSON(estado.llave, datos), actualizado: new Date().toISOString(),
  });
  if (error) throw error;
  p.id = invId;
  estado.inversiones = estado.inversiones.filter((x) => x.id !== invId).concat(p);
  return p;
}

// Serie de valor total: en cada fecha, suma lo último conocido de cada posición
function serieTotal(lista) {
  const fechas = [...new Set(lista.flatMap((p) => (p.historial || []).map((h) => h.f)))].sort();
  return fechas.map((f) => {
    let v = 0; let i = 0;
    for (const p of lista) {
      const previos = (p.historial || []).filter((h) => h.f <= f);
      const u = previos[previos.length - 1];
      if (u) { v += u.v; i += u.i ?? 0; }
    }
    return { f, v: r2(v), i: r2(i) };
  });
}

function grafico(puntos) {
  if (puntos.length < 2) {
    return '<p class="ayuda">La gráfica aparecerá cuando haya precios de al menos dos días distintos.</p>';
  }
  const W = 600; const H = 180; const P = 10;
  const vals = puntos.flatMap((p) => [p.v, p.i]).filter((n) => n != null);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const x = (k) => P + (k * (W - 2 * P)) / (puntos.length - 1);
  const y = (v) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const camino = (campo) => puntos.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Evolución del valor frente a lo invertido">
      <path d="${camino('i')}" class="g-inv"/><path d="${camino('v')}" class="g-valor"/></svg>
    <div class="leyenda"><span class="l-valor">Valor</span><span class="l-inv">Invertido</span>
      <span>${fecha(puntos[0].f)} → ${fecha(puntos[puntos.length - 1].f)}</span></div>`;
}

let actualizandoPrecios = null;
async function actualizarPrecios() {
  if (actualizandoPrecios) return actualizandoPrecios;
  actualizandoPrecios = (async () => {
    const avisos = [];
    const fondos = [...new Map(estado.inversiones.filter((p) => p.tipo === 'fondo' && p.isin)
      .map((p) => [p.isin, { isin: p.isin, moneda: p.moneda || 'EUR' }])).values()];
    let precios = {};
    if (fondos.length) {
      const { data, error } = await sb.functions.invoke('mivida-precios', { body: { fondos } });
      if (error) avisos.push('los fondos (falta instalar la función de precios en Supabase)');
      else precios = data || {};
    }
    const criptos = [...new Set(estado.inversiones.filter((p) => p.tipo === 'cripto').map((p) => p.cripto || 'bitcoin'))];
    let cripto = {};
    if (criptos.length) {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${criptos.map(encodeURIComponent).join(',')}&vs_currencies=eur`);
        cripto = await r.json();
      } catch { avisos.push('las criptomonedas'); }
    }
    const cambios = { EUR: 1 };
    for (const m of new Set(Object.values(precios).map((x) => x.moneda).filter((m) => m !== 'EUR'))) {
      try {
        const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${m}&symbols=EUR`);
        cambios[m] = (await r.json()).rates.EUR;
      } catch { avisos.push(`el cambio ${m}→EUR`); }
    }
    const hoy = new Date().toISOString().slice(0, 10);
    let cambiadas = 0;
    for (const p of estado.inversiones) {
      let nuevo = null;
      if (p.tipo === 'fondo' && precios[p.isin] && cambios[precios[p.isin].moneda]) {
        const d = precios[p.isin];
        nuevo = { precio: d.precio, moneda: d.moneda, cambio: cambios[d.moneda], precioFecha: d.fecha || hoy };
      } else if (p.tipo === 'cripto' && cripto[p.cripto || 'bitcoin']?.eur) {
        nuevo = { precio: cripto[p.cripto || 'bitcoin'].eur, moneda: 'EUR', cambio: 1, precioFecha: hoy };
      }
      if (!nuevo) continue;
      Object.assign(p, nuevo);
      p.valorEur = r2(num(p.participaciones) * p.precio * p.cambio);
      anotarHistorial(p);
      await guardarInversion(p);
      cambiadas++;
    }
    try { localStorage.setItem('mv-precios', String(Date.now())); } catch { /* sin almacenamiento */ }
    return { cambiadas, avisos };
  })();
  try { return await actualizandoPrecios; } finally { actualizandoPrecios = null; }
}

function filaInversion(p) {
  const v = valorEur(p);
  const g = ganancia(v, num(p.invertido));
  return `<li><a href="#inversion/${p.id}" class="fila-item">
    <span class="icono">${p.tipo === 'cripto' ? '₿' : p.tipo === 'fondo' ? '📊' : '💼'}</span>
    <span class="texto"><b>${esc(p.nombre)}</b><small>${p.isin ? esc(p.isin) + ' · ' : ''}${euros(p.invertido)} invertidos</small></span>
    <span class="cifra"><b>${euros(v)}</b><small class="${claseGanancia(g.eur)}">${pct(g.pct)}</small></span>
  </a></li>`;
}

// Utilidades que se pasan a las pestañas avanzadas (js/inversiones-vistas.js)
const ctxInv = () => ({
  estado, sb, esc, euros, pct, fecha, num, r2, valorEur, serieTotal, aviso, ocupado, $, $$,
});

const PESTANAS_INV = [['resumen', '📊 Resumen'], ['posiciones', '💼 Posiciones'], ['fiscal', '🧾 Fiscal'], ['noticias', '📰 Noticias']];

function vistaInversiones(q) {
  const pestana = PESTANAS_INV.some(([id]) => id === q?.get('t')) ? q.get('t') : 'resumen';
  const lista = estado.inversiones;
  const ultima = lista.map((p) => p.precioFecha).filter(Boolean).sort().pop();
  pintar(`<header class="cabecera fila"><h1>Inversiones</h1>
      <a class="btn primario peq" href="#nueva-inversion">＋ Añadir</a></header>
    ${estado.sinTablaInv ? `<p class="tarjeta alerta">Falta crear la tabla de inversiones en Supabase
      (archivo <code>supabase/inversiones.sql</code>). Hasta entonces no se pueden guardar.</p>` : ''}
    <nav class="pestanas">${PESTANAS_INV.map(([id, nombre]) =>
      `<a href="#inversiones?t=${id}" class="${id === pestana ? 'activa' : ''}">${nombre}</a>`).join('')}</nav>
    <div class="barra-precios"><span class="ayuda">${ultima ? `Precios a ${fecha(ultima)}` : 'Sin precios todavía'}</span>
      <button class="btn texto peq" id="actualizar">🔄 Actualizar precios</button></div>
    <p class="ayuda" id="estado-precios"></p>
    <div id="inv-cont"></div>`);
  const cont = $('#inv-cont');
  const vista = { resumen: V.resumen, fiscal: V.fiscal, noticias: V.noticias }[pestana];
  if (vista) {
    Promise.resolve(vista(ctxInv(), cont)).catch((e) => {
      console.error(e);
      cont.innerHTML = `<p class="tarjeta error">Algo ha fallado en esta pestaña: ${esc(e.message || e)}</p>`;
    });
  } else {
    vistaPosiciones(cont);
  }
  prepararActualizacion(pestana);
}

function prepararActualizacion(pestana) {
  const boton = $('#actualizar');
  const lanzar = () => ocupado(boton, 'Buscando precios…', async () => {
    const r = await actualizarPrecios();
    if (location.hash.startsWith('#inversiones') && pestana !== 'noticias') {
      vistaInversiones(new URLSearchParams(`t=${pestana}`));
      const caja = $('#estado-precios');
      if (caja) caja.textContent = `${r.cambiadas} precio(s) actualizado(s).${r.avisos.length ? ' No se pudo actualizar: ' + r.avisos.join(', ') + '.' : ''}`;
    }
  });
  boton.onclick = lanzar;
  // Actualización automática si han pasado más de 6 horas
  let ultimaVez = 0;
  try { ultimaVez = Number(localStorage.getItem('mv-precios') || 0); } catch { /* nada */ }
  if (estado.inversiones.length && !estado.sinTablaInv && Date.now() - ultimaVez > 6 * 3600000) lanzar();
}

function vistaPosiciones(cont) {
  const lista = estado.inversiones;
  const t = totalesInversion();
  const grupos = {};
  for (const p of lista) {
    const clave = `${p.entidad || 'Otras'}|||${p.cuenta || ''}`;
    (grupos[clave] ||= []).push(p);
  }
  cont.innerHTML = `
    <section class="tarjeta resumen-inv">
      <p class="ayuda">Valor total</p>
      <p class="grande">${euros(t.valor)}</p>
      <p class="${claseGanancia(t.eur)}"><b>${t.eur >= 0 ? '+' : ''}${euros(t.eur)}</b> (${pct(t.pct)})</p>
      <p class="ayuda">Invertido según tus bancos: ${euros(t.invertido)}</p>
    </section>
    ${Object.entries(grupos).sort().map(([clave, ps]) => {
      const [entidad, cuenta] = clave.split('|||');
      const s = totalesInversion(ps);
      return `<section class="tarjeta"><div class="fila-grupo"><h2>${esc(entidad)}${cuenta ? ` · <small>${esc(cuenta)}</small>` : ''}</h2>
          <span class="cifra"><b>${euros(s.valor)}</b><small class="${claseGanancia(s.eur)}">${pct(s.pct)}</small></span></div>
        <ul class="lista">${ps.sort((a, b) => valorEur(b) - valorEur(a)).map(filaInversion).join('')}</ul></section>`;
    }).join('') || '<p class="vacio">Aún no hay inversiones. Pulsa «＋ Añadir» o impórtalas desde Ajustes.</p>'}
    <p class="ayuda centro-texto">Solo para llevar el control. No es asesoramiento financiero.<br>
      Precios: Financial Times (fondos, 1 vez al día) y CoinGecko (cripto).</p>`;
}

function vistaInversion(id) {
  const p = estado.inversiones.find((x) => x.id === id);
  if (!p) return ir('#inversiones');
  const v = valorEur(p);
  const g = ganancia(v, num(p.invertido));
  pintar(`<header class="cabecera"><a href="#inversiones" class="volver">‹ Inversiones</a>
      <h1>${esc(p.nombre)}</h1><p class="sub">${esc(p.entidad || '')}${p.cuenta ? ' · ' + esc(p.cuenta) : ''}</p></header>
    <section class="tarjeta resumen-inv">
      <p class="grande">${euros(v)}</p>
      <p class="${claseGanancia(g.eur)}"><b>${g.eur >= 0 ? '+' : ''}${euros(g.eur)}</b> (${pct(g.pct)})</p>
    </section>
    <section class="tarjeta"><dl class="datos">
      ${p.isin ? `<dt>ISIN</dt><dd><span class="copiable">${esc(p.isin)}</span></dd>` : ''}
      <dt>${p.tipo === 'cripto' ? 'Cantidad' : 'Participaciones'}</dt><dd>${num(p.participaciones).toLocaleString('es-ES', { maximumFractionDigits: 8 })}</dd>
      <dt>Precio</dt><dd>${num(p.precio).toLocaleString('es-ES', { maximumFractionDigits: 4 })} ${esc(p.moneda || 'EUR')}${p.precioFecha ? ` <small>(${fecha(p.precioFecha)})</small>` : ''}</dd>
      <dt>Invertido</dt><dd>${euros(p.invertido)}</dd>
      <dt>Coste medio</dt><dd>${num(p.participaciones) ? (num(p.invertido) / num(p.participaciones)).toLocaleString('es-ES', { maximumFractionDigits: 4 }) + ' €' : '—'}</dd>
      ${p.notas ? `<dt>Notas</dt><dd class="notas">${esc(p.notas)}</dd>` : ''}
    </dl></section>
    <section class="tarjeta"><h2>📈 Evolución</h2>${grafico(p.historial || [])}</section>
    <div class="acciones">
      <a class="btn" href="#editar-inversion/${p.id}">✏️ Editar / apuntar aportación</a>
      <button class="btn peligro" id="borrar">🗑️ Borrar</button>
    </div>`);
  $('#borrar').onclick = async () => {
    if (!confirm(`¿Borrar "${p.nombre}" de tus inversiones? (Solo se borra de Mi Vida, no del banco)`)) return;
    const { error } = await sb.from(T_INV).delete().eq('id', p.id);
    if (error) { aviso('No se pudo borrar: ' + error.message, 'error'); return; }
    estado.inversiones = estado.inversiones.filter((x) => x.id !== p.id);
    aviso('Inversión borrada');
    ir('#inversiones');
  };
}

function vistaFormInversion(id) {
  const p = id ? estado.inversiones.find((x) => x.id === id) : null;
  if (id && !p) return ir('#inversiones');
  const v = p || { tipo: 'fondo', moneda: 'EUR' };
  const entidades = [...new Set(estado.inversiones.map((x) => x.entidad).filter(Boolean))];
  pintar(`<header class="cabecera"><a href="${p ? '#inversion/' + p.id : '#inversiones'}" class="volver">‹ Volver</a>
      <h1>${p ? 'Editar inversión' : 'Nueva inversión'}</h1></header>
    <form id="f" class="tarjeta" autocomplete="off">
      <label>Tipo<select name="tipo">
        <option value="fondo" ${v.tipo === 'fondo' ? 'selected' : ''}>📊 Fondo (precio automático por ISIN)</option>
        <option value="cripto" ${v.tipo === 'cripto' ? 'selected' : ''}>₿ Criptomoneda (precio automático)</option>
        <option value="manual" ${v.tipo === 'manual' ? 'selected' : ''}>💼 Otra (precio a mano)</option>
      </select></label>
      <label>Nombre<input name="nombre" required value="${esc(v.nombre)}" placeholder="Ej: Vanguard U.S. 500"></label>
      <div class="dos">
        <label>Entidad<input name="entidad" list="entidades" value="${esc(v.entidad)}" placeholder="Tu banco o bróker"></label>
        <label>Cuenta (opcional)<input name="cuenta" value="${esc(v.cuenta)}" placeholder="Cartera…"></label>
      </div>
      <datalist id="entidades">${entidades.map((e) => `<option value="${esc(e)}">`).join('')}</datalist>
      <label class="solo-fondo">ISIN<input name="isin" value="${esc(v.isin)}" placeholder="IE0032620787" style="text-transform:uppercase"></label>
      <label class="solo-cripto">Moneda (id de CoinGecko)<input name="cripto" value="${esc(v.cripto || 'bitcoin')}" placeholder="bitcoin"></label>
      <div class="dos">
        <label>Participaciones / cantidad<input name="participaciones" inputmode="decimal" required value="${esc(v.participaciones)}"></label>
        <label>Total invertido (€)<input name="invertido" inputmode="decimal" required value="${esc(v.invertido)}"></label>
      </div>
      ${v.lotes?.length ? `<p class="ayuda">📦 Esta posición tiene ${v.lotes.length} lotes de compra guardados (para el cálculo FIFO).
        Si cambias participaciones o invertido aquí, los lotes no se tocan.</p>`
        : `<label>Fecha de compra (aprox., para impuestos y rentabilidad)<input type="date" name="fechaCompra" value="${esc(v.fechaCompra)}"></label>`}
      <div class="dos">
        <label>Precio actual<input name="precio" inputmode="decimal" value="${esc(v.precio)}"></label>
        <label>Moneda del precio<select name="moneda">
          ${['EUR', 'USD', 'GBP'].map((m) => `<option ${m === (v.moneda || 'EUR') ? 'selected' : ''}>${m}</option>`).join('')}
        </select></label>
      </div>
      <p class="ayuda">¿Has hecho una aportación? Suma lo nuevo a «Participaciones» y a «Total invertido».
      En fondos y cripto el precio se rellena solo al pulsar «Actualizar precios».</p>
      <label>Notas<textarea name="notas" rows="2">${esc(v.notas)}</textarea></label>
      <button class="btn primario" type="submit">Guardar</button>
      <p class="error" id="err"></p>
    </form>`);
  const ajustar = () => {
    const tipo = $('[name=tipo]').value;
    $$('.solo-fondo').forEach((e) => { e.hidden = tipo !== 'fondo'; });
    $$('.solo-cripto').forEach((e) => { e.hidden = tipo !== 'cripto'; });
  };
  $('[name=tipo]').onchange = ajustar;
  ajustar();
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    ocupado($('#f button[type=submit]'), 'Cifrando y guardando…', async () => {
      try {
        const tipo = f.get('tipo');
        const nueva = {
          ...(p || {}),
          tipo,
          nombre: f.get('nombre').trim(),
          entidad: f.get('entidad').trim(),
          cuenta: f.get('cuenta').trim(),
          isin: tipo === 'fondo' ? f.get('isin').trim().toUpperCase() : '',
          cripto: tipo === 'cripto' ? (f.get('cripto').trim().toLowerCase() || 'bitcoin') : '',
          participaciones: num(f.get('participaciones')),
          invertido: num(f.get('invertido')),
          precio: num(f.get('precio')),
          moneda: f.get('moneda'),
          notas: f.get('notas').trim(),
        };
        if (f.has('fechaCompra')) nueva.fechaCompra = f.get('fechaCompra') || '';
        if (nueva.moneda === 'EUR') nueva.cambio = 1;
        nueva.valorEur = r2(nueva.participaciones * nueva.precio * (nueva.cambio || 1));
        if (!p || num(p.precio) !== nueva.precio) nueva.precioFecha = new Date().toISOString().slice(0, 10);
        anotarHistorial(nueva);
        await guardarInversion(nueva);
        aviso('Guardada y cifrada 🔒');
        ir('#inversion/' + nueva.id);
      } catch (error) {
        $('#err').textContent = 'No se pudo guardar: ' + (error.message || error);
      }
    });
  };
}

// ============================================================
//  Lista "Por subir"
// ============================================================
function vistaLista() {
  const descartados = noAplica();
  const activos = LISTA.filter((i) => !descartados.includes(i.clave));
  const hechos = activos.filter((i) => subido(i.clave)).length;
  const pct = activos.length ? Math.round((hechos / activos.length) * 100) : 100;
  pintar(`<header class="cabecera"><h1>Por subir</h1>
      <p class="sub">Lo que conviene tener guardado, y de qué app sacarlo.</p></header>
    <div class="barra"><span style="width:${pct}%"></span></div>
    <p class="ayuda">${hechos} de ${activos.length} guardadas</p>
    ${CATEGORIAS.map((cat) => {
      const items = LISTA.filter((i) => i.categoria === cat.id);
      if (!items.length) return '';
      return `<section class="tarjeta"><h2>${cat.icono} ${esc(cat.nombre)}</h2><ul class="tareas">
        ${items.map((i) => {
          const hecho = subido(i.clave);
          const na = descartados.includes(i.clave);
          const doc = estado.docs.find((d) => d.lista === i.clave);
          return `<li class="${hecho ? 'hecho' : ''} ${na ? 'na' : ''}">
            <span class="marca">${hecho ? '✅' : na ? '➖' : '⬜'}</span>
            <div><b>${esc(i.titulo)}</b><small>${esc(i.como)}</small>
              <div class="botones">
                ${hecho ? `<a class="btn peq" href="#doc/${doc.id}">Ver</a>`
                  : na ? `<button class="btn texto peq" data-na="${i.clave}">Volver a la lista</button>`
                  : `<a class="btn primario peq" href="#nuevo-doc?lista=${i.clave}">Subir</a>
                     <button class="btn texto peq" data-na="${i.clave}">No lo tengo / no aplica</button>`}
              </div></div></li>`;
        }).join('')}
      </ul></section>`;
    }).join('')}`);
  app.addEventListener('click', alternarNoAplica);
}

function alternarNoAplica(e) {
  const b = e.target.closest('button[data-na]');
  if (!b) return;
  app.removeEventListener('click', alternarNoAplica);
  const lista = noAplica();
  const clave = b.dataset.na;
  guardarNoAplica(lista.includes(clave) ? lista.filter((x) => x !== clave) : lista.concat(clave));
  vistaLista();
}

// ============================================================
//  Ajustes
// ============================================================
let eventoInstalar = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); eventoInstalar = e; });

function vistaMas() {
  const descartados = noAplica();
  const activos = LISTA.filter((i) => !descartados.includes(i.clave));
  const hechos = activos.filter((i) => subido(i.clave)).length;
  pintar(`<header class="cabecera"><h1>Más</h1></header>
    <ul class="lista">
      <li><a class="fila-item" href="#contrasenas"><span class="icono">🔑</span><span class="texto"><b>Contraseñas</b>
        <small>${estado.claves.length} guardadas, cifradas</small></span></a></li>
      <li><a class="fila-item" href="#lista"><span class="icono">✅</span><span class="texto"><b>Por subir</b>
        <small>${hechos} de ${activos.length} documentos guardados</small></span></a></li>
      <li><a class="fila-item" href="#ajustes"><span class="icono">⚙️</span><span class="texto"><b>Ajustes y seguridad</b>
        <small>Huella, clave maestra, copia de seguridad, avisos</small></span></a></li>
      <li><a class="fila-item" href="#importar"><span class="icono">📥</span><span class="texto"><b>Importar carpeta</b>
        <small>Subir de golpe documentos clasificados</small></span></a></li>
    </ul>`);
}

function vistaAjustes() {
  const huella = S.huellaActiva(estado.usuario?.id);
  pintar(`<header class="cabecera"><a href="#mas" class="volver">‹ Más</a><h1>Ajustes</h1></header>
    <section class="tarjeta">
      <h2>👤 Cuenta</h2>
      <p>${esc(estado.usuario?.email)}</p>
      <p class="ayuda">La app se bloquea sola tras ${BLOQUEO_MINUTOS} minutos sin usarla.</p>
      <div class="acciones">
        <button class="btn" id="bloquear">🔒 Bloquear ahora</button>
        <button class="btn" id="salir">Cerrar sesión</button>
      </div>
    </section>
    <section class="tarjeta">
      <h2>👆 Desbloqueo con huella</h2>
      ${huella
        ? `<p>✅ Activado en este dispositivo.</p><button class="btn texto" id="huella-off">Desactivar en este dispositivo</button>`
        : `<p class="ayuda">Abre Mi Vida con la huella (o la cara) en vez de escribir la clave maestra. Se activa en cada dispositivo por separado.</p>
           <form id="f-huella" class="en-linea-form"><input type="password" name="c" placeholder="Tu clave maestra" autocomplete="current-password" required>
           <button class="btn primario" type="submit">Activar</button></form>`}
      <p class="error" id="err-huella"></p>
    </section>
    <div id="caja-avisos"></div>
    <section class="tarjeta">
      <h2>💾 Copia de seguridad</h2>
      <p class="ayuda">Descarga un archivo con TODO (documentos, contraseñas, inversiones, dinero y calendario).
      Sigue cifrado con tu clave maestra: guárdalo en un USB o en otra nube sin miedo.</p>
      <div class="acciones"><button class="btn" id="copia">⬇️ Descargar copia</button>
        <label class="btn subir">♻️ Restaurar copia<input type="file" accept=".json,application/json" id="restaurar" hidden></label></div>
      <p class="ayuda" id="copia-estado"></p>
    </section>
    <section class="tarjeta">
      <h2>🔐 Clave maestra</h2>
      <p class="ayuda">Si la olvidas no se puede recuperar nada. Imprime la hoja, escríbela a mano y guárdala en casa.</p>
      <button class="btn" id="hoja">🖨️ Imprimir hoja de recuperación</button>
      <details><summary>Cambiar la clave maestra</summary>
        <form id="f-cambio" class="tarjeta-plana">
          <p class="ayuda">Se vuelve a cifrar todo con la clave nueva. Antes se descarga una copia de seguridad automáticamente.
          No cierres la app hasta que termine.</p>
          <label>Clave actual<input type="password" name="actual" autocomplete="current-password" required></label>
          <label>Clave nueva (mínimo 12 caracteres)<input type="password" name="n1" minlength="12" autocomplete="new-password" required></label>
          <label>Repite la nueva<input type="password" name="n2" minlength="12" autocomplete="new-password" required></label>
          <button class="btn primario" type="submit">Cambiar clave maestra</button>
          <p class="ayuda" id="cambio-estado"></p><p class="error" id="err-cambio"></p>
        </form></details>
    </section>
    <section class="tarjeta">
      <h2>📥 Importar una carpeta</h2>
      <p class="ayuda">Desde el ordenador: sube de golpe una carpeta de documentos que Claude haya clasificado
      (con su ficha <code>mi-vida-importar.json</code>).</p>
      <a class="btn" href="#importar">Importar carpeta</a>
    </section>
    <section class="tarjeta">
      <h2>📱 Instalar en el móvil</h2>
      ${eventoInstalar ? '<button class="btn primario" id="instalar">Instalar Mi Vida</button>'
        : '<p class="ayuda">En Chrome para Android: menú ⋮ → "Añadir a pantalla de inicio" o "Instalar aplicación".</p>'}
    </section>
    <p class="ayuda centro-texto">Mi Vida · versión 2</p>`);
  $('#bloquear').onclick = bloquear;
  $('#salir').onclick = cerrarSesion;
  $('#hoja').onclick = imprimirHoja;
  A.pintarAvisos(ctxApp(), $('#caja-avisos'));

  $('#huella-off')?.addEventListener('click', () => { S.olvidarHuella(); aviso('Huella desactivada en este dispositivo'); vistaAjustes(); });
  $('#f-huella')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const clave = new FormData(e.target).get('c');
    ocupado($('#f-huella button'), 'Pon el dedo…', async () => {
      try {
        if (!(await S.puedeUsarHuella())) throw new Error('Este dispositivo no tiene huella o reconocimiento facial disponible.');
        await S.activarHuella(ctxApp(), clave);
        aviso('Huella activada 👆');
        vistaAjustes();
      } catch (x) { $('#err-huella').textContent = x.name === 'NotAllowedError' ? 'Cancelado.' : (x.message || String(x)); }
    });
  });

  $('#copia').onclick = (e) => ocupado(e.target, 'Preparando copia…', async () => {
    try {
      const r = await S.exportarCopia(ctxApp(), (t) => { $('#copia-estado').textContent = t; });
      $('#copia-estado').textContent = `✅ Copia descargada (${r.documentos} documentos y ${r.archivos} archivos, todo cifrado).`;
    } catch (x) { $('#copia-estado').textContent = '❌ ' + (x.message || x); }
  });
  $('#restaurar').onchange = async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    const clave = prompt('Escribe la clave maestra que tenías cuando hiciste esa copia:');
    if (!clave) return;
    if (!confirm('Se restaurará todo lo que haya en la copia (lo que tenga el mismo identificador se sobrescribe). ¿Seguir?')) return;
    try {
      const n = await S.restaurarCopia(ctxApp(), archivo, clave, (t) => { $('#copia-estado').textContent = t; });
      await cargarTodo();
      $('#copia-estado').textContent = `✅ Restaurados ${n} elementos.`;
    } catch (x) { $('#copia-estado').textContent = '❌ ' + (x.message || x); }
  };

  $('#f-cambio').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('n1') !== f.get('n2')) { $('#err-cambio').textContent = 'Las dos claves nuevas no coinciden.'; return; }
    if (!confirm('¿Cambiar la clave maestra? Recuerda apuntar la nueva en tu hoja de recuperación.')) return;
    ocupado($('#f-cambio button'), 'Cambiando…', async () => {
      try {
        await S.cambiarClave(ctxApp(), f.get('actual'), f.get('n1'), (t) => { $('#cambio-estado').textContent = t; });
        aviso('Clave maestra cambiada 🔐');
        vistaAjustes();
      } catch (x) { $('#err-cambio').textContent = x.message || String(x); }
    });
  };
  $('#instalar')?.addEventListener('click', async () => { eventoInstalar.prompt(); eventoInstalar = null; });
}

// ============================================================
//  Importar una carpeta clasificada (ficha mi-vida-importar.json)
// ============================================================
const FICHA = 'mi-vida-importar.json';
const TIPOS = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', pfx: 'application/x-pkcs12', p12: 'application/x-pkcs12' };
const tipoPorNombre = (n) => TIPOS[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
// Ruta dentro de la carpeta elegida (sin el nombre de la carpeta)
const rutaRelativa = (f) => (f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : f.name);

function vistaImportar() {
  pintar(`<header class="cabecera"><a href="#ajustes" class="volver">‹ Ajustes</a><h1>Importar carpeta</h1>
      <p class="sub">Todo se cifra en este dispositivo antes de subirse 🔒</p></header>
    <section class="tarjeta">
      <p>Elige la carpeta que tiene el archivo <code>${FICHA}</code>
      (por ejemplo, <b>documentacion personal jorge</b>).</p>
      <label class="btn primario subir">📂 Elegir carpeta
        <input type="file" id="carpeta" webkitdirectory directory multiple hidden></label>
      <p class="ayuda">Funciona mejor en el ordenador (Chrome o Edge). El navegador te preguntará si quieres
      "subir" los archivos: es solo para que la app pueda leerlos y cifrarlos aquí.</p>
    </section>
    <div id="resultado"></div>`);
  $('#carpeta').onchange = (e) => prepararImportacion([...e.target.files]);
}

async function prepararImportacion(ficheros) {
  const caja = $('#resultado');
  const ficha = ficheros.find((f) => f.name === FICHA);
  if (!ficha) {
    caja.innerHTML = `<p class="tarjeta error">No encuentro <code>${FICHA}</code> en esa carpeta.</p>`;
    return;
  }
  let plan;
  try { plan = JSON.parse(await ficha.text()); } catch {
    caja.innerHTML = '<p class="tarjeta error">La ficha de importación está dañada.</p>';
    return;
  }
  const porRuta = new Map(ficheros.map((f) => [rutaRelativa(f).normalize('NFC'), f]));
  const ya = new Set(estado.docs.map((d) => d.origen).filter(Boolean));
  const items = (plan.documentos || []).map((p) => {
    const archivos = (p.archivos || []).map((a) => ({ ...a, file: porRuta.get(a.ruta.normalize('NFC')) }));
    return { p, archivos, faltan: archivos.filter((a) => !a.file).length, hecho: ya.has(p.id) };
  });
  const pendientes = items.filter((i) => !i.hecho);
  const yaInv = new Set(estado.inversiones.map((x) => x.origen).filter(Boolean));
  const invs = (plan.inversiones || []).map((p) => ({ p, hecho: yaInv.has(p.id) }));
  const invPendientes = estado.sinTablaInv ? [] : invs.filter((i) => !i.hecho);
  const total = pendientes.length + invPendientes.length;

  caja.innerHTML = `${items.length ? `<section class="tarjeta">
      <h2>${items.length} documentos en la ficha</h2>
      <ul class="tareas">${items.map((i) => {
        const c = categoria(i.p.categoria);
        const e = estadoCaducidad(i.p.caduca);
        return `<li class="${i.hecho ? 'hecho' : ''}" data-id="${esc(i.p.id)}">
          <span class="marca">${i.hecho ? '✅' : i.faltan ? '⚠️' : c.icono}</span>
          <div><b>${esc(i.p.titulo)}</b>
            <small>${esc(c.nombre)} · ${i.archivos.length} archivo${i.archivos.length === 1 ? '' : 's'}
            ${i.faltan ? ` · <span class="error">faltan ${i.faltan}</span>` : ''}
            ${i.hecho ? ' · ya importado' : ''}</small>
            ${e ? `<span class="etiqueta ${e.clase}">${esc(e.texto)}</span>` : ''}
          </div></li>`;
      }).join('')}</ul>
    </section>` : ''}
    ${invs.length ? `<section class="tarjeta">
      <h2>${invs.length} inversiones en la ficha</h2>
      ${estado.sinTablaInv ? '<p class="alerta">Primero hay que crear la tabla de inversiones en Supabase (<code>supabase/inversiones.sql</code>).</p>' : ''}
      <ul class="tareas">${invs.map((i) => `<li class="${i.hecho ? 'hecho' : ''}" data-inv="${esc(i.p.id)}">
          <span class="marca">${i.hecho ? '✅' : i.p.tipo === 'cripto' ? '₿' : '📊'}</span>
          <div><b>${esc(i.p.nombre)}</b><small>${esc(i.p.entidad || '')}${i.p.cuenta ? ' · ' + esc(i.p.cuenta) : ''}
            · ${euros(valorEur(i.p))}${i.hecho ? ' · ya importada' : ''}</small></div></li>`).join('')}</ul>
    </section>` : ''}
    ${total
      ? `<button class="btn primario" id="importar" style="width:100%">🔒 Cifrar e importar ${total} elementos</button>
         <p class="ayuda" id="progreso"></p>`
      : '<p class="tarjeta">Todo lo de esta ficha ya está en la app 👍</p>'}`;

  $('#importar')?.addEventListener('click', (ev) => ocupado(ev.target, 'Importando…', async () => {
    let hechos = 0;
    const errores = [];
    for (const i of invPendientes) {
      $('#progreso').textContent = `Cifrando ${hechos + 1} de ${total}: ${i.p.nombre}…`;
      try {
        const { id: origen, ...resto } = i.p;
        const nueva = { ...resto, origen, participaciones: num(resto.participaciones), invertido: num(resto.invertido), precio: num(resto.precio) };
        nueva.valorEur = r2(valorEur(nueva));
        if (!nueva.historial?.length) anotarHistorial(nueva);
        await guardarInversion(nueva);
        hechos++;
        const fila = caja.querySelector(`li[data-inv="${CSS.escape(origen)}"]`);
        if (fila) { fila.classList.add('hecho'); fila.querySelector('.marca').textContent = '✅'; }
      } catch (error) {
        console.error(error);
        errores.push(`${i.p.nombre}: ${error.message || error}`);
      }
    }
    for (const i of pendientes) {
      $('#progreso').textContent = `Cifrando ${hechos + 1} de ${total}: ${i.p.titulo}…`;
      try {
        const docId = crypto.randomUUID();
        const archivos = [];
        for (const a of i.archivos.filter((x) => x.file)) {
          const nombre = a.nombre || a.file.name;
          archivos.push(await subirArchivo(docId, a.file, nombre, a.tipo || a.file.type || tipoPorNombre(nombre)));
        }
        await guardarDocumento(docId, {
          titulo: i.p.titulo, categoria: i.p.categoria || 'otros', numero: i.p.numero || '',
          expedicion: i.p.expedicion || '', notas: i.p.notas || '', lista: i.p.lista || '',
          origen: i.p.id, archivos,
        }, i.p.caduca || null);
        hechos++;
        const fila = caja.querySelector(`li[data-id="${CSS.escape(i.p.id)}"]`);
        if (fila) { fila.classList.add('hecho'); fila.querySelector('.marca').textContent = '✅'; }
      } catch (error) {
        console.error(error);
        errores.push(`${i.p.titulo}: ${error.message || error}`);
      }
    }
    $('#progreso').innerHTML = errores.length
      ? `<span class="error">Importados ${hechos}. Fallaron ${errores.length}:<br>${errores.map(esc).join('<br>')}</span><br>Puedes volver a intentarlo: no se duplicará nada.`
      : `✅ ${hechos} elementos importados y cifrados.`;
    if (!errores.length) {
      aviso(`${hechos} elementos importados 🔒`);
      ev.target.remove();
    }
  }));
}

function imprimirHoja() {
  const hoja = document.createElement('div');
  hoja.id = 'hoja';
  hoja.innerHTML = `<h1>Mi Vida — Hoja de recuperación</h1>
    <p>Guarda esta hoja en un lugar seguro de casa. No la fotografíes ni la subas a ningún sitio.</p>
    <p><b>Correo de la cuenta:</b> ${esc(estado.usuario?.email || '')}</p>
    <p><b>Clave maestra:</b></p><div class="hueco"></div>
    <p><b>Fecha:</b> ____ / ____ / ________</p>
    <p class="pie">Sin la clave maestra no se pueden descifrar los documentos ni las contraseñas.
    Nadie puede recuperarla por ti.</p>`;
  document.body.appendChild(hoja);
  document.body.classList.add('imprimiendo');
  const limpiar = () => { hoja.remove(); document.body.classList.remove('imprimiendo'); };
  addEventListener('afterprint', limpiar, { once: true });
  window.print();
}

// ============================================================
//  Inicio de la app
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Sin modo app:', e));
}
if (sb) {
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') { estado.llave = null; estado.boveda = null; }
  });
}
arrancar().catch(vistaError);
