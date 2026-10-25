// Dinero del día a día: gastos, ingresos y gastos fijos (todo cifrado como "registros" de tipo "movimiento").
import * as G from './graficos.js';

export const CAT_GASTO = [
  ['vivienda', '🏠 Vivienda (hipoteca, comunidad, IBI)'], ['suministros', '💡 Luz, agua, gas e internet'],
  ['super', '🛒 Supermercado'], ['transporte', '⛽ Transporte y combustible'], ['coche', '🚗 Coche (seguro, ITV, taller)'],
  ['seguros', '🛡️ Seguros'], ['restaurantes', '🍽️ Restaurantes y bares'], ['ocio', '🎬 Ocio'],
  ['suscripciones', '📺 Suscripciones'], ['ropa', '👕 Ropa'], ['salud', '💊 Salud'], ['viajes', '✈️ Viajes'],
  ['regalos', '🎁 Regalos'], ['impuestos', '🧾 Impuestos'], ['inversion', '📈 Inversión (DCA)'], ['otros', '📦 Otros'],
];
export const CAT_INGRESO = [['nomina', '💼 Nómina'], ['extra', '⭐ Pagas extra y dietas'], ['intereses', '🏦 Intereses'], ['otros', '📦 Otros']];
const nombreCat = (clase, id) => (clase === 'ingreso' ? CAT_INGRESO : CAT_GASTO).find(([k]) => k === id)?.[1] || id;

const mesActual = () => new Date().toISOString().slice(0, 7);
const sumarMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const nombreMes = (ym) => { const [y, m] = ym.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };

// Movimientos de un mes: los normales de ese mes + los fijos que estén vigentes ese mes
export function movimientosDelMes(registros, ym) {
  const lista = [];
  for (const r of registros.filter((x) => x.tipo === 'movimiento')) {
    if (r.fijo) {
      const desde = r.fecha.slice(0, 7);
      const hasta = r.hasta ? r.hasta.slice(0, 7) : null;
      if (ym >= desde && (!hasta || ym <= hasta)) {
        const dia = Math.min(Number(r.fecha.slice(8, 10)), 28);
        lista.push({ ...r, fechaMes: `${ym}-${String(dia).padStart(2, '0')}`, virtual: true });
      }
    } else if (r.fecha.slice(0, 7) === ym) lista.push({ ...r, fechaMes: r.fecha });
  }
  return lista.sort((a, b) => b.fechaMes.localeCompare(a.fechaMes));
}

function totales(lista, num) {
  const ingresos = lista.filter((m) => m.clase === 'ingreso').reduce((s, m) => s + num(m.importe), 0);
  const invertido = lista.filter((m) => m.clase === 'gasto' && m.categoria === 'inversion').reduce((s, m) => s + num(m.importe), 0);
  const gastos = lista.filter((m) => m.clase === 'gasto' && m.categoria !== 'inversion').reduce((s, m) => s + num(m.importe), 0);
  return { ingresos, gastos, invertido, ahorro: ingresos - gastos };
}

