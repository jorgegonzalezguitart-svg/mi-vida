// Contratos: una ficha por servicio contratado (móvil, luz, gas, agua, comunidad, hipoteca, seguros…).
// Registros cifrados de tipo "contrato". Cada uno puede enlazar el documento (PDF) guardado en Docs.
// Lo que "se actualiza solo": días hasta renovación o fin de permanencia, el total de gastos fijos,
// los datos vivos de la hipoteca y los avisos al móvil (js/avisos.js usa fechasContrato).
import * as H from './hipoteca.js';

export const SERVICIOS = [
  ['movil', '📱', 'Móvil'],
  ['internet', '🌐', 'Internet'],
  ['luz', '💡', 'Luz'],
  ['gas', '🔥', 'Gas'],
  ['agua', '💧', 'Agua'],
  ['comunidad', '🏢', 'Comunidad'],
  ['hipoteca', '🏦', 'Hipoteca'],
  ['seguros', '🛡️', 'Seguros'],
  ['otros', '📄', 'Otros'],
];
const servicio = (id) => SERVICIOS.find((s) => s[0] === id) || SERVICIOS[SERVICIOS.length - 1];
const ESTADOS = [['activo', 'Activo'], ['cambio', 'Cambiando'], ['baja', 'De baja']];
const DIA = 86400000;
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dias = (iso) => Math.round((new Date(iso + 'T00:00:00') - new Date(hoyIso() + 'T00:00:00')) / DIA);
const cuanto = (n) => {
  if (n < 0) return `hace ${-n} días`;
  if (n === 0) return 'hoy';
  if (n < 60) return `en ${n} días`;
  const m = Math.round(n / 30.4);
  return m < 24 ? `en ${m} meses` : `en ${(n / 365.25).toLocaleString('es-ES', { maximumFractionDigits: 1 })} años`;
};

export const contratosDe = (estado) => (estado.registros || []).filter((r) => r.tipo === 'contrato');

// Coste al mes (si solo hay anual, se divide entre 12). La hipoteca usa la cuota calculada.
function costeMes(c, estado) {
  if (c.servicio === 'hipoteca' && c.usarHipoteca !== false) {
    const h = H.hipotecaDe(estado);
    if (h) {
      const parte = (Number(h.tuParte) || 100) / 100;
      return H.calcular(h).cuota * parte;
    }
  }
  if (Number(c.costeMes)) return Number(c.costeMes);
  if (Number(c.costeAnio)) return Number(c.costeAnio) / 12;
  return 0;
}

// Fechas importantes de un contrato (las usan la pestaña Resumen y los avisos)
export function fechasContrato(c) {
  const f = [];
  if (c.estadoContrato === 'baja') return f;
  if (c.renovacion) f.push({ f: c.renovacion, que: c.renuevaSola ? 'Se renueva solo' : 'Vence', c });
  if (c.permanencia) f.push({ f: c.permanencia, que: 'Fin de la permanencia', c });
  if (c.revisar) f.push({ f: c.revisar, que: 'Revisar tarifa', c });
  return f;
}

