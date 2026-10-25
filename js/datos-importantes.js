// Datos importantes: un buscador con todos los números y datos que se piden a menudo
// (dirección, CUPS, referencias catastrales, teléfonos, correos…). Junta:
//  - registros cifrados de tipo "dato" que añade el usuario,
//  - los números ya guardados en sus documentos (DNI, pasaporte, pólizas…),
//  - teléfonos y referencias de sus contactos.
import { CATEGORIAS } from './datos.js';

export const GRUPOS = [
  ['personal', '👤', 'Personal'],
  ['casa', '🏠', 'Casa'],
  ['suministros', '💡', 'Luz, gas y agua'],
  ['coche', '🚗', 'Coche'],
  ['bancos', '🏦', 'Bancos y dinero'],
  ['trabajo', '🎖️', 'Trabajo'],
  ['otros', '📌', 'Otros'],
];
const grupo = (id) => GRUPOS.find((g) => g[0] === id) || GRUPOS[GRUPOS.length - 1];
// Cada categoría de documento va a un grupo de este apartado
const GRUPO_DE_CATEGORIA = { identidad: 'personal', casa: 'casa', militar: 'trabajo', trabajo: 'trabajo', dinero: 'bancos', coche: 'coche', salud: 'personal', otros: 'otros' };
const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function todos(estado, fecha) {
  const lista = [];
  for (const r of (estado.registros || []).filter((x) => x.tipo === 'dato')) {
    lista.push({ origen: 'dato', id: r.id, grupo: r.grupo || 'otros', etiqueta: r.etiqueta, valor: r.valor, nota: r.notas || '' });
  }
  for (const d of estado.docs || []) {
    if (!d.numero) continue;
    const cat = CATEGORIAS.find((c) => c.id === d.categoria);
    lista.push({
      origen: 'doc', id: d.id, grupo: GRUPO_DE_CATEGORIA[d.categoria] || 'otros', etiqueta: d.titulo, valor: d.numero,
      nota: [cat ? `${cat.icono} Documento` : 'Documento', d.caduca ? `caduca ${fecha(d.caduca)}` : ''].filter(Boolean).join(' · '),
    });
  }
  for (const c of (estado.registros || []).filter((x) => x.tipo === 'contacto')) {
    const g = { seguros: 'otros', bancos: 'bancos', suministros: 'suministros', casa: 'casa', trabajo: 'trabajo' }[c.categoria] || 'otros';
    if (c.telefono) lista.push({ origen: 'contacto', id: c.id, grupo: g, etiqueta: `Teléfono ${c.nombre}`, valor: c.telefono, nota: '📇 Contacto' });
    if (c.referencia) lista.push({ origen: 'contacto', id: c.id, grupo: g, etiqueta: `${c.nombre}: referencia`, valor: c.referencia, nota: '📇 Contacto' });
  }
  return lista.sort((a, b) => (a.etiqueta || '').localeCompare(b.etiqueta || '', 'es'));
}

