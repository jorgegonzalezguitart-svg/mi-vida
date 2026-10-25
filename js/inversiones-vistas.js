// Pestañas avanzadas de Inversiones: Resumen, Fiscal y Noticias.
// Reciben "ctx" con el estado y las utilidades de app.js (así no hay importaciones circulares).
import * as F from './fiscal.js';
import * as G from './graficos.js';
import { regionDe, PALABRAS_NOTICIAS, LECTURAS_IA, IDEAS_IA } from './datos.js';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const porc = (n) => `${(Number(n) || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
const AÑO = 365.25 * 86400000;
const leerLS = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

// ---------- Datos comunes ----------
function preparar(ctx) {
  const { num, valorEur } = ctx;
  const precioEur = (p) => (num(p.participaciones) ? valorEur(p) / num(p.participaciones) : 0);
  const clave = (p) => p.isin || `X-${p.id}`;
  const lotesDe = (p) => {
    if (Array.isArray(p.lotes) && p.lotes.length) return p.lotes;
    if (num(p.invertido) && num(p.participaciones)) {
      return [{ tipo: 'compra', f: p.fechaCompra || p.historial?.[0]?.f || hoyISO(), part: num(p.participaciones), coste: num(p.invertido), estimado: !p.fechaCompra }];
    }
    return [];
  };
  const costeDe = (p) => p.costeFiscal ?? lotesDe(p).reduce((s, l) => s + l.coste, 0);
  const posiciones = ctx.estado.inversiones.map((p) => ({ ...p, isin: clave(p), lotes: lotesDe(p) }));
  const precios = {};
  for (const p of ctx.estado.inversiones) precios[clave(p)] = precioEur(p);
  return { precioEur, clave, lotesDe, costeDe, posiciones, precios };
}

// ============================================================
//  RESUMEN CORTO PARA INICIO (devuelve HTML)
// ============================================================
export function resumenInicio(ctx) {
  const { estado, esc, euros, pct, fecha } = ctx;
  const lista = estado.inversiones;
  if (!lista.length) return '';
  const d = preparar(ctx);
  const valor = lista.reduce((s, p) => s + ctx.valorEur(p), 0);
  const coste = lista.reduce((s, p) => s + d.costeDe(p), 0);
  const gan = valor - coste;
  const lotes = lista.flatMap((p) => d.lotesDe(p)).sort((a, b) => a.f.localeCompare(b.f));
  const hoy = hoyISO();
  const tirAnual = F.tir(lotes.map((l) => ({ f: l.f, importe: -l.coste })).concat({ f: hoy, importe: valor }));
  const mes = hoy.slice(0, 7);
  const aportMes = lotes.filter((l) => l.f.startsWith(mes)).reduce((s, l) => s + l.coste, 0);
  const objetivo = Number(leerLS('mv-dca', 800)) || 800;

  // Cambio respecto a hace ~30 días, con el histórico que guarda la app
  const serie = ctx.serieTotal(lista);
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const antes = [...serie].reverse().find((x) => x.f <= hace30);
  const cambio30 = antes ? valor - antes.v : null;

  // Reparto por entidad y por tipo
  const sumar = (clave) => {
    const m = {};
    for (const p of lista) { const k = clave(p); m[k] = (m[k] || 0) + ctx.valorEur(p); }
    return Object.entries(m).map(([nombre, v]) => ({ nombre, v })).sort((a, b) => b.v - a.v);
  };
  const entidades = sumar((p) => p.entidad || 'Otras');
  const tipos = sumar((p) => (p.tipo === 'cripto' ? 'Cripto' : p.tipo === 'fondo' ? 'Fondos indexados' : 'Otros'));
  const fechaPrecios = lista.map((p) => p.precioFecha).filter(Boolean).sort().pop();
  const filaReparto = (x) => `<li><span>${esc(x.nombre)}</span><small>${euros(x.v)} · ${porc(valor ? (x.v / valor) * 100 : 0)}</small>
    <div class="barra"><span style="width:${valor ? Math.max(2, (x.v / valor) * 100) : 0}%"></span></div></li>`;
  const kpi = (t, v, sub = '', clase = '') => `<div class="kpi"><span>${t}</span><b class="${clase}">${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const signo = (n) => (n >= 0 ? '+' : '');

  return `<section class="tarjeta resumen-inv inicio-inv">
    <h2>📈 Tu dinero invertido</h2>
    <p class="grande">${euros(valor)}</p>
    <p class="${gan >= 0 ? 'sube' : 'baja'}"><b>${signo(gan)}${euros(gan)}</b> (${pct(coste ? (gan / coste) * 100 : 0)}) sobre ${euros(coste)} aportados</p>
    <section class="kpis compactos">
      ${kpi('Rentabilidad anual (TIR)', tirAnual == null ? '—' : pct(tirAnual * 100), '', tirAnual >= 0 ? 'sube' : 'baja')}
      ${kpi('Últimos 30 días', cambio30 == null ? '—' : `${signo(cambio30)}${euros(cambio30)}`, cambio30 == null ? 'aún sin histórico' : '', cambio30 >= 0 ? 'sube' : 'baja')}
      ${kpi('Aportado este mes', euros(aportMes), `objetivo ${euros(objetivo)}`, aportMes >= objetivo * 0.95 ? 'sube' : '')}
      ${kpi('Posiciones', String(lista.length), fechaPrecios ? `precios del ${fecha(fechaPrecios)}` : '')}
    </section>
    ${serie.length >= 2 ? G.lineasTiempo([{ nombre: 'Valor', clase: 'l-val', puntos: serie.map((x) => ({ f: x.f, v: x.v })), puntoFinal: true }], { alto: 220, desdeCero: false, formato: (v) => `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k€` }) : ''}
    <h3>Por entidad</h3><ul class="mini reparto">${entidades.map(filaReparto).join('')}</ul>
    <h3>Por tipo</h3><ul class="mini reparto">${tipos.map(filaReparto).join('')}</ul>
    <a class="btn primario" href="#inversiones">Ver todo el detalle</a>
  </section>`;
}