// ============================================================
//  Vista: pestaña Contratos (#contratos?s=luz)
// ============================================================
export function vistaContratos(ctx, q) {
  const { estado, esc, euros, fecha, pintar, $ } = ctx;
  const todos = contratosDe(estado);
  const activos = todos.filter((c) => c.estadoContrato !== 'baja');
  const conDatos = SERVICIOS.filter(([id]) => todos.some((c) => c.servicio === id));
  const sel = q?.get('s') && (q.get('s') === 'resumen' || SERVICIOS.some(([id]) => id === q.get('s'))) ? q.get('s') : 'resumen';

  const pestanas = [['resumen', '📊', 'Resumen'], ...conDatos].map(([id, ic, n]) =>
    `<a href="#contratos?s=${id}" class="${id === sel ? 'activa' : ''}">${ic} ${esc(n)}</a>`).join('');

  let cuerpo = '';
  if (!todos.length) {
    cuerpo = `<section class="tarjeta"><p class="vacio">Aún no hay contratos. Pulsa «＋ Añadir» para apuntar el primero
      (móvil, luz, gas, agua, comunidad, hipoteca, seguros…).</p></section>`;
  } else if (sel === 'resumen') {
    cuerpo = resumen(ctx, activos);
  } else {
    const lista = todos.filter((c) => c.servicio === sel)
      .sort((a, b) => (a.estadoContrato === 'baja') - (b.estadoContrato === 'baja') || (a.nombre || '').localeCompare(b.nombre || ''));
    cuerpo = lista.map((c) => ficha(ctx, c)).join('') || '<p class="vacio">Nada en este servicio.</p>';
  }

  pintar(`<header class="cabecera fila"><h1>Contratos</h1>
      <a class="btn primario peq" href="#nuevo-contrato${sel !== 'resumen' ? `?s=${sel}` : ''}">＋ Añadir</a></header>
    <nav class="pestanas">${pestanas}</nav>
    ${cuerpo}`);

  // Botones de abrir el PDF de cada contrato (se descifra al pulsar)
  document.querySelectorAll('[data-abrir-doc]').forEach((b) => b.addEventListener('click', () => ctx.ocupado(b, 'Abriendo…', async () => {
    const d = estado.docs.find((x) => x.id === b.dataset.abrirDoc);
    const a = d?.archivos?.[Number(b.dataset.k)];
    if (!a) return ctx.aviso('No encuentro el archivo', 'error');
    try {
      const url = await ctx.descargarArchivo(a);
      const enlace = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' });
      if (!a.tipo?.startsWith('image/') && !a.tipo?.includes('pdf')) enlace.download = a.nombre;
      document.body.appendChild(enlace); enlace.click(); enlace.remove();
    } catch (e) { ctx.aviso('No se pudo abrir el contrato', 'error'); console.error(e); }
  })));
  $('#ir-fijos')?.addEventListener('click', () => ctx.ir('#contratos?s=resumen'));
}

function resumen(ctx, activos) {
  const { estado, esc, euros, fecha } = ctx;
  const filas = activos.map((c) => ({ c, mes: costeMes(c, estado) })).sort((a, b) => b.mes - a.mes);
  const total = filas.reduce((s, x) => s + x.mes, 0);
  const proximas = activos.flatMap(fechasContrato).filter((x) => dias(x.f) >= -7)
    .sort((a, b) => a.f.localeCompare(b.f)).slice(0, 8);
  const sinPrecio = activos.filter((c) => !costeMes(c, estado));
  return `
    <section class="kpis compactos">
      <div class="kpi"><span>Gastos fijos al mes</span><b>${euros(total)}</b><small>${filas.length} contratos activos</small></div>
      <div class="kpi"><span>Al año</span><b>${euros(total * 12)}</b>${sinPrecio.length ? `<small>${sinPrecio.length} sin precio apuntado</small>` : ''}</div>
    </section>
    <section class="tarjeta"><h2>📅 Próximas fechas</h2>
      ${proximas.length ? `<ul class="lista">${proximas.map((x) => `<li><a class="fila-item" href="#contratos?s=${x.c.servicio}">
          <span class="icono">${servicio(x.c.servicio)[1]}</span>
          <span class="texto"><b>${esc(x.que)}: ${esc(x.c.nombre)}</b><small>${fecha(x.f)} · ${cuanto(dias(x.f))}</small></span></a></li>`).join('')}</ul>`
        : '<p class="vacio">No hay renovaciones ni revisiones apuntadas.</p>'}
    </section>
    <section class="tarjeta"><h2>💶 Lo que pago al mes</h2>
      <ul class="mini">${filas.map(({ c, mes }) => `<li><a href="#contratos?s=${c.servicio}">${servicio(c.servicio)[1]} ${esc(c.nombre)}</a>
        <b>${mes ? euros(mes) : '¿?'}</b></li>`).join('')}
        <li class="total"><span>Total</span><b>${euros(total)}</b></li></ul>
      <p class="ayuda">Importes aproximados con impuestos. La hipoteca cuenta tu parte con la cuota calculada.</p>
    </section>`;
}