export function vistaDatos(ctx, q) {
  const { estado, esc, pintar, $, fecha } = ctx;
  const lista = todos(estado, fecha);
  const enlace = (x) => (x.origen === 'dato' ? `#editar-dato/${x.id}` : x.origen === 'doc' ? `#doc/${x.id}` : `#editar-contacto/${x.id}`);
  const fila = (x, k) => `<li class="dato-fila" data-k="${k}" data-buscar="${esc(normal(`${x.etiqueta} ${x.valor} ${x.nota} ${grupo(x.grupo)[2]}`))}">
      <a class="texto" href="${enlace(x)}"><small>${esc(x.etiqueta)}</small><b class="copiable">${esc(x.valor)}</b>
        ${x.nota ? `<small class="nota">${esc(x.nota)}</small>` : ''}</a>
      <button class="btn peq copiar" data-k="${k}" aria-label="Copiar">📋</button></li>`;

  pintar(`<header class="cabecera fila"><a href="#mas" class="volver">‹ Más</a><h1>Datos importantes</h1>
      <a class="btn primario peq" href="#nuevo-dato">＋ Añadir</a></header>
    <div class="buscador-datos"><input id="buscar" type="search" placeholder="🔎 Buscar: cups, catastral, dni, póliza…"
      value="${esc(q?.get('q') || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
    ${GRUPOS.map(([id, ic, nombre]) => {
      const del = lista.map((x, k) => [x, k]).filter(([x]) => x.grupo === id);
      return del.length ? `<section class="tarjeta grupo-datos" data-grupo="${id}"><h2>${ic} ${esc(nombre)}</h2>
        <ul class="lista">${del.map(([x, k]) => fila(x, k)).join('')}</ul></section>` : '';
    }).join('')}
    <p class="vacio" id="sin-resultados" hidden>Nada coincide. Prueba con otra palabra o pulsa «＋ Añadir».</p>
    ${lista.length ? '' : '<p class="vacio">Aún no hay datos. Pulsa «＋ Añadir».</p>'}
    <p class="ayuda">Los números de tus documentos y contactos aparecen aquí solos. Toca un dato para verlo o editarlo, y 📋 para copiarlo.
      Todo va cifrado con tu clave maestra.</p>`);

  const filtrar = () => {
    const t = normal($('#buscar').value).trim().split(/\s+/).filter(Boolean);
    let visibles = 0;
    document.querySelectorAll('.dato-fila').forEach((li) => {
      const ok = t.every((p) => li.dataset.buscar.includes(p));
      li.hidden = !ok; if (ok) visibles++;
    });
    document.querySelectorAll('.grupo-datos').forEach((s) => { s.hidden = !s.querySelector('.dato-fila:not([hidden])'); });
    $('#sin-resultados').hidden = !lista.length || visibles > 0;
  };
  $('#buscar').addEventListener('input', filtrar);
  document.querySelectorAll('.copiar').forEach((b) => b.addEventListener('click', () => {
    const x = lista[Number(b.dataset.k)];
    ctx.copiar(x.valor, `${x.etiqueta} copiado`);
  }));
  filtrar();
  if (!('ontouchstart' in window)) $('#buscar').focus();
}

export function vistaFormDato(ctx, id) {
  const { estado, esc, pintar, $ } = ctx;
  const d = id ? (estado.registros || []).find((r) => r.id === id && r.tipo === 'dato') : null;
  if (id && !d) return ctx.ir('#datos');
  const v = d || { grupo: 'personal' };
  pintar(`<header class="cabecera"><a href="#datos" class="volver">‹ Datos importantes</a>
      <h1>${d ? 'Editar dato' : 'Nuevo dato'}</h1></header>
    <form id="f" class="tarjeta" autocomplete="off">
      <label>Qué es<input name="etiqueta" required value="${esc(v.etiqueta)}" placeholder="Ej: Referencia catastral del garaje"></label>
      <label>Dato<input name="valor" required value="${esc(v.valor)}" autocapitalize="off" spellcheck="false"></label>
      <label>Grupo<select name="grupo">${GRUPOS.map(([k, ic, n]) => `<option value="${k}" ${k === v.grupo ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select></label>
      <label>Notas (opcional)<textarea name="notas" rows="2">${esc(v.notas)}</textarea></label>
      <button class="btn primario" type="submit">Guardar</button>
      ${d ? '<button class="btn peligro ancho" type="button" id="borrar">🗑️ Borrar</button>' : ''}
      <p class="error" id="err"></p>
    </form>`);
  $('#borrar')?.addEventListener('click', async () => {
    if (!confirm(`¿Borrar "${d.etiqueta}"?`)) return;
    await ctx.borrarRegistro(d.id);
    ctx.aviso('Dato borrado');
    ctx.ir('#datos');
  });
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const t = (k) => String(f.get(k) || '').trim();
    ctx.ocupado($('#f button[type=submit]'), 'Guardando…', async () => {
      try {
        await ctx.guardarRegistro({ ...(d || {}), tipo: 'dato', etiqueta: t('etiqueta'), valor: t('valor'), grupo: t('grupo'), notas: t('notas') });
        ctx.aviso('Dato guardado 🔒');
        ctx.ir('#datos');
      } catch (error) { $('#err').textContent = 'No se pudo guardar: ' + (error.message || error); }
    });
  };
}