// ============================================================
//  RESUMEN
// ============================================================
export function resumen(ctx, caja) {
  const { estado, esc, euros, pct, fecha } = ctx;
  const lista = estado.inversiones;
  if (!lista.length) {
    caja.innerHTML = '<p class="vacio">Aún no hay inversiones. Impórtalas desde Ajustes o pulsa «＋ Añadir».</p>';
    return;
  }
  const d = preparar(ctx);
  const valor = lista.reduce((s, p) => s + ctx.valorEur(p), 0);
  const coste = lista.reduce((s, p) => s + d.costeDe(p), 0);
  const gan = valor - coste;
  const lotes = lista.flatMap((p) => d.lotesDe(p).map((l) => ({ ...l, p }))).sort((a, b) => a.f.localeCompare(b.f));
  const hoy = hoyISO();
  const flujos = lotes.map((l) => ({ f: l.f, importe: -l.coste })).concat({ f: hoy, importe: valor });
  const tirAnual = F.tir(flujos);
  const anios = lotes.length ? (Date.now() - new Date(lotes[0].f).getTime()) / AÑO : 0;
  const hace12 = new Date(Date.now() - AÑO).toISOString().slice(0, 10);
  const aport12 = lotes.filter((l) => l.f >= hace12).reduce((s, l) => s + l.coste, 0);

  // 1) Aportado acumulado y valor real
  let acum = 0;
  const aportado = lotes.map((l) => ({ f: l.f, v: (acum += l.coste) }));
  if (aportado.length) aportado.push({ f: hoy, v: acum });
  const valorReal = ctx.serieTotal(lista).map((x) => ({ f: x.f, v: x.v }));
  if (!valorReal.length || valorReal[valorReal.length - 1].f !== hoy) valorReal.push({ f: hoy, v: valor });

  // 2) Rentabilidad por año de compra
  const porAnio = {};
  for (const l of lotes) {
    const a = l.f.slice(0, 4);
    const x = (porAnio[a] ||= { coste: 0, valor: 0 });
    x.coste += l.coste;
    x.valor += l.part * d.precioEur(l.p);
  }
  const cohortes = Object.entries(porAnio).sort().map(([a, x]) => ({
    etiqueta: a, v: x.coste ? ((x.valor - x.coste) / x.coste) * 100 : 0,
    nota: `${euros(x.coste)} → ${euros(x.valor)} (${pct(x.coste ? ((x.valor - x.coste) / x.coste) * 100 : 0)})`,
  }));

  // 3) Aportaciones mensuales (24 meses) y constancia del DCA (12 meses)
  const mensual = Number(leerLS('mv-dca', 800)) || 800;
  const meses = [];
  for (let k = 23; k >= 0; k--) {
    const dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - k);
    meses.push(dt.toISOString().slice(0, 7));
  }
  const porMes = Object.fromEntries(meses.map((m) => [m, 0]));
  for (const l of lotes) if (l.f.slice(0, 7) in porMes) porMes[l.f.slice(0, 7)] += l.coste;
  const barrasMes = meses.map((m) => ({ etiqueta: m.slice(5) + '/' + m.slice(2, 4), v: porMes[m], clase: porMes[m] >= mensual * 0.95 ? 'b-sube' : 'b-media', nota: euros(porMes[m]) }));
  const ultimos12 = meses.slice(-12);
  const cumplidos = ultimos12.filter((m) => porMes[m] >= mensual * 0.95).length;

  // 4) Reparto
  const porRegion = {};
  for (const p of lista) porRegion[regionDe(p)] = (porRegion[regionDe(p)] || 0) + ctx.valorEur(p);
  const regiones = Object.entries(porRegion).map(([nombre, v]) => ({ nombre, v })).sort((a, b) => b.v - a.v);
  const porFondo = {};
  for (const p of lista) {
    const n = (p.nombre || '').replace(/\s*(Index Fund|Stock Index Fund|Investor|Acc|EUR|clase S|\(IE\)|P-Acc-EUR|P-Acc-USD|Accumulation)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    porFondo[n] = (porFondo[n] || 0) + ctx.valorEur(p);
  }
  const fondos = Object.entries(porFondo).map(([nombre, v]) => ({ nombre, v })).sort((a, b) => b.v - a.v);

  // 5) Caídas (con el histórico que va guardando la app)
  let maximo = 0; let peor = 0;
  for (const p of valorReal) { maximo = Math.max(maximo, p.v); if (maximo) peor = Math.min(peor, (p.v - maximo) / maximo); }

  const anioProy = Number(leerLS('mv-proy-anios', 25)) || 25;
  const kpi = (t, v, sub = '', clase = '') => `<div class="kpi"><span>${t}</span><b class="${clase}">${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

  caja.innerHTML = `
    <section class="kpis">
      ${kpi('Valor total', euros(valor))}
      ${kpi('Aportado (coste fiscal)', euros(coste))}
      ${kpi('Ganancia', `${gan >= 0 ? '+' : ''}${euros(gan)}`, pct(coste ? (gan / coste) * 100 : 0), gan >= 0 ? 'sube' : 'baja')}
      ${kpi('Rentabilidad anual (TIR)', tirAnual == null ? '—' : pct(tirAnual * 100), 'tiene en cuenta cuándo metiste cada euro', tirAnual >= 0 ? 'sube' : 'baja')}
      ${kpi('Invirtiendo desde', lotes.length ? fecha(lotes[0].f) : '—', `${anios.toLocaleString('es-ES', { maximumFractionDigits: 1 })} años`)}
      ${kpi('Aportado últimos 12 meses', euros(aport12), `media ${euros(aport12 / 12)}/mes`)}
    </section>

    <section class="tarjeta"><h2>💶 Tu dinero en el tiempo</h2>
      <p class="ayuda">Lo que has ido aportando frente a lo que vale. El hueco entre las dos líneas es lo que ha trabajado tu dinero.
      La línea de valor se completa a diario desde que usas la app.</p>
      ${G.lineasTiempo([
        { nombre: 'Aportado', clase: 'l-aport', puntos: aportado, escalonada: true, area: true },
        { nombre: 'Valor', clase: 'l-val', puntos: valorReal, puntoFinal: true },
      ])}
    </section>

    <section class="tarjeta"><h2>🌱 Cuánto ha crecido cada año de aportaciones</h2>
      <p class="ayuda">Lo que metiste cada año, cuánto ha subido hasta hoy. Los años antiguos suelen haber crecido más: es el interés compuesto.</p>
      ${G.barras(cohortes, { formato: (v) => `${Math.round(v)} %` })}
      <ul class="mini">${cohortes.map((c) => `<li><span>${esc(c.etiqueta)}</span><small>${esc(c.nota)}</small></li>`).join('')}</ul>
    </section>

    <section class="tarjeta"><h2>📅 Constancia del DCA</h2>
      <p class="ayuda">Aportación objetivo: <b>${euros(mensual)}/mes</b>
        <button class="btn texto peq" id="cambiar-dca">Cambiar</button></p>
      <div class="meses">${ultimos12.map((m) => `<span class="${porMes[m] >= mensual * 0.95 ? 'ok' : porMes[m] > 0 ? 'medio' : ''}" title="${m}: ${euros(porMes[m])}">${m.slice(5)}</span>`).join('')}</div>
      <p class="ayuda">${cumplidos} de 12 meses con la aportación completa. ${cumplidos >= 10 ? '¡Muy constante! 💪' : 'La constancia es lo que más rinde en un DCA.'}</p>
      <h3>Aportaciones de los últimos 24 meses</h3>
      ${G.barras(barrasMes, { linea: mensual, lineaTexto: `objetivo ${G.eurCorto(mensual)}` })}
    </section>

    <section class="tarjeta"><h2>🌍 Reparto de tu cartera</h2>
      <div class="dos-graf"><div><h3>Por región</h3>${G.donut(regiones)}</div><div><h3>Por fondo</h3>${G.donut(fondos)}</div></div>
      <p class="ayuda">Aproximado según el nombre de cada fondo. El "Mundo desarrollado" ya lleva dentro alrededor de un 70 % de EE. UU.</p>
    </section>

    <section class="tarjeta"><h2>🔭 Proyección a futuro</h2>
      <p class="ayuda">Con lo que tienes hoy y ${euros(mensual)}/mes, a distintas rentabilidades medias anuales.
      <b>No es una predicción</b>: son escenarios para ver el efecto del tiempo y la constancia.</p>
      <label class="en-linea">Años: <input type="range" id="proy-anios" min="5" max="40" step="1" value="${anioProy}"> <b id="proy-n">${anioProy}</b></label>
      <div id="proy"></div>
    </section>

    <section class="tarjeta"><h2>📉 Evolución y caídas</h2>
      ${valorReal.length >= 3
        ? `${G.lineasTiempo([{ nombre: 'Valor de la cartera', clase: 'l-val', puntos: valorReal, area: true }], { desdeCero: false })}
           <p class="ayuda">Mayor caída desde un máximo registrada: <b class="${peor < 0 ? 'baja' : ''}">${pct(peor * 100)}</b>.
           Las caídas son normales en bolsa; en un DCA son meses en los que compras más barato.</p>`
        : '<p class="ayuda">Este gráfico se irá dibujando día a día: la app guarda el valor de tu cartera cada vez que actualiza precios.</p>'}
    </section>
    <p class="ayuda centro-texto">Solo para llevar el control. No es asesoramiento financiero.</p>`;

  const pintarProy = () => {
    const n = Number(caja.querySelector('#proy-anios').value);
    caja.querySelector('#proy-n').textContent = n;
    guardarLS('mv-proy-anios', n);
    const tasas = [0.04, 0.06, 0.08];
    const filas = G.proyeccion(valor, mensual, n, tasas);
    const hitos = [5, 10, 15, 20, 25, 30, 35, 40].filter((a) => a <= n);
    caja.querySelector('#proy').innerHTML = `${G.abanico(filas, tasas)}
      <div class="tabla-scroll"><table class="tabla"><thead><tr><th>En</th><th>Aportado</th>${tasas.map((t) => `<th>${t * 100} %</th>`).join('')}</tr></thead>
      <tbody>${hitos.map((a) => `<tr><td>${a} años</td><td>${G.eurCorto(filas[a].aportado)}</td>${tasas.map((t) => `<td>${G.eurCorto(filas[a][t])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  caja.querySelector('#proy-anios').oninput = pintarProy;
  pintarProy();
  caja.querySelector('#cambiar-dca').onclick = () => {
    const v = prompt('¿Cuánto aportas al mes en total (€)?', String(mensual));
    if (v != null && ctx.num(v) > 0) { guardarLS('mv-dca', ctx.num(v)); resumen(ctx, caja); }
  };
}

// ============================================================
//  FISCAL
// ============================================================
const memoriaFiscal = { importes: {}, objetivo: '' };

function fuentesDe(ctx, d) {
  const gestionada = (p) => /cartera/i.test(p.cuenta || '');
  const fuentes = [];
  const carteras = {};
  for (const p of ctx.estado.inversiones) {
    const comp = { isin: d.clave(p), nombre: p.nombre, valor: ctx.valorEur(p) };
    if (gestionada(p)) {
      const id = `cartera:${p.entidad}:${p.cuenta}`;
      (carteras[id] ||= { id, nombre: `${p.cuenta} (${p.entidad})`, componentes: [], gestionada: true }).componentes.push(comp);
    } else {
      fuentes.push({ id: p.id, nombre: p.nombre, entidad: p.entidad, componentes: [comp] });
    }
  }
  return fuentes.concat(Object.values(carteras)).filter((f) => f.componentes.some((c) => c.valor > 0));
}

export function fiscal(ctx, caja) {
  const { estado, esc, euros, pct, num } = ctx;
  if (!estado.inversiones.length) {
    caja.innerHTML = '<p class="vacio">Aún no hay inversiones.</p>';
    return;
  }
  const d = preparar(ctx);
  const fuentes = fuentesDe(ctx, d);
  const anio = new Date().getFullYear();
  const yaKey = `mv-ya-realizada-${anio}`;
  const realizadosApp = estado.inversiones.flatMap((p) => p.realizados || []).reduce((s, x) => s + x.resultado, 0);
  const recientes = new Set(d.posiciones.filter((p) => p.lotes.some((l) => Date.now() - new Date(l.f).getTime() < 62 * 86400000)).map((p) => p.isin));
  const dcaIsins = [...recientes];

  // Plusvalía latente total
  const lotesIsin = F.lotesPorIsin(d.posiciones);
  let latente = 0; let costeTot = 0; let valorTot = 0;
  const latentePorFuente = {};
  for (const [isin, lista] of lotesIsin) {
    const part = lista.reduce((s, l) => s + l.part, 0);
    const { trozos } = F.venderFifo(lista, part, d.precios[isin]);
    latente += trozos.reduce((s, t) => s + t.ganancia, 0);
    costeTot += trozos.reduce((s, t) => s + t.coste, 0);
    valorTot += trozos.reduce((s, t) => s + t.valor, 0);
  }
  for (const f of fuentes) {
    const sim = F.simular(f.componentes.map((c) => ({ isin: c.isin, nombre: c.nombre, importe: c.valor })), d.posiciones, d.precios, {});
    latentePorFuente[f.id] = sim.ganancia / (sim.bruto || 1);
  }
  const ya0 = Number(leerLS(yaKey, 0)) || 0;
  const todoHoy = F.impuestoAhorro(latente + ya0).total - F.impuestoAhorro(ya0).total;

  caja.innerHTML = `
    <section class="tarjeta resumen-inv">
      <p class="ayuda">Plusvalía latente (lo que ganarías si vendieras todo hoy)</p>
      <p class="grande ${latente >= 0 ? 'sube' : 'baja'}">${latente >= 0 ? '+' : ''}${euros(latente)}</p>
      <p class="ayuda">Valor ${euros(valorTot)} · coste fiscal ${euros(costeTot)} · si lo vendieras todo pagarías unos <b>${euros(todoHoy)}</b>.</p>
    </section>

    <section class="tarjeta">
      <h2>🗓️ Ganancias ya realizadas en ${anio}</h2>
      <p class="ayuda">Ventas que ya hiciste este año: se suman a lo que simules (los tramos son por año).</p>
      <label>Ganancia neta ya realizada en ${anio} (€)<input id="ya" inputmode="decimal" value="${ya0 || ''}" placeholder="0"></label>
      ${realizadosApp ? `<p class="ayuda">Tu banco muestra <b>${euros(realizadosApp)}</b> de plusvalías en lotes ya vendidos, sin fecha de venta.
        Si fueron en ${anio}, <button class="btn texto peq" id="usar-myi">úsalas</button>.</p>` : ''}
    </section>

    <section class="tarjeta destacado">
      <h2>✨ Optimización fiscal</h2>
      <p class="ayuda">Dime cuánto quieres recibir <b>limpio</b> y busco qué vender para pagar lo mínimo, respetando FIFO.</p>
      <div class="con-boton"><input id="objetivo" inputmode="decimal" placeholder="Ej: 10.000" value="${esc(memoriaFiscal.objetivo)}">
        <button class="btn primario" id="optimizar">Optimizar</button></div>
      <button class="btn texto" id="max19">¿Cuánto puedo sacar este año pagando solo el 19 %?</button>
      <div id="opt-res"></div>
    </section>

    <section class="tarjeta">
      <h2>🧮 Simulador de retirada</h2>
      <p class="ayuda">Elige cuánto sacar de cada sitio (en €, valor de hoy). Los fondos tienen un precio al día.</p>
      <ul class="lista-venta">${fuentes.map((f) => {
        const total = f.componentes.reduce((s, c) => s + c.valor, 0);
        const g = latentePorFuente[f.id] || 0;
        return `<li>
          <div class="lv-info"><b>${esc(f.nombre)}</b>
            <small>${euros(total)} · ${g >= 0 ? 'plusvalía' : 'minusvalía'} ${pct(g * 100)} de lo que vendas${f.gestionada ? ' · cartera gestionada: se vende en proporción' : ''}</small></div>
          <div class="lv-campo"><input inputmode="decimal" data-fuente="${esc(f.id)}" placeholder="0 €" value="${memoriaFiscal.importes[f.id] ? String(memoriaFiscal.importes[f.id]).replace('.', ',') : ''}">
            <button class="btn texto peq" data-todo="${esc(f.id)}">Todo</button></div></li>`;
      }).join('')}</ul>
      <button class="btn texto peq" id="limpiar">Poner todo a 0</button>
    </section>

    <section class="tarjeta" id="sim-res"></section>

    <section class="tarjeta">
      <h2>💡 Claves para pagar menos (legalmente)</h2>
      <ul class="consejos">
        <li><b>Traspasos sin impuestos:</b> mover dinero de un fondo a otro no tributa. Solo pagas cuando el dinero sale a tu cuenta.</li>
        <li><b>Reparte las retiradas entre años:</b> los primeros 6.000 € de ganancia de cada año van al 19 %.</li>
        <li><b>FIFO por fondo:</b> siempre se venden primero las participaciones más antiguas de ese fondo, aunque estén en otra cuenta o en la cartera gestionada.</li>
        <li><b>Compensa pérdidas:</b> las minusvalías restan de las ganancias del mismo año (y de los 4 siguientes).</li>
        <li><b>Regla de los 2 meses:</b> si vendes con pérdidas un fondo que compras cada mes (tu DCA), esa pérdida no se puede usar hasta que vendas también lo comprado.</li>
        <li><b>El coste fiscal viene de tus lotes reales</b> (incluidos los traspasos desde otras entidades), no del "invertido" que muestra la app del banco.</li>
      </ul>
      <p class="ayuda">Simulación con los tramos del ahorro de ${anio} (19-30 %). No es asesoramiento fiscal: antes de una venta grande, confírmalo con un gestor o con el simulador de la Agencia Tributaria.</p>
    </section>`;

  const res = caja.querySelector('#sim-res');
  let ultimo = null;

  const ventasDesdeInputs = () => {
    const ventas = [];
    for (const f of fuentes) {
      const imp = Math.min(memoriaFiscal.importes[f.id] || 0, f.componentes.reduce((s, c) => s + c.valor, 0));
      if (imp > 0) ventas.push(...F.repartirFuente(f, imp));
    }
    const m = new Map();
    for (const v of ventas) { const x = m.get(v.isin) || { ...v, importe: 0 }; x.importe += v.importe; m.set(v.isin, x); }
    return [...m.values()];
  };

  const recalcular = () => {
    const ya = num(caja.querySelector('#ya').value);
    guardarLS(yaKey, ya);
    const ventas = ventasDesdeInputs();
    if (!ventas.length) {
      res.innerHTML = '<h2>📋 Resultado</h2><p class="ayuda">Pon un importe en algún fondo, o usa «Optimizar».</p>';
      ultimo = null;
      return;
    }
    const s = F.simular(ventas, d.posiciones, d.precios, { yaRealizada: ya, dcaIsins });
    ultimo = s;
    const avisos = [];
    if (s.porIsin.some((x) => x.regla2Meses)) avisos.push(`⚠️ <b>Regla de los 2 meses:</b> parte de lo que vendes tiene pérdidas y has comprado ese fondo hace menos de 2 meses (o lo compras cada mes). Hacienda no te deja restar esa pérdida (${euros(-s.perdidaBloqueada)}) este año.`);
    const compartidos = s.porIsin.filter((x) => new Set(x.trozos.map((t) => t.cuenta)).size > 1 || (lotesIsin.get(x.isin) || []).some((l) => l.cuenta !== (lotesIsin.get(x.isin) || [])[0]?.cuenta));
    if (compartidos.length) avisos.push(`ℹ️ ${compartidos.map((x) => esc(x.nombre)).join(', ')}: lo tienes en más de una cuenta. Para Hacienda el FIFO se aplica al fondo entero, así que se venden primero los lotes más antiguos de cualquiera de ellas.`);
    if (s.porIsin.some((x) => x.trozos.some((t) => t.estimado))) avisos.push('ℹ️ Alguna posición no tiene sus lotes reales (por ejemplo el Bitcoin): se usa el total invertido como un solo lote.');
    res.innerHTML = `
      <h2>📋 Resultado</h2>
      <div class="kpis compactos">
        <div class="kpi"><span>Sacas (bruto)</span><b>${euros(s.bruto)}</b></div>
        <div class="kpi"><span>Ganancia</span><b class="${s.ganancia >= 0 ? 'sube' : 'baja'}">${euros(s.ganancia)}</b></div>
        <div class="kpi"><span>Impuesto</span><b class="baja">${euros(s.impuesto)}</b><small>${porc(s.tipoEfectivo * 100)} de la ganancia</small></div>
        <div class="kpi"><span>Te queda limpio</span><b class="sube">${euros(s.neto)}</b><small>pagas el ${porc((s.impuesto / s.bruto) * 100)} de lo que sacas</small></div>
      </div>
      ${avisos.map((a) => `<p class="aviso-fiscal">${a}</p>`).join('')}
      <h3>Por tramos (ganancia total del año: ${euros(s.totalAnio)})</h3>
      <div class="tabla-scroll"><table class="tabla"><thead><tr><th>Tramo</th><th>Base</th><th>Tipo</th><th>Cuota</th></tr></thead><tbody>
        ${s.tramos.map((t) => `<tr><td>${G.eurCorto(t.desde)} – ${t.hasta === Infinity ? '∞' : G.eurCorto(t.hasta)}</td><td>${euros(t.base)}</td><td>${Math.round(t.tipo * 100)} %</td><td>${euros(t.cuota)}</td></tr>`).join('')}
      </tbody></table></div>
      ${s.yaRealizada ? `<p class="ayuda">Los primeros ${euros(s.yaRealizada)} de la tabla son lo que ya habías ganado este año; por esta venta pagas solo la diferencia: <b>${euros(s.impuesto)}</b>.</p>` : ''}
      <h3>Lotes vendidos (FIFO)</h3>
      ${s.porIsin.map((x) => `<details><summary><b>${esc(x.nombre)}</b> · ${euros(x.importe)} · ${x.part.toLocaleString('es-ES', { maximumFractionDigits: 4 })} part. a ${x.precio.toLocaleString('es-ES', { maximumFractionDigits: 4 })} € · <span class="${x.ganancia >= 0 ? 'sube' : 'baja'}">${euros(x.ganancia)}</span></summary>
        <div class="tabla-scroll"><table class="tabla"><thead><tr><th>Comprado</th><th>Part.</th><th>Coste</th><th>Valor</th><th>Ganancia</th></tr></thead><tbody>
        ${x.trozos.map((t) => `<tr><td>${ctx.fecha(t.f)}${t.tipo === 'traspaso' ? ' <small>(traspaso)</small>' : ''}</td><td>${t.part.toLocaleString('es-ES', { maximumFractionDigits: 4 })}</td><td>${euros(t.coste)}</td><td>${euros(t.valor)}</td><td class="${t.ganancia >= 0 ? 'sube' : 'baja'}">${euros(t.ganancia)} <small>(${pct(t.pct * 100)})</small></td></tr>`).join('')}
        </tbody></table></div></details>`).join('')}
      <button class="btn primario ancho" id="pdf">📄 Descargar PDF con el desglose FIFO</button>`;
    res.querySelector('#pdf').onclick = (ev) => ctx.ocupado(ev.target, 'Preparando PDF…', () => generarPDF(ctx, ultimo));
  };

  caja.querySelectorAll('[data-fuente]').forEach((inp) => {
    inp.oninput = () => { memoriaFiscal.importes[inp.dataset.fuente] = num(inp.value); recalcular(); };
  });
  caja.querySelectorAll('[data-todo]').forEach((b) => {
    b.onclick = () => {
      const f = fuentes.find((x) => x.id === b.dataset.todo);
      const total = Math.floor(f.componentes.reduce((s, c) => s + c.valor, 0) * 100) / 100;
      memoriaFiscal.importes[f.id] = total;
      caja.querySelector(`[data-fuente="${CSS.escape(f.id)}"]`).value = String(total).replace('.', ',');
      recalcular();
    };
  });
  caja.querySelector('#limpiar').onclick = () => {
    memoriaFiscal.importes = {};
    caja.querySelectorAll('[data-fuente]').forEach((i) => { i.value = ''; });
    recalcular();
  };
  caja.querySelector('#ya').oninput = recalcular;
  caja.querySelector('#usar-myi')?.addEventListener('click', () => {
    caja.querySelector('#ya').value = String(Math.round(realizadosApp * 100) / 100).replace('.', ',');
    recalcular();
  });

  const optRes = caja.querySelector('#opt-res');
  caja.querySelector('#optimizar').onclick = (ev) => {
    const objetivo = num(caja.querySelector('#objetivo').value);
    memoriaFiscal.objetivo = caja.querySelector('#objetivo').value;
    if (!(objetivo > 0)) { optRes.innerHTML = '<p class="error">Escribe cuánto quieres recibir.</p>'; return; }
    ctx.ocupado(ev.target, 'Calculando…', async () => {
      await new Promise((r) => setTimeout(r, 30));
      const ya = num(caja.querySelector('#ya').value);
      const total = fuentes.reduce((s, f) => s + f.componentes.reduce((a, c) => a + c.valor, 0), 0);
      const paso = Math.max(25, Math.min(500, objetivo / 80));
      const o = F.optimizar(objetivo, fuentes, d.posiciones, d.precios, { modo: 'neto', paso, yaRealizada: ya, dcaIsins });
      // Comparación: vender de todo en proporción
      const prop = F.optimizar(objetivo, [{ id: 'todo', nombre: 'todo', componentes: fuentes.flatMap((f) => f.componentes) }], d.posiciones, d.precios, { modo: 'neto', paso, yaRealizada: ya, dcaIsins });
      memoriaFiscal.importes = Object.fromEntries(o.asignacion.map((a) => [a.id, a.importe]));
      caja.querySelectorAll('[data-fuente]').forEach((i) => {
        const v = memoriaFiscal.importes[i.dataset.fuente];
        i.value = v ? String(v).replace('.', ',') : '';
      });
      const ahorro = prop.resultado.impuesto - o.resultado.impuesto;
      optRes.innerHTML = `<div class="opt-ok">
        ${o.alcanzado ? '' : `<p class="error">No llega: como mucho podrías sacar unos ${euros(total)} en bruto.</p>`}
        <p><b>Plan óptimo:</b> sacar ${euros(o.resultado.bruto)} y pagar <b>${euros(o.resultado.impuesto)}</b> → recibes ${euros(o.resultado.neto)}.</p>
        <ul>${o.asignacion.map((a) => `<li>${esc(a.nombre)}: <b>${euros(a.importe)}</b></li>`).join('')}</ul>
        ${ahorro > 1 ? `<p class="sube">Te ahorras <b>${euros(ahorro)}</b> frente a vender de todo un poco (${euros(prop.resultado.impuesto)}).</p>` : ''}
        <p class="ayuda">Prioriza los fondos cuyos lotes más antiguos (los que salen primero por FIFO) han subido menos. Abajo tienes el desglose y el PDF.</p></div>`;
      recalcular();
    });
  };
  caja.querySelector('#max19').onclick = (ev) => ctx.ocupado(ev.target, 'Calculando…', async () => {
    await new Promise((r) => setTimeout(r, 30));
    const ya = num(caja.querySelector('#ya').value);
    const m = F.maximoEnTramo(6000, fuentes, d.posiciones, d.precios, { yaRealizada: ya, dcaIsins });
    optRes.innerHTML = m.importe > 0
      ? `<div class="opt-ok"><p>Este año puedes sacar hasta <b>${euros(m.importe)}</b> sin que tu ganancia del año pase de 6.000 € (todo al 19 %),
          vendiendo de: ${m.plan.asignacion.map((a) => `${esc(a.nombre)} (${euros(a.importe)})`).join(', ')}.</p>
          <p class="ayuda">Impuesto: ${euros(m.plan.resultado.impuesto)}. Repetirlo cada año (en enero se "reinicia" el tramo) es una forma sencilla de pagar menos.</p></div>`
      : '<p class="ayuda">Ya has superado los 6.000 € de ganancia este año: cualquier venta irá al 21 % o más.</p>';
  });
  recalcular();
}

// ---------- PDF con el desglose FIFO ----------
let cargaPDF = null;
function cargarScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}
async function librerias() {
  cargaPDF ||= cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    .then(() => cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'));
  await cargaPDF;
  return window.jspdf.jsPDF;
}

async function generarPDF(ctx, s) {
  if (!s) return;
  const JsPDF = await librerias();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const nf = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  const e = (n) => `${nf.format(Number(n) || 0)} EUR`;
  const p = (n) => `${((Number(n) || 0) * 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
  const fe = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const color = [15, 118, 110];
  let y = 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...color);
  doc.text('Simulación fiscal de retirada - método FIFO', 14, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  y += 6; doc.text(`Generado por Mi Vida el ${new Date().toLocaleString('es-ES')}. Precios: último valor liquidativo disponible.`, 14, y);
  y += 4; doc.text('Simulación orientativa. No es asesoramiento fiscal: confírmalo con un gestor o con la Agencia Tributaria.', 14, y);

  doc.autoTable({
    startY: y + 5, theme: 'grid', headStyles: { fillColor: color }, styles: { fontSize: 9 },
    head: [['Concepto', 'Importe']],
    body: [
      ['Importe bruto que retiras (valor de transmisión)', e(s.bruto)],
      ['Coste fiscal de lo vendido (valor de adquisición)', e(s.coste)],
      ['Ganancia patrimonial de esta venta', e(s.ganancia)],
      ...(s.perdidaBloqueada ? [['Pérdida no computable (regla de los 2 meses)', e(-s.perdidaBloqueada)]] : []),
      ['Ganancias ya realizadas este año', e(s.yaRealizada)],
      ['Ganancia total del año (base del ahorro)', e(s.totalAnio)],
      ['IMPUESTO A PAGAR POR ESTA VENTA', e(s.impuesto)],
      ['Te queda limpio', e(s.neto)],
      ['Tipo efectivo sobre la ganancia', p(s.tipoEfectivo)],
    ],
    didParseCell: (h) => {
      if (h.section === 'body' && /^IMPUESTO|^Te queda/.test(String(h.row.raw?.[0] || ''))) h.cell.styles.fontStyle = 'bold';
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30);
  doc.text('1. Cómo funciona el método FIFO', 14, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(40);
  const expl = [
    'FIFO significa "lo primero que entra es lo primero que sale". Cuando vendes participaciones de un fondo, Hacienda (art. 37.2 de la Ley del IRPF) considera que vendes primero las que compraste antes. Se aplica por fondo (mismo ISIN), sumando todas tus cuentas.',
    'Para cada lote vendido: Ganancia = participaciones vendidas x precio de venta - coste de esas participaciones. El coste incluye lo que pagaste en origen: si el lote llegó por traspaso, conserva la fecha y el coste de la compra original (los traspasos entre fondos no tributan).',
    'Las ganancias de todos los lotes se suman con las del resto del año y tributan en la base del ahorro, por tramos: 19 % hasta 6.000 EUR, 21 % de 6.000 a 50.000, 23 % de 50.000 a 200.000, 27 % de 200.000 a 300.000 y 30 % a partir de ahí.',
  ];
  for (const t of expl) { const l = doc.splitTextToSize(t, 182); y += 5; doc.text(l, 14, y); y += (l.length - 1) * 4.2; }

  for (const [k, x] of s.porIsin.entries()) {
    y += 8;
    if (y > 250) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30);
    doc.text(`${2 + k}. ${x.nombre}`, 14, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70);
    y += 5;
    doc.text(`ISIN ${x.isin.startsWith('X-') ? '-' : x.isin} · Vendes ${x.part.toLocaleString('es-ES', { maximumFractionDigits: 4 })} participaciones a ${x.precio.toLocaleString('es-ES', { maximumFractionDigits: 4 })} EUR = ${e(x.importe)}`, 14, y);
    doc.autoTable({
      startY: y + 3, theme: 'striped', headStyles: { fillColor: color }, styles: { fontSize: 8, cellPadding: 1.6 },
      head: [['Fecha compra', 'Origen', 'Part. vendidas', 'Precio compra', 'Precio venta', 'Coste', 'Valor venta', 'Ganancia', '%']],
      body: x.trozos.map((t) => [fe(t.f), t.tipo === 'traspaso' ? 'Traspaso' : 'Compra', t.part.toLocaleString('es-ES', { maximumFractionDigits: 4 }),
        t.precioCompra.toLocaleString('es-ES', { maximumFractionDigits: 4 }), t.precioVenta.toLocaleString('es-ES', { maximumFractionDigits: 4 }),
        e(t.coste), e(t.valor), e(t.ganancia), p(t.pct)]),
      foot: [['Total', '', x.part.toLocaleString('es-ES', { maximumFractionDigits: 4 }), '', '', e(x.coste), e(x.importe), e(x.ganancia), p(x.coste ? x.ganancia / x.coste : 0)]],
      footStyles: { fillColor: [230, 240, 238], textColor: 30, fontStyle: 'bold' },
    });
    y = doc.lastAutoTable.finalY;
    const porque = `Por qué: se venden primero los lotes más antiguos (${fe(x.trozos[0].f)}${x.trozos.length > 1 ? ` a ${fe(x.trozos[x.trozos.length - 1].f)}` : ''}). Su coste era ${e(x.coste)} y hoy valen ${e(x.importe)}, así que ganas ${e(x.ganancia)} (${p(x.coste ? x.ganancia / x.coste : 0)}).${x.regla2Meses ? ' Hay pérdidas en lotes de un fondo comprado en los últimos 2 meses: no se pueden restar este año.' : ''}`;
    const l = doc.splitTextToSize(porque, 182);
    y += 5; doc.setFontSize(8.5); doc.setTextColor(60); doc.text(l, 14, y); y += (l.length - 1) * 3.8;
  }

  y += 8;
  if (y > 230) { doc.addPage(); y = 18; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30);
  doc.text(`${2 + s.porIsin.length}. Cálculo del impuesto por tramos`, 14, y);
  doc.autoTable({
    startY: y + 3, theme: 'grid', headStyles: { fillColor: color }, styles: { fontSize: 9 },
    head: [['Tramo de la base del ahorro', 'Base en el tramo', 'Tipo', 'Cuota']],
    body: s.tramos.map((t) => [`${e(t.desde)} - ${t.hasta === Infinity ? 'en adelante' : e(t.hasta)}`, e(t.base), `${Math.round(t.tipo * 100)} %`, e(t.cuota)]),
  });
  y = doc.lastAutoTable.finalY + 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(40);
  const final = `Tu ganancia total del año sería ${e(s.totalAnio)}. Aplicando los tramos sale una cuota de ${e(s.tramos.reduce((a, t) => a + t.cuota, 0))}${s.yaRealizada ? `, de la que ${e(s.tramos.reduce((a, t) => a + t.cuota, 0) - s.impuesto)} corresponde a lo que ya habías ganado antes` : ''}. Por esta venta pagas ${e(s.impuesto)}, un ${p(s.tipoEfectivo)} de la ganancia y un ${p(s.bruto ? s.impuesto / s.bruto : 0)} del dinero que retiras. Recuerda que el banco te retendrá un 19 % de la ganancia al vender; la diferencia se ajusta en la declaración de la renta.`;
  const lf = doc.splitTextToSize(final, 182); doc.text(lf, 14, y);

  const n = doc.getNumberOfPages();
  for (let k = 1; k <= n; k++) { doc.setPage(k); doc.setFontSize(8); doc.setTextColor(150); doc.text(`Mi Vida · página ${k} de ${n}`, 196, 290, { align: 'right' }); }
  doc.save(`simulacion-fiscal-FIFO-${hoyISO()}.pdf`);
  ctx.aviso('PDF descargado 📄');
}

// ============================================================
//  NOTICIAS
// ============================================================
export async function noticias(ctx, caja) {
  const { esc } = ctx;
  const filtro = leerLS('mv-noticias-filtro', 'parati');
  caja.innerHTML = `<p class="tarjeta aviso-calma">🧘 <b>Lee para aprender, no para operar.</b> Tu estrategia (DCA mensual e indexación) funciona precisamente porque no reacciona a las noticias.</p>
    <div class="chips"><a class="chip ${filtro === 'parati' ? 'activo' : ''}" data-f="parati">Para ti</a><a class="chip ${filtro === 'todas' ? 'activo' : ''}" data-f="todas">Todas</a></div>
    <ul class="lista noticias" id="noticias"><li class="cargando">Buscando titulares…</li></ul>
    <section class="tarjeta"><h2>🤖 Lecturas: IA e inversión</h2>
      <ul class="lecturas">${LECTURAS_IA.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(l.titulo)}</b></a>
        <small>${esc(l.fuente)} · ${esc(l.idioma)}</small><p>${esc(l.resumen)}</p></li>`).join('')}</ul>
      <h3>Cómo usar la IA en una estrategia pasiva</h3>
      <ul class="consejos">${IDEAS_IA.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </section>`;
  caja.querySelectorAll('[data-f]').forEach((a) => { a.onclick = () => { guardarLS('mv-noticias-filtro', a.dataset.f); noticias(ctx, caja); }; });

  let lista = null;
  try {
    const cache = JSON.parse(sessionStorage.getItem('mv-noticias') || 'null');
    if (cache && Date.now() - cache.t < 30 * 60000) lista = cache.lista;
  } catch { /* nada */ }
  const ul = caja.querySelector('#noticias');
  if (!lista) {
    const { data, error } = await ctx.sb.functions.invoke('mivida-precios', { body: { accion: 'noticias' } });
    if (error || !data?.noticias) {
      ul.innerHTML = '<li class="vacio">No se pudieron cargar las noticias. Hace falta instalar (o actualizar) la función <code>mivida-precios</code> en Supabase.</li>';
      return;
    }
    lista = data.noticias;
    try { sessionStorage.setItem('mv-noticias', JSON.stringify({ t: Date.now(), lista })); } catch { /* nada */ }
  }
  const vistos = new Set();
  const puntuadas = lista.filter((n) => { const k = n.titulo.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((n) => {
      const texto = `${n.titulo} ${n.resumen}`.toLowerCase();
      const puntos = PALABRAS_NOTICIAS.reduce((s, [p, w]) => s + (texto.includes(p) ? w : 0), 0);
      return { ...n, puntos };
    });
  const mostrar = (filtro === 'parati' ? puntuadas.filter((n) => n.puntos >= 2).sort((a, b) => b.puntos - a.puntos || (b.fecha || '').localeCompare(a.fecha || '')) : puntuadas).slice(0, 40);
  const hace = (iso) => {
    if (!iso) return '';
    const h = (Date.now() - new Date(iso).getTime()) / 3600000;
    return h < 1 ? 'hace un momento' : h < 24 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} d`;
  };
  ul.innerHTML = mostrar.length ? mostrar.map((n) => `<li class="noticia"><a href="${esc(n.enlace)}" target="_blank" rel="noopener noreferrer">
      <small>${esc(n.fuente)} · ${hace(n.fecha)}${n.puntos >= 4 ? ' · ⭐' : ''}</small>
      <b>${esc(n.titulo)}</b>${n.resumen ? `<span>${esc(n.resumen.slice(0, 160))}${n.resumen.length > 160 ? '…' : ''}</span>` : ''}</a></li>`).join('')
    : '<li class="vacio">Hoy no hay titulares especialmente relevantes para tu estrategia. Mira «Todas».</li>';
}