function ficha(ctx, c) {
  const { estado, esc, euros, fecha } = ctx;
  const mes = costeMes(c, estado);
  const doc = c.docId ? estado.docs.find((d) => d.id === c.docId) : null;
  const contacto = c.contactoId ? (estado.registros || []).find((r) => r.id === c.contactoId) : null;
  const fila = (t, v) => (v ? `<li><span>${t}</span><b>${v}</b></li>` : '');
  const linea = (iso, txt) => `${fecha(iso)} <small>(${cuanto(dias(iso))})</small>${txt ? ` · ${txt}` : ''}`;
  let vivo = '';
  if (c.servicio === 'hipoteca') {
    const h = H.hipotecaDe(estado);
    if (h) {
      const a = H.calcular(h);
      vivo = `<p class="ayuda">📈 Hoy: te quedan <b>${euros(a.pendiente)}</b> por pagar (total), cuota <b>${euros(a.cuota)}</b>${a.cambio ? `; desde ${fecha(a.cambio.f)} ≈ ${euros(a.cambio.cuota)} (variable estimado)` : ''}.
        <a href="#inversiones?t=hipoteca">Ver detalle</a></p>`;
    }
  }
  const badge = c.estadoContrato && c.estadoContrato !== 'activo' ? `<span class="etiqueta ${c.estadoContrato}">${esc(ESTADOS.find((e) => e[0] === c.estadoContrato)?.[1] || '')}</span>` : '';
  return `<section class="tarjeta contrato ${c.estadoContrato === 'baja' ? 'de-baja' : ''}">
    <div class="fila"><h2>${servicio(c.servicio)[1]} ${esc(c.nombre)} ${badge}</h2><a class="btn texto peq" href="#editar-contrato/${c.id}">✏️ Editar</a></div>
    <p class="sub">${esc([c.compania, c.tarifa].filter(Boolean).join(' · '))}</p>
    <ul class="mini">
      ${fila('💶 Precio', esc(c.precio || ''))}
      ${fila('Al mes / al año', mes ? `${euros(mes)} / ${euros(mes * 12)}` : '')}
      ${fila('🔒 Permanencia', c.permanencia ? linea(c.permanencia, 'hasta esa fecha') : (c.sinPermanencia ? 'Sin permanencia' : ''))}
      ${fila('🔄 Renueva', c.renovacion ? linea(c.renovacion, c.renuevaSola ? 'se renueva sola' : 'no se renueva sola') : '')}
      ${fila('🔎 Revisar', c.revisar ? linea(c.revisar, '') : '')}
      ${fila('🏷️ Nº', esc(c.referencia || ''))}
      ${fila('👤 Titular', esc(c.titular || ''))}
      ${fila('📅 Desde', c.desde ? fecha(c.desde) : '')}
    </ul>
    ${vivo}
    ${c.resumen ? `<div class="condiciones"><h3>Condiciones</h3><p>${esc(c.resumen).replace(/\n/g, '<br>')}</p></div>` : ''}
    <div class="acciones">
      ${doc ? (doc.archivos || []).map((a, k) => `<button class="btn primario" data-abrir-doc="${doc.id}" data-k="${k}">📄 ${k ? esc(a.nombre) : 'Abrir contrato'}</button>`).join('')
        + `<a class="btn texto" href="#doc/${doc.id}">Ver ficha del documento</a>` : '<p class="ayuda">📄 Sin contrato en PDF: enlázalo en «Editar».</p>'}
      ${contacto?.telefono ? `<a class="btn" href="tel:${esc(String(contacto.telefono).replace(/[^\d+]/g, ''))}">📞 ${esc(contacto.nombre)}</a>` : ''}
    </div>
    ${c.notas ? `<p class="ayuda">📝 ${esc(c.notas)}</p>` : ''}
  </section>`;
}

