// Gráficos SVG sencillos (sin librerías). Usan colores del tema vía clases CSS.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const eurCorto = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M€`;
  if (a >= 1e3) return `${(n / 1e3).toLocaleString('es-ES', { maximumFractionDigits: a >= 1e4 ? 0 : 1 })} k€`;
  return `${Math.round(n)} €`;
};
const fechaCorta = (iso) => { const [y, m] = iso.split('-'); return `${m}/${y.slice(2)}`; };

function ejeY(min, max, n = 4) {
  const paso = (max - min) / n || 1;
  return Array.from({ length: n + 1 }, (_, k) => min + paso * k);
}

// Líneas en el tiempo. series = [{ nombre, clase, puntos: [{ f, v }], escalonada?, area? }]
export function lineasTiempo(series, { alto = 280, formato = eurCorto, desdeCero = true } = {}) {
  const todos = series.flatMap((s) => s.puntos);
  if (todos.length < 2) return '<p class="ayuda">Aún no hay suficientes datos para dibujar este gráfico.</p>';
  const W = 640; const H = alto; const I = 84; const D = 12; const A = 14; const B = 40;
  const t = (f) => new Date(f + 'T00:00:00').getTime();
  const t0 = Math.min(...todos.map((p) => t(p.f))); const t1 = Math.max(...todos.map((p) => t(p.f)));
  let min = Math.min(...todos.map((p) => p.v)); const max = Math.max(...todos.map((p) => p.v));
  if (desdeCero) min = Math.min(0, min);
  const x = (f) => I + ((t(f) - t0) / (t1 - t0 || 1)) * (W - I - D);
  const y = (v) => H - B - ((v - min) / (max - min || 1)) * (H - A - B);
  const rejilla = ejeY(min, max).map((v) => `<line x1="${I}" x2="${W - D}" y1="${y(v)}" y2="${y(v)}" class="g-rejilla"/>
    <text x="${I - 6}" y="${y(v) + 4}" class="g-texto" text-anchor="end">${esc(formato(v))}</text>`).join('');
  const marcas = [0, 0.5, 1].map((k) => {
    const f = new Date(t0 + (t1 - t0) * k).toISOString().slice(0, 10);
    return `<text x="${x(f)}" y="${H - 10}" class="g-texto" text-anchor="${k === 0 ? 'start' : k === 1 ? 'end' : 'middle'}">${fechaCorta(f)}</text>`;
  }).join('');
  const caminos = series.map((s) => {
    const ps = [...s.puntos].sort((a, b) => a.f.localeCompare(b.f));
    if (!ps.length) return '';
    let d = '';
    ps.forEach((p, k) => {
      if (k === 0) d += `M${x(p.f).toFixed(1)},${y(p.v).toFixed(1)}`;
      else if (s.escalonada) d += `H${x(p.f).toFixed(1)}V${y(p.v).toFixed(1)}`;
      else d += `L${x(p.f).toFixed(1)},${y(p.v).toFixed(1)}`;
    });
    const area = s.area ? `<path d="${d}V${y(min)}H${x(ps[0].f)}Z" class="${s.clase}-area"/>` : '';
    const punto = ps.length === 1 || s.puntoFinal ? `<circle cx="${x(ps[ps.length - 1].f)}" cy="${y(ps[ps.length - 1].v)}" r="4" class="${s.clase}-punto"/>` : '';
    return `${area}<path d="${d}" class="${s.clase}"/>${punto}`;
  }).join('');
  const leyenda = series.map((s) => `<span class="ley ${s.clase}-ley">${esc(s.nombre)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img">${rejilla}${caminos}${marcas}</svg><div class="leyenda">${leyenda}</div>`;
}

// Barras verticales. datos = [{ etiqueta, v, clase?, nota? }]; linea = valor de referencia opcional
export function barras(datos, { alto = 260, formato = eurCorto, linea = null, lineaTexto = '' } = {}) {
  if (!datos.length) return '<p class="ayuda">Sin datos todavía.</p>';
  const W = 640; const H = alto; const I = 84; const D = 10; const A = 22; const B = 40;
  const vals = datos.map((d) => d.v).concat(linea ?? []);
  const max = Math.max(0, ...vals); const min = Math.min(0, ...vals);
  const y = (v) => H - B - ((v - min) / (max - min || 1)) * (H - A - B);
  const ancho = (W - I - D) / datos.length;
  const rejilla = ejeY(min, max).map((v) => `<line x1="${I}" x2="${W - D}" y1="${y(v)}" y2="${y(v)}" class="g-rejilla"/>
    <text x="${I - 6}" y="${y(v) + 4}" class="g-texto" text-anchor="end">${esc(formato(v))}</text>`).join('');
  const salto = Math.ceil(datos.length / 7);
  const bs = datos.map((d, k) => {
    const x = I + k * ancho + ancho * 0.15;
    const y0 = y(Math.max(0, d.v)); const h = Math.abs(y(d.v) - y(0));
    const clase = d.clase || (d.v >= 0 ? 'b-sube' : 'b-baja');
    return `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${(ancho * 0.7).toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="3" class="${clase}"><title>${esc(d.etiqueta)}: ${esc(d.nota || formato(d.v))}</title></rect>
      ${k % salto === 0 ? `<text x="${(x + ancho * 0.35).toFixed(1)}" y="${H - 10}" class="g-texto" text-anchor="middle">${esc(d.etiqueta)}</text>` : ''}`;
  }).join('');
  const ref = linea != null ? `<line x1="${I}" x2="${W - D}" y1="${y(linea)}" y2="${y(linea)}" class="g-ref"/>
    <text x="${W - D}" y="${y(linea) - 5}" class="g-texto" text-anchor="end">${esc(lineaTexto)}</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img">${rejilla}${bs}${ref}</svg>`;
}

// Donut con leyenda. trozos = [{ nombre, v }]
export function donut(trozos, { formato = eurCorto } = {}) {
  const total = trozos.reduce((s, t) => s + t.v, 0);
  if (!total) return '<p class="ayuda">Sin datos todavía.</p>';
  const R = 70; const r = 44; const C = 90;
  let a0 = -Math.PI / 2;
  const arcos = trozos.map((t, k) => {
    const a1 = a0 + (t.v / total) * Math.PI * 2;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${(C + rad * Math.cos(ang)).toFixed(2)},${(C + rad * Math.sin(ang)).toFixed(2)}`;
    const d = t.v / total > 0.9999
      ? `M${C - R},${C}a${R},${R} 0 1,0 ${R * 2},0a${R},${R} 0 1,0 ${-R * 2},0M${C - r},${C}a${r},${r} 0 1,1 ${r * 2},0a${r},${r} 0 1,1 ${-r * 2},0`
      : `M${p(R, a0)}A${R},${R} 0 ${grande},1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${grande},0 ${p(r, a0)}Z`;
    a0 = a1;
    return `<path d="${d}" class="d-${k % 9}"><title>${esc(t.nombre)}: ${(t.v / total * 100).toFixed(1)} %</title></path>`;
  }).join('');
  const leyenda = trozos.map((t, k) => `<li><span class="punto d-${k % 8}"></span><span class="nom">${esc(t.nombre)}</span>
    <b>${(t.v / total * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</b><small>${esc(formato(t.v))}</small></li>`).join('');
  return `<div class="donut"><svg viewBox="0 0 180 180" role="img">${arcos}</svg><ul>${leyenda}</ul></div>`;
}

// Proyección: valor actual + aportación mensual con varias rentabilidades anuales
export function proyeccion(valorHoy, mensual, anios, tasas) {
  const filas = [];
  for (let a = 0; a <= anios; a++) {
    const fila = { a, aportado: valorHoy + mensual * 12 * a };
    for (const t of tasas) {
      const rm = (1 + t) ** (1 / 12) - 1;
      const n = a * 12;
      fila[t] = valorHoy * (1 + rm) ** n + (rm ? mensual * (((1 + rm) ** n - 1) / rm) : mensual * n);
    }
    filas.push(fila);
  }
  return filas;
}

export function abanico(filas, tasas, { alto = 300 } = {}) {
  const W = 640; const H = alto; const I = 90; const D = 12; const A = 14; const B = 40;
  const max = Math.max(...filas.map((f) => f[tasas[tasas.length - 1]]));
  const n = filas.length - 1;
  const x = (a) => I + (a / n) * (W - I - D);
  const y = (v) => H - B - (v / (max || 1)) * (H - A - B);
  const linea = (campo) => filas.map((f, k) => `${k ? 'L' : 'M'}${x(f.a).toFixed(1)},${y(f[campo]).toFixed(1)}`).join('');
  const banda = `${filas.map((f, k) => `${k ? 'L' : 'M'}${x(f.a)},${y(f[tasas[tasas.length - 1]])}`).join('')}${[...filas].reverse().map((f) => `L${x(f.a)},${y(f[tasas[0]])}`).join('')}Z`;
  const rejilla = ejeY(0, max).map((v) => `<line x1="${I}" x2="${W - D}" y1="${y(v)}" y2="${y(v)}" class="g-rejilla"/>
    <text x="${I - 6}" y="${y(v) + 4}" class="g-texto" text-anchor="end">${eurCorto(v)}</text>`).join('');
  const marcas = filas.filter((f) => f.a % 5 === 0).map((f) => `<text x="${x(f.a)}" y="${H - 10}" class="g-texto" text-anchor="middle">${f.a === 0 ? 'hoy' : '+' + f.a + ' a'}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img">${rejilla}<path d="${banda}" class="p-banda"/>
    <path d="${linea('aportado')}" class="p-aportado"/>
    ${tasas.map((t, k) => `<path d="${linea(t)}" class="p-${k}"/>`).join('')}${marcas}</svg>
    <div class="leyenda"><span class="ley p-aportado-ley">Solo lo aportado</span>
    ${tasas.map((t, k) => `<span class="ley p-${k}-ley">${(t * 100).toLocaleString('es-ES')} % anual</span>`).join('')}</div>`;
}
