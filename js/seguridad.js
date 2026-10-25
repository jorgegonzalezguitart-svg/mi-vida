// Seguridad: copia de seguridad, cambio de clave maestra y desbloqueo con huella.
// Recibe "ctx" desde app.js: { estado, sb, C, TABLAS, BUCKET, aviso }
// TABLAS = { docs, claves, inversiones, registros } (nombres de tabla en Supabase)

const hoy = () => new Date().toISOString().slice(0, 10);

function descargar(nombre, contenido, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function filasCrudas(ctx, tabla) {
  const { data, error } = await ctx.sb.from(tabla).select('id, datos');
  return error ? null : data;
}

// ============================================================
//  COPIA DE SEGURIDAD (todo sigue cifrado con tu clave maestra)
// ============================================================
export async function exportarCopia(ctx, progreso = () => {}) {
  const { estado, sb, C, TABLAS, BUCKET } = ctx;
  const copia = {
    formato: 'mivida-copia', version: 1, fecha: new Date().toISOString(),
    boveda: { sal: estado.boveda.sal, iteraciones: estado.boveda.iteraciones, comprobacion: estado.boveda.comprobacion },
    tablas: {}, archivos: {},
  };
  for (const [clave, tabla] of Object.entries(TABLAS)) {
    if (clave === 'boveda') continue; // la bóveda va aparte (copia.boveda)
    progreso(`Copiando ${clave}…`);
    const filas = await filasCrudas(ctx, tabla);
    if (filas) copia.tablas[clave] = filas;
  }
  const rutas = estado.docs.flatMap((d) => (d.archivos || []).map((a) => a.ruta));
  let n = 0;
  for (const ruta of rutas) {
    progreso(`Copiando archivos cifrados ${++n} de ${rutas.length}…`);
    const { data, error } = await sb.storage.from(BUCKET).download(ruta);
    if (error) throw new Error(`No se pudo copiar un archivo (${error.message})`);
    copia.archivos[ruta] = C.aBase64(new Uint8Array(await data.arrayBuffer()));
  }
  descargar(`mivida-copia-${hoy()}.json`, JSON.stringify(copia));
  return { documentos: copia.tablas.docs?.length || 0, archivos: rutas.length };
}

// Restaura una copia: descifra con la clave de la copia y vuelve a cifrar con la clave actual
export async function restaurarCopia(ctx, archivo, claveDeLaCopia, progreso = () => {}) {
  const { estado, sb, C, TABLAS, BUCKET } = ctx;
  const copia = JSON.parse(await archivo.text());
  if (copia.formato !== 'mivida-copia') throw new Error('Ese archivo no es una copia de Mi Vida.');
  const llaveCopia = await C.derivarClave(claveDeLaCopia, copia.boveda.sal, copia.boveda.iteraciones);
  try { await C.descifrarJSON(llaveCopia, copia.boveda.comprobacion); } catch { throw new Error('La clave maestra de la copia no es correcta.'); }
  const uid = estado.usuario.id;
  let total = 0;
  for (const [clave, filas] of Object.entries(copia.tablas || {})) {
    const tabla = TABLAS[clave];
    if (!tabla || clave === 'boveda') continue;
    const nuevas = [];
    for (const f of filas) {
      progreso(`Restaurando ${clave} (${nuevas.length + 1}/${filas.length})…`);
      const datos = await C.descifrarJSON(llaveCopia, f.datos);
      if (clave === 'docs' && Array.isArray(datos.archivos)) {
        for (const a of datos.archivos) {
          const b64 = copia.archivos?.[a.ruta];
          if (!b64) continue;
          const claro = await C.descifrarBytes(llaveCopia, C.deBase64(b64));
          const ruta = `${uid}/${f.id}/${crypto.randomUUID()}.bin`;
          const { error } = await sb.storage.from(BUCKET).upload(ruta,
            new Blob([await C.cifrarBytes(estado.llave, claro)], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream' });
          if (error) throw error;
          a.ruta = ruta;
        }
      }
      nuevas.push({ id: f.id, datos: await C.cifrarJSON(estado.llave, datos), actualizado: new Date().toISOString() });
    }
    if (nuevas.length) {
      const { error } = await sb.from(tabla).upsert(nuevas);
      if (error) throw error;
      total += nuevas.length;
    }
  }
  return total;
}

// ============================================================
//  CAMBIAR LA CLAVE MAESTRA
// ============================================================
export async function cambiarClave(ctx, actual, nueva, progreso = () => {}) {
  const { estado, sb, C, TABLAS, BUCKET } = ctx;
  const b = estado.boveda;
  try {
    const comprobar = await C.derivarClave(actual, b.sal, b.iteraciones);
    await C.descifrarJSON(comprobar, b.comprobacion);
  } catch { throw new Error('La clave maestra actual no es correcta.'); }

  progreso('Haciendo una copia de seguridad antes de empezar…');
  await exportarCopia(ctx, progreso);

  const sal = C.nuevaSal();
  const llaveNueva = await C.derivarClave(nueva, sal, C.ITERACIONES);
  const uid = estado.usuario.id;
  const viejas = [];

  // 1) Archivos: se cifran de nuevo en rutas nuevas (las viejas se borran al final)
  const docs = [];
  for (const d of estado.docs) {
    const archivos = [];
    for (const a of d.archivos || []) {
      progreso(`Volviendo a cifrar archivos: ${d.titulo}…`);
      const { data, error } = await sb.storage.from(BUCKET).download(a.ruta);
      if (error) throw error;
      const claro = await C.descifrarBytes(estado.llave, await data.arrayBuffer());
      const ruta = `${uid}/${d.id}/${crypto.randomUUID()}.bin`;
      const sub = await sb.storage.from(BUCKET).upload(ruta,
        new Blob([await C.cifrarBytes(llaveNueva, claro)], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream' });
      if (sub.error) throw sub.error;
      viejas.push(a.ruta);
      archivos.push({ ...a, ruta });
    }
    docs.push({ ...d, archivos });
  }

  // 2) Filas: todo se prepara en memoria y se guarda de golpe por tabla
  const preparar = async (lista) => Promise.all(lista.map(async ({ id, ...datos }) =>
    ({ id, datos: await C.cifrarJSON(llaveNueva, datos), actualizado: new Date().toISOString() })));
  progreso('Volviendo a cifrar documentos, contraseñas e inversiones…');
  const lotes = {
    docs: await preparar(docs),
    claves: await preparar(estado.claves),
    inversiones: await preparar(estado.inversiones),
    registros: await preparar(estado.registros || []),
  };
  for (const [clave, filas] of Object.entries(lotes)) {
    if (!filas.length || !TABLAS[clave]) continue;
    const { error } = await sb.from(TABLAS[clave]).upsert(filas);
    if (error) throw error;
  }
  const comprobacion = await C.cifrarJSON(llaveNueva, { ok: 'mi-vida' });
  const { data, error } = await sb.from(TABLAS.boveda).update({ sal, iteraciones: C.ITERACIONES, comprobacion })
    .eq('user_id', uid).select().single();
  if (error) throw error;

  // 3) Limpieza y nuevo estado
  progreso('Borrando los archivos con el cifrado antiguo…');
  for (let k = 0; k < viejas.length; k += 50) await sb.storage.from(BUCKET).remove(viejas.slice(k, k + 50));
  estado.boveda = data;
  estado.llave = llaveNueva;
  estado.docs = docs;
  olvidarHuella();
}

// ============================================================
//  DESBLOQUEO CON HUELLA (WebAuthn + extensión PRF)
//  La llave se guarda en ESTE dispositivo, cifrada con un secreto que solo entrega el sensor.
// ============================================================
const CLAVE_LS = 'mv-huella';
const leerHuella = () => { try { return JSON.parse(localStorage.getItem(CLAVE_LS) || 'null'); } catch { return null; } };
export function olvidarHuella() { try { localStorage.removeItem(CLAVE_LS); } catch { /* nada */ } }
export function huellaActiva(usuarioId) { const h = leerHuella(); return !!h && h.usuario === usuarioId; }

export async function puedeUsarHuella() {
  try {
    return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

async function secretoPrf(C, idCredencial, salPrf) {
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: idCredencial }],
      userVerification: 'required', timeout: 60000,
      extensions: { prf: { eval: { first: salPrf } } },
    },
  });
  const r = a.getClientExtensionResults().prf?.results?.first;
  if (!r) throw new Error('Este dispositivo no permite usar la huella para cifrar (le falta la función PRF).');
  return new Uint8Array(r);
}

// Paso 1: comprueba la clave maestra (tal cual y sin espacios al principio/final) y devuelve la llave exportable
export async function comprobarClaveHuella(ctx, claveMaestra) {
  const { estado, C } = ctx;
  const b = estado.boveda;
  for (const v of [...new Set([claveMaestra, claveMaestra.trim()])]) {
    try {
      const llave = await C.derivarClave(v, b.sal, b.iteraciones, true);
      await C.descifrarJSON(llave, b.comprobacion);
      return llave;
    } catch { /* probar la siguiente */ }
  }
  throw new Error('La clave maestra no es correcta. Pulsa 👁️ para ver lo que has escrito (mayúsculas, espacios, '
    + 'y que el móvil no haya rellenado solo otra contraseña).');
}

// Traduce los errores del sensor a algo entendible (con el código técnico al final, para poder diagnosticar)
export function explicarErrorHuella(x) {
  const n = x?.name && x.name !== 'Error' ? x.name : '';
  const textos = {
    NotAllowedError: 'Se canceló o el móvil no dejó usar la huella. Si no lo cancelaste tú, comprueba que tienes una huella '
      + 'y bloqueo de pantalla configurados en Android y que Chrome está actualizado.',
    InvalidStateError: 'Ya había una huella creada para Mi Vida en este móvil. Vuelve a intentarlo.',
    NotSupportedError: 'Este móvil o navegador no admite este tipo de huella. Prueba desde Chrome actualizado.',
    SecurityError: 'El navegador bloqueó la huella por seguridad (abre la app desde su dirección normal, con https).',
    AbortError: 'Se interrumpió. Vuelve a intentarlo.',
  };
  return `${textos[n] || x?.message || String(x)}${n ? ` (código: ${n})` : ''}`;
}

// Paso 2: crea la "llave de huella" (debe llamarse justo al pulsar un botón)
export async function activarHuella(ctx, llave) {
  const { estado, C } = ctx;
  const crudo = new Uint8Array(await crypto.subtle.exportKey('raw', llave));
  const salPrf = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Mi Vida' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: estado.usuario.email || 'mi-vida', displayName: 'Mi Vida' },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      extensions: { prf: { eval: { first: salPrf } } },
    },
  });
  const ext = cred.getClientExtensionResults();
  if (ext.prf && ext.prf.enabled === false) throw new Error('Este dispositivo no permite usar la huella para cifrar (le falta la función PRF).');
  const id = new Uint8Array(cred.rawId);
  const secreto = ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : await secretoPrf(C, id, salPrf);
  const envoltorio = await C.llaveDeSecreto(secreto);
  const llaveCifrada = await C.cifrarBytes(envoltorio, crudo);
  crudo.fill(0);
  localStorage.setItem(CLAVE_LS, JSON.stringify({
    usuario: estado.usuario.id, id: C.aBase64(id), sal: C.aBase64(salPrf), llave: C.aBase64(llaveCifrada), fecha: hoy(),
  }));
}

export async function desbloquearConHuella(ctx) {
  const { C, estado } = ctx;
  const h = leerHuella();
  if (!h) throw new Error('La huella no está activada en este dispositivo.');
  const secreto = await secretoPrf(C, C.deBase64(h.id), C.deBase64(h.sal));
  const envoltorio = await C.llaveDeSecreto(secreto);
  let crudo;
  try { crudo = await C.descifrarBytes(envoltorio, C.deBase64(h.llave)); } catch { throw new Error('No se pudo abrir con la huella. Usa la clave maestra.'); }
  const llave = await C.importarLlaveCruda(crudo);
  crudo.fill(0);
  await C.descifrarJSON(llave, estado.boveda.comprobacion); // si la clave cambió, falla aquí
  return llave;
}