// ============================================================
//  Formulario
// ============================================================
export function vistaFormContrato(ctx, id, q) {
  const { estado, esc, pintar, $, num } = ctx;
  const c = id ? contratosDe(estado).find((r) => r.id === id) : null;
  if (id && !c) return ctx.ir('#contratos');
  const v = c || { servicio: q?.get('s') || 'movil', estadoContrato: 'activo', sinPermanencia: true };
  const campo = (n, et, extra = '') => `<label>${et}<input name="${n}" value="${esc(v[n] ?? '')}" ${extra}></label>`;
  const docs = [...estado.docs].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  const contactos = (estado.registros || []).filter((r) => r.tipo === 'contacto');
  pintar(`<header class="cabecera"><a href="#contratos?s=${esc(v.servicio)}" class="volver">‹ Contratos</a>
      <h1>${c ? 'Editar contrato' : 'Nuevo contrato'}</h1></header>
    <form id="f" class="tarjeta" autocomplete="off">
      <div class="dos">
        <label>Servicio<select name="servicio">${SERVICIOS.map(([k, ic, n]) => `<option value="${k}" ${k === v.servicio ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select></label>
        <label>Estado<select name="estadoContrato">${ESTADOS.map(([k, n]) => `<option value="${k}" ${k === v.estadoContrato ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      ${campo('nombre', 'Nombre corto', 'required placeholder="Ej: Luz de casa, Seguro del coche…"')}
      <div class="dos">${campo('compania', 'Compañía')}${campo('tarifa', 'Tarifa o producto')}</div>
      ${campo('precio', 'Precio (resumen)', 'placeholder="Ej: 0,093 €/kW·día + 0,1154 €/kWh"')}
      <div class="dos">${campo('costeMes', 'Coste al mes (€, aprox.)', 'inputmode="decimal"')}${campo('costeAnio', 'o coste al año (€)', 'inputmode="decimal"')}</div>
      <div class="dos">${campo('desde', 'Desde', 'type="date"')}${campo('permanencia', 'Permanencia hasta', 'type="date"')}</div>
      <label class="check"><input type="checkbox" name="sinPermanencia" ${v.sinPermanencia ? 'checked' : ''}> Sin permanencia</label>
      <div class="dos">${campo('renovacion', 'Renovación / vencimiento', 'type="date"')}${campo('revisar', 'Próxima revisión de tarifa', 'type="date"')}</div>
      <label class="check"><input type="checkbox" name="renuevaSola" ${v.renuevaSola ? 'checked' : ''}> Se renueva automáticamente</label>
      <div class="dos">${campo('referencia', 'Nº de contrato / póliza / CUPS')}${campo('titular', 'Titular')}</div>
      <label>Condiciones (resumen breve)<textarea name="resumen" rows="5" placeholder="Lo importante: qué incluye, precios, comisiones, avisos…">${esc(v.resumen)}</textarea></label>
      <label>Contrato en PDF (documento de Docs)<select name="docId"><option value="">— Ninguno —</option>
        ${docs.map((d) => `<option value="${d.id}" ${d.id === v.docId ? 'selected' : ''}>${esc(d.titulo)}</option>`).join('')}</select></label>
      <label>Contacto<select name="contactoId"><option value="">— Ninguno —</option>
        ${contactos.map((x) => `<option value="${x.id}" ${x.id === v.contactoId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>
      <label>Notas<textarea name="notas" rows="2">${esc(v.notas)}</textarea></label>
      <button class="btn primario" type="submit">Guardar</button>
      ${c ? '<button class="btn peligro ancho" type="button" id="borrar">🗑️ Borrar</button>' : ''}
      <p class="error" id="err"></p>
    </form>`);
  $('#borrar')?.addEventListener('click', async () => {
    if (!confirm(`¿Borrar el contrato "${c.nombre}"? (El PDF sigue en Docs)`)) return;
    await ctx.borrarRegistro(c.id);
    ctx.aviso('Contrato borrado');
    ctx.ir(`#contratos?s=${c.servicio}`);
  });
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const t = (k) => String(f.get(k) || '').trim();
    const x = (k) => (t(k) ? num(t(k)) : '');
    ctx.ocupado($('#f button[type=submit]'), 'Guardando…', async () => {
      try {
        const r = await ctx.guardarRegistro({
          ...(c || {}), tipo: 'contrato', servicio: t('servicio'), estadoContrato: t('estadoContrato'), nombre: t('nombre'),
          compania: t('compania'), tarifa: t('tarifa'), precio: t('precio'), costeMes: x('costeMes'), costeAnio: x('costeAnio'),
          desde: t('desde'), permanencia: t('permanencia'), sinPermanencia: f.has('sinPermanencia'), renovacion: t('renovacion'),
          renuevaSola: f.has('renuevaSola'), revisar: t('revisar'), referencia: t('referencia'), titular: t('titular'),
          resumen: t('resumen'), docId: t('docId'), contactoId: t('contactoId'), notas: t('notas'),
        });
        ctx.aviso('Contrato guardado 🔒');
        ctx.ir(`#contratos?s=${r.servicio}`);
      } catch (error) { $('#err').textContent = 'No se pudo guardar: ' + (error.message || error); }
    });
  };
}