export function vistaDinero(ctx, q) {
  const { estado, esc, euros, num, pintar, $ } = ctx;
  const ym = /^\d{4}-\d{2}$/.test(q.get('m') || '') ? q.get('m') : mesActual();
  const regs = estado.registros || [];
  const lista = movimientosDelMes(regs, ym);
  const t = totales(lista, num);
  const pctAhorro = t.ingresos ? (t.ahorro / t.ingresos) * 100 : 0;
  const porCat = {};
  for (const m of lista.filter((x) => x.clase === 'gasto' && x.categoria !== 'inversion')) porCat[m.categoria] = (porCat[m.categoria] || 0) + num(m.importe);
  const trozos = Object.entries(porCat).map(([c, v]) => ({ nombre: nombreCat('gasto', c), v })).sort((a, b) => b.v - a.v);
  const meses = Array.from({ length: 12 }, (_, k) => sumarMes(ym, k - 11));
  const barrasAhorro = meses.map((m) => { const x = totales(movimientosDelMes(regs, m), num); return { etiqueta: m.slice(5) + '/' + m.slice(2, 4), v: x.ahorro, nota: `ingresos ${euros(x.ingresos)} · gastos ${euros(x.gastos)}` }; });
  const fijos = regs.filter((r) => r.tipo === 'movimiento' && r.fijo && (!r.hasta || r.hasta.slice(0, 7) >= mesActual()));
  const fijosGasto = fijos.filter((f) => f.clase === 'gasto').reduce((s, f) => s + num(f.importe), 0);

  pintar(`<header class="cabecera fila"><h1>Dinero</h1>
      <a class="btn primario peq" href="#nuevo-mov">＋ Apuntar</a></header>
    <div class="selector-mes"><a class="btn texto" href="#dinero?m=${sumarMes(ym, -1)}">‹</a><b>${nombreMes(ym)}</b>
      <a class="btn texto" href="#dinero?m=${sumarMes(ym, 1)}">›</a></div>
    <section class="kpis">
      <div class="kpi"><span>Ingresos</span><b class="sube">${euros(t.ingresos)}</b></div>
      <div class="kpi"><span>Gastos</span><b class="baja">${euros(t.gastos)}</b></div>
      <div class="kpi"><span>Ahorro</span><b class="${t.ahorro >= 0 ? 'sube' : 'baja'}">${euros(t.ahorro)}</b><small>${pctAhorro.toLocaleString('es-ES', { maximumFractionDigits: 0 })} % de lo que entra</small></div>
      <div class="kpi"><span>Invertido (DCA)</span><b>${euros(t.invertido)}</b><small>sale del ahorro</small></div>
    </section>
    ${trozos.length ? `<section class="tarjeta"><h2>🍩 ¿En qué se va el dinero?</h2>${G.donut(trozos)}</section>` : ''}
    <section class="tarjeta"><h2>📊 Ahorro de los últimos 12 meses</h2>${G.barras(barrasAhorro)}</section>
    <section class="tarjeta"><h2>🧾 Movimientos de ${esc(nombreMes(ym).toLowerCase())}</h2>
      <ul class="lista">${lista.map((m) => `<li><a class="fila-item" href="#editar-mov/${m.id}">
        <span class="icono">${nombreCat(m.clase, m.categoria).split(' ')[0]}</span>
        <span class="texto"><b>${esc(m.nota || nombreCat(m.clase, m.categoria).replace(/^\S+\s/, ''))}</b>
          <small>${ctx.fecha(m.fechaMes)}${m.virtual ? ' · 🔁 fijo mensual' : ''}</small></span>
        <span class="cifra"><b class="${m.clase === 'ingreso' ? 'sube' : ''}">${m.clase === 'ingreso' ? '+' : '−'}${euros(num(m.importe))}</b></span></a></li>`).join('')
        || '<li class="vacio">Sin movimientos este mes. Pulsa «＋ Apuntar».</li>'}</ul>
    </section>
    <section class="tarjeta"><h2>🔁 Gastos e ingresos fijos</h2>
      <p class="ayuda">Se apuntan solos cada mes. Gastos fijos: <b>${euros(fijosGasto)}/mes</b>.</p>
      <ul class="mini">${fijos.map((f) => `<li><span>${esc(f.nota || nombreCat(f.clase, f.categoria))}</span>
        <a href="#editar-mov/${f.id}">${f.clase === 'ingreso' ? '+' : '−'}${euros(num(f.importe))}</a></li>`).join('') || '<li>Aún no hay fijos. Al apuntar un gasto marca «Se repite cada mes».</li>'}</ul>
    </section>
    <button class="btn" id="csv">⬇️ Descargar ${esc(nombreMes(ym).toLowerCase())} en Excel (CSV)</button>`);

  $('#csv').onclick = () => {
    const filas = [['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Importe', 'Fijo']].concat(lista.map((m) =>
      [m.fechaMes, m.clase, nombreCat(m.clase, m.categoria).replace(/^\S+\s/, ''), m.nota || '', (m.clase === 'ingreso' ? 1 : -1) * num(m.importe), m.fijo ? 'sí' : 'no']));
    const celda = (c) => (typeof c === 'number' ? c.toFixed(2).replace('.', ',') : `"${String(c).replace(/"/g, '""')}"`);
    const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `mivida-dinero-${ym}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
}

export function vistaFormMov(ctx, id) {
  const { estado, esc, num, pintar, $, $$ } = ctx;
  const m = id ? (estado.registros || []).find((r) => r.id === id) : null;
  if (id && !m) return ctx.ir('#dinero');
  const v = m || { clase: 'gasto', categoria: 'super', fecha: new Date().toISOString().slice(0, 10) };
  const opciones = (clase) => (clase === 'ingreso' ? CAT_INGRESO : CAT_GASTO)
    .map(([k, n]) => `<option value="${k}" ${k === v.categoria ? 'selected' : ''}>${esc(n)}</option>`).join('');
  pintar(`<header class="cabecera"><a href="#dinero" class="volver">‹ Dinero</a><h1>${m ? 'Editar movimiento' : 'Apuntar'}</h1></header>
    <form id="f" class="tarjeta" autocomplete="off">
      <div class="segmentos">
        <label><input type="radio" name="clase" value="gasto" ${v.clase === 'gasto' ? 'checked' : ''}><span>Gasto</span></label>
        <label><input type="radio" name="clase" value="ingreso" ${v.clase === 'ingreso' ? 'checked' : ''}><span>Ingreso</span></label>
      </div>
      <label>Importe (€)<input name="importe" inputmode="decimal" required value="${v.importe != null ? String(v.importe).replace('.', ',') : ''}" placeholder="0,00" class="grande-input"></label>
      <label>Categoría<select name="categoria">${opciones(v.clase)}</select></label>
      <label>Concepto (opcional)<input name="nota" value="${esc(v.nota)}" placeholder="Ej: Mercadona, gasolina…"></label>
      <label>Fecha<input type="date" name="fecha" required value="${esc(v.fecha)}"></label>
      <label class="check"><input type="checkbox" name="fijo" ${v.fijo ? 'checked' : ''}> Se repite cada mes (gasto o ingreso fijo)</label>
      <label class="solo-fijo">Hasta (opcional)<input type="date" name="hasta" value="${esc(v.hasta)}"></label>
      <button class="btn primario" type="submit">Guardar</button>
      ${m ? '<button class="btn peligro ancho" type="button" id="borrar">🗑️ Borrar</button>' : ''}
      <p class="error" id="err"></p>
    </form>`);
  const ajustar = () => {
    const clase = $('[name=clase]:checked').value;
    const sel = $('[name=categoria]');
    if (sel.dataset.clase !== clase) { v.categoria = clase === 'ingreso' ? 'nomina' : (v.clase === 'gasto' ? v.categoria : 'super'); v.clase = clase; sel.innerHTML = opciones(clase); sel.dataset.clase = clase; }
    $$('.solo-fijo').forEach((e) => { e.hidden = !$('[name=fijo]').checked; });
  };
  $('[name=categoria]').dataset.clase = v.clase;
  $$('[name=clase]').forEach((r) => { r.onchange = ajustar; });
  $('[name=fijo]').onchange = ajustar;
  ajustar();
  $('#borrar')?.addEventListener('click', async () => {
    if (!confirm('¿Borrar este movimiento?' + (m.fijo ? ' Al ser fijo, desaparecerá de todos los meses.' : ''))) return;
    await ctx.borrarRegistro(m.id);
    ctx.aviso('Borrado');
    ctx.ir('#dinero');
  });
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    ctx.ocupado($('#f button[type=submit]'), 'Guardando…', async () => {
      try {
        const importe = num(f.get('importe'));
        if (!(importe > 0)) { $('#err').textContent = 'Escribe un importe.'; return; }
        const r = await ctx.guardarRegistro({
          ...(m || {}), tipo: 'movimiento', clase: f.get('clase'), importe, categoria: f.get('categoria'),
          nota: f.get('nota').trim(), fecha: f.get('fecha'), fijo: f.has('fijo'), hasta: f.has('fijo') ? f.get('hasta') : '',
        });
        ctx.aviso('Guardado 🔒');
        ctx.ir(`#dinero?m=${r.fecha.slice(0, 7)}`);
      } catch (error) { $('#err').textContent = 'No se pudo guardar: ' + (error.message || error); }
    });
  };
}

// Resumen corto para Inicio
export function resumenMes(ctx) {
  const regs = ctx.estado.registros || [];
  if (!regs.some((r) => r.tipo === 'movimiento')) return null;
  return totales(movimientosDelMes(regs, mesActual()), ctx.num);
}
