// Contactos importantes: registros cifrados de tipo "contacto" (aseguradoras, banco, suministros, casa…).
export const CAT_CONTACTO = [
  ['seguros', '🛡️', 'Seguros'],
  ['bancos', '🏦', 'Bancos'],
  ['suministros', '💡', 'Luz, gas y agua'],
  ['casa', '🏠', 'Casa y comunidad'],
  ['salud', '🩺', 'Salud'],
  ['trabajo', '🎖️', 'Trabajo'],
  ['familia', '👪', 'Familia'],
  ['otros', '📇', 'Otros'],
];
const cat = (id) => CAT_CONTACTO.find((c) => c[0] === id) || CAT_CONTACTO[CAT_CONTACTO.length - 1];
const soloNumeros = (t) => String(t || '').replace(/[^\d+]/g, '');
const webUrl = (w) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

export function vistaContactos(ctx, q) {
  const { estado, esc, pintar } = ctx;
  const filtro = q?.get('cat') || '';
  const texto = (q?.get('q') || '').toLowerCase();
  const todos = (estado.registros || []).filter((r) => r.tipo === 'contacto')
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  const lista = todos.filter((c) => (!filtro || c.categoria === filtro)
    && (!texto || JSON.stringify([c.nombre, c.referencia, c.notas, c.telefono, c.email]).toLowerCase().includes(texto)));
  const grupos = CAT_CONTACTO.map(([id]) => [id, lista.filter((c) => (c.categoria || 'otros') === id)]).filter(([, l]) => l.length);

  const fila = (c) => `<li class="contacto">
      <a class="fila-item" href="#editar-contacto/${c.id}"><span class="icono">${cat(c.categoria)[1]}</span>
        <span class="texto"><b>${esc(c.nombre)}</b><small>${esc([c.para, c.referencia].filter(Boolean).join(' · '))}</small></span></a>
      <div class="acciones-contacto">
        ${c.telefono ? `<a class="btn peq" href="tel:${esc(soloNumeros(c.telefono))}">📞 ${esc(c.telefono)}</a>` : ''}
        ${c.telefono2 ? `<a class="btn peq" href="tel:${esc(soloNumeros(c.telefono2))}">📞 ${esc(c.telefono2)}</a>` : ''}
        ${c.email ? `<a class="btn peq" href="mailto:${esc(c.email)}">✉️ Correo</a>` : ''}
        ${c.web ? `<a class="btn peq" href="${esc(webUrl(c.web))}" target="_blank" rel="noopener">🌐 Web</a>` : ''}
      </div></li>`;

  pintar(`<header class="cabecera fila"><a href="#mas" class="volver">‹ Más</a><h1>Contactos</h1>
      <a class="btn primario peq" href="#nuevo-contacto">＋ Añadir</a></header>
    <form id="buscar" class="tarjeta en-linea-form" autocomplete="off"><input name="q" type="search" placeholder="Buscar por nombre, póliza, notas…" value="${esc(texto)}"></form>
    <div class="chips"><a class="chip ${filtro ? '' : 'activo'}" href="#contactos">Todos</a>
      ${CAT_CONTACTO.filter(([id]) => todos.some((c) => c.categoria === id)).map(([id, ic, n]) =>
        `<a class="chip ${id === filtro ? 'activo' : ''}" href="#contactos?cat=${id}">${ic} ${esc(n)}</a>`).join('')}</div>
    ${grupos.length ? grupos.map(([id, l]) => `<section class="tarjeta"><h2>${cat(id)[1]} ${esc(cat(id)[2])}</h2>
        <ul class="lista">${l.map(fila).join('')}</ul></section>`).join('')
      : `<p class="vacio">${todos.length ? 'Nada coincide con la búsqueda.' : 'Aún no hay contactos. Pulsa «＋ Añadir».'}</p>`}
    <p class="ayuda">Todo va cifrado con tu clave maestra, como el resto de la app.</p>`);
  ctx.$('#buscar').onsubmit = (e) => {
    e.preventDefault();
    const t = new FormData(e.target).get('q').trim();
    ctx.ir(`#contactos?${new URLSearchParams({ ...(filtro ? { cat: filtro } : {}), ...(t ? { q: t } : {}) })}`);
  };
}

export function vistaFormContacto(ctx, id) {
  const { estado, esc, pintar, $ } = ctx;
  const c = id ? (estado.registros || []).find((r) => r.id === id && r.tipo === 'contacto') : null;
  if (id && !c) return ctx.ir('#contactos');
  const v = c || { categoria: 'otros' };
  pintar(`<header class="cabecera"><a href="#contactos" class="volver">‹ Contactos</a>
      <h1>${c ? 'Editar contacto' : 'Nuevo contacto'}</h1></header>
    <form id="f" class="tarjeta" autocomplete="off">
      <label>Nombre<input name="nombre" required value="${esc(v.nombre)}" placeholder="Ej: aseguradora, administrador de la comunidad…"></label>
      <label>Tipo<select name="categoria">${CAT_CONTACTO.map(([k, ic, n]) => `<option value="${k}" ${k === v.categoria ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select></label>
      <label>Para qué<input name="para" value="${esc(v.para)}" placeholder="Ej: seguro del coche y del hogar"></label>
      <div class="dos">
        <label>Teléfono<input name="telefono" type="tel" value="${esc(v.telefono)}"></label>
        <label>Otro teléfono<input name="telefono2" type="tel" value="${esc(v.telefono2)}"></label>
      </div>
      <label>Correo<input name="email" type="email" value="${esc(v.email)}"></label>
      <label>Web<input name="web" value="${esc(v.web)}" placeholder="ejemplo.com"></label>
      <label>Nº de póliza, cliente o contrato<input name="referencia" value="${esc(v.referencia)}"></label>
      <label>Notas<textarea name="notas" rows="3">${esc(v.notas)}</textarea></label>
      <button class="btn primario" type="submit">Guardar</button>
      ${c ? '<button class="btn peligro ancho" type="button" id="borrar">🗑️ Borrar</button>' : ''}
      <p class="error" id="err"></p>
    </form>`);
  $('#borrar')?.addEventListener('click', async () => {
    if (!confirm(`¿Borrar el contacto "${c.nombre}"?`)) return;
    await ctx.borrarRegistro(c.id);
    ctx.aviso('Contacto borrado');
    ctx.ir('#contactos');
  });
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const campo = (k) => String(f.get(k) || '').trim();
    ctx.ocupado($('#f button[type=submit]'), 'Guardando…', async () => {
      try {
        await ctx.guardarRegistro({
          ...(c || {}), tipo: 'contacto', nombre: campo('nombre'), categoria: campo('categoria'), para: campo('para'),
          telefono: campo('telefono'), telefono2: campo('telefono2'), email: campo('email'), web: campo('web'),
          referencia: campo('referencia'), notas: campo('notas'),
        });
        ctx.aviso('Contacto guardado 🔒');
        ctx.ir('#contactos');
      } catch (error) { $('#err').textContent = 'No se pudo guardar: ' + (error.message || error); }
    });
  };
}
