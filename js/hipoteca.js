// Hipoteca y patrimonio neto. La hipoteca es un registro cifrado de tipo "hipoteca" (solo una).
// El capital pendiente se recalcula solo cada mes con el sistema francés (cuota fija), partiendo del
// último dato real que se apuntó (pendiente + fecha). Todo es una estimación: el dato bueno es el del banco.
import * as G from './graficos.js';

const porc = (v) => `${(Number(v) || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const n = (v) => Number(v) || 0;

export const hipotecaDe = (estado) => (estado.registros || []).find((r) => r.tipo === 'hipoteca') || null;

// Cuota de un préstamo francés
export function cuotaFrancesa(capital, tinAnual, meses) {
  const r = tinAnual / 100 / 12;
  if (!meses || capital <= 0) return 0;
  return r ? capital * r / (1 - (1 + r) ** -meses) : capital / meses;
}

// Meses que hacen falta para devolver un capital con una cuota fija
function mesesPara(capital, tinAnual, cuota) {
  const r = tinAnual / 100 / 12;
  if (capital <= 0) return 0;
  if (!r) return Math.ceil(capital / cuota);
  const x = 1 - (r * capital) / cuota;
  return x > 0 ? Math.ceil(-Math.log(x) / Math.log(1 + r)) : 600;
}

const mesesEntre = (a, b) => { const d0 = deIso(a); const d1 = deIso(b); return (d1.getFullYear() - d0.getFullYear()) * 12 + d1.getMonth() - d0.getMonth(); };
const cargoDelMes = (y, m, dia) => new Date(y, m, Math.min(dia, new Date(y, m + 1, 0).getDate()));

// Reglas de la hipoteca: tipo según el número de cuota (fija, variable o mixta) y número total de cuotas
function reglas(h) {
  const inicio = h.inicioComputo || h.fechaInicio || '';
  const total = n(h.plazoAnios) * 12 || (h.fechaFin && inicio ? mesesEntre(inicio, h.fechaFin) : 0);
  const fijo = h.modalidad === 'Mixta' ? n(h.mesesFijo) : (h.modalidad === 'Variable' ? 0 : Infinity);
  const hayDespues = h.tinDespues !== '' && h.tinDespues != null;
  const tasa = (num) => (num > fijo && hayDespues ? n(h.tinDespues) : n(h.tin));
  const numero = (f) => (inicio ? mesesEntre(inicio, f) : 0);
  return { total, tasa, numero };
}

// Simula cuotas mensuales desde una fecha (excluida). Opciones: hasta (incluida), cuota inicial y
// plazo = true para mantener el plazo acortado cuando cambia el tipo (simulación "reducir plazo").
function simular(h, capital, desde, { hasta = null, cuota = null, plazo = false, limite = 600 } = {}) {
  const R = reglas(h);
  const dia = n(h.diaCargo) || 1;
  const filas = [];
  let c = capital;
  let q = cuota ?? n(h.cuota);
  let d = deIso(desde);
  let rPrev = null;
  for (let k = 0; k < limite && c > 0.005; k++) {
    let cand = cargoDelMes(d.getFullYear(), d.getMonth(), dia);
    if (cand <= d) cand = cargoDelMes(d.getFullYear(), d.getMonth() + 1, dia);
    const f = iso(cand);
    if (hasta && f > hasta) break;
    d = cand;
    const num = R.numero(f);
    const tin = R.tasa(num);
    if (rPrev !== null && tin !== rPrev) {
      const quedan = plazo || !R.total ? mesesPara(c, rPrev, q) : Math.max(1, R.total - num + 1);
      q = cuotaFrancesa(c, tin, quedan);
    }
    rPrev = tin;
    const interes = c * tin / 100 / 12;
    const amort = Math.min(c, q - interes);
    if (amort <= 0) break; // la cuota no cubre ni los intereses
    c -= amort;
    filas.push({ f, interes, amort, cuota: amort + interes, pendiente: Math.max(0, c), tin });
  }
  return filas;
}

// Estado de la hipoteca hoy
export function calcular(h, hoy = iso(new Date())) {
  const base = h.fechaPendiente || hoy;
  const hastaHoy = simular(h, n(h.pendiente), base, { hasta: hoy });
  const ultimo = hastaHoy[hastaHoy.length - 1];
  const pendiente = ultimo ? ultimo.pendiente : n(h.pendiente);
  const cuota = ultimo ? ultimo.cuota : n(h.cuota);
  const desde = ultimo ? ultimo.f : base;
  const resto = simular(h, pendiente, desde, { cuota });
  const interesesQuedan = resto.reduce((s, x) => s + x.interes, 0);
  const fin = resto.length ? resto[resto.length - 1].f : hoy;
  const inicial = n(h.capitalInicial) || pendiente;
  const tin = resto[0]?.tin ?? n(h.tin);
  const cambio = resto.find((x) => x.tin !== tin) || null;
  return {
    pendiente, cuota: resto[0]?.cuota ?? cuota, tin, interesesQuedan, resto, fin, cambio,
    meses: resto.length, pagadoPct: inicial ? (1 - pendiente / inicial) * 100 : 0, inicial,
    estimado: base !== hoy, total: reglas(h).total, desde,
  };
}

// Qué pasa si amortizas X € hoy: reducir plazo (misma cuota) o reducir cuota (mismo plazo)
export function simularAmortizacion(h, extra) {
  const a = calcular(h);
  const nuevo = Math.max(0, a.pendiente - extra);
  const plazo = simular(h, nuevo, a.desde, { cuota: a.cuota, plazo: true });
  const cuotaNueva = cuotaFrancesa(nuevo, a.tin, a.meses);
  const porCuota = simular(h, nuevo, a.desde, { cuota: cuotaNueva });
  const suma = (l) => l.reduce((s, x) => s + x.interes, 0);
  return {
    antes: a,
    plazo: { meses: plazo.length, fin: plazo.length ? plazo[plazo.length - 1].f : a.desde, ahorro: a.interesesQuedan - suma(plazo) },
    cuota: { cuota: cuotaNueva, ahorro: a.interesesQuedan - suma(porCuota) },
  };
}

const anios = (m) => {
  const a = Math.floor(m / 12); const r = m % 12;
  return [a ? `${a} año${a === 1 ? '' : 's'}` : '', r ? `${r} mes${r === 1 ? '' : 'es'}` : ''].filter(Boolean).join(' y ') || '0 meses';
};

// ---------- Patrimonio neto (para Inicio y la pestaña) ----------
export function patrimonio(ctx) {
  const h = hipotecaDe(ctx.estado);
  const inversiones = ctx.estado.inversiones.reduce((s, p) => s + ctx.valorEur(p), 0);
  const parte = h ? (n(h.tuParte) || 100) / 100 : 1;
  const vivienda = h ? n(h.valorVivienda) * parte : 0;
  const deuda = h ? calcular(h).pendiente * parte : 0;
  return { inversiones, vivienda, deuda, neto: inversiones + vivienda - deuda, h, parte };
}

export function tarjetaPatrimonio(ctx) {
  const { euros, esc } = ctx;
  const p = patrimonio(ctx);
  if (!p.h) return '';
  const fila = (t, v, clase = '') => `<li><span>${t}</span><b class="${clase}">${v}</b></li>`;
  return `<a href="#inversiones?t=hipoteca" class="tarjeta dato-ancho patrimonio">
    <span>🏛️ Patrimonio neto</span><b>${euros(p.neto)}</b>
    <ul class="mini">
      ${fila('📈 Inversiones', euros(p.inversiones))}
      ${fila(`🏠 Vivienda${p.parte < 1 ? ` (tu ${Math.round(p.parte * 100)} %)` : ''}`, euros(p.vivienda))}
      ${fila(`🏦 Hipoteca${p.parte < 1 ? ` (tu ${Math.round(p.parte * 100)} %)` : ''}`, '−' + euros(p.deuda), 'baja')}
    </ul></a>`;
}

// ---------- Pestaña "Hipoteca" en Inversiones ----------
export function vistaHipoteca(ctx, caja) {
  const { estado, esc, euros, fecha } = ctx;
  const pct = porc;
  const h = hipotecaDe(estado);
  if (!h) {
    caja.innerHTML = `<section class="tarjeta"><h2>🏠 Hipoteca</h2>
      <p class="ayuda">Apunta tu hipoteca y verás cuánto te queda, los intereses que vas a pagar y tu patrimonio neto
      (inversiones + vivienda − hipoteca).</p><a class="btn primario" href="#editar-hipoteca">＋ Añadir hipoteca</a></section>`;
    return;
  }
  const a = calcular(h);
  const p = patrimonio(ctx);
  const kpi = (t, v, sub = '', clase = '') => `<div class="kpi"><span>${t}</span><b class="${clase}">${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const hoy = iso(new Date());
  const puntos = [{ f: hoy, v: a.pendiente }, ...a.resto.filter((x, k) => k % 3 === 2 || k === a.resto.length - 1).map((x) => ({ f: x.f, v: x.pendiente }))];
  const proxAnio = a.resto.slice(0, 12);
  const amort12 = proxAnio.reduce((s, x) => s + x.amort, 0);
  const int12 = proxAnio.reduce((s, x) => s + x.interes, 0);

  caja.innerHTML = `
    <section class="kpis">
      ${kpi('Te queda por pagar', euros(a.pendiente), a.estimado ? `estimado hoy; dato real del ${fecha(h.fechaPendiente)}` : 'dato real de hoy')}
      ${kpi('Cuota mensual', euros(a.cuota), a.cambio ? `desde ${fecha(a.cambio.f)} ≈ ${euros(a.cambio.cuota)} (estimado)` : (h.diaCargo ? `se carga el día ${esc(h.diaCargo)}` : ''))}
      ${kpi('Tipo de interés', pct(a.tin), a.cambio ? `${esc(h.modalidad)}: luego ≈ ${pct(a.cambio.tin)}` : esc(h.modalidad || ''))}
      ${kpi('Tiempo que queda', anios(a.meses), `última cuota ≈ ${fecha(a.fin)}`)}
      ${kpi('Intereses que quedan', euros(a.interesesQuedan), 'si no amortizas antes', 'baja')}
      ${kpi('Ya pagado', pct(a.pagadoPct), `${a.total ? `${a.total - a.meses} de ${a.total} cuotas · ` : ''}de ${euros(a.inicial)} prestados`)}
    </section>
    <section class="tarjeta"><h2>🏛️ Patrimonio neto</h2>
      <p class="grande">${euros(p.neto)}</p>
      <ul class="mini">
        <li><span>📈 Inversiones</span><b>${euros(p.inversiones)}</b></li>
        <li><span>🏠 Vivienda${p.parte < 1 ? ` (tu ${Math.round(p.parte * 100)} % de ${euros(n(h.valorVivienda))})` : ''}</span><b>${euros(p.vivienda)}</b></li>
        <li><span>🏦 Hipoteca pendiente${p.parte < 1 ? ` (tu ${Math.round(p.parte * 100)} %)` : ''}</span><b class="baja">−${euros(p.deuda)}</b></li>
        <li><span>Lo que ya es tuyo de la casa</span><b>${euros(p.vivienda - p.deuda)} (${pct(p.vivienda ? ((p.vivienda - p.deuda) / p.vivienda) * 100 : 0)})</b></li>
      </ul>
      <p class="ayuda">Vivienda según ${esc(h.fuenteValor || 'el valor que apuntaste')}. Puedes cambiarlo en «Editar».</p>
    </section>
    <section class="tarjeta"><h2>📉 Cómo baja la deuda</h2>
      <p class="ayuda">En los próximos 12 meses pagarás ${euros(amort12 + int12)}: ${euros(amort12)} de capital y ${euros(int12)} de intereses.
      Al principio de una hipoteca se pagan más intereses; con los años, cada cuota amortiza más capital.</p>
      ${G.lineasTiempo([{ nombre: 'Capital pendiente', clase: 'l-aport', puntos, area: true }], { alto: 240 })}
      ${a.cambio ? `<p class="ayuda">⚠️ Desde ${fecha(a.cambio.f)} el tipo pasa a variable (${esc(h.notaVariable || 'Euríbor + diferencial')}).
        Lo calculo con ${pct(a.cambio.tin)}, que es una estimación: la cuota real dependerá del Euríbor de cada año.</p>` : ''}
    </section>
    <section class="tarjeta"><h2>🧮 ¿Y si amortizo?</h2>
      <p class="ayuda">Simula meter un dinero extra hoy. Solo es un cálculo: revisa comisiones y condiciones con tu banco.</p>
      <label>Cantidad extra (€)<input id="extra" type="number" min="0" step="500" value="5000" inputmode="decimal"></label>
      <div id="sim"></div>
    </section>
    <section class="tarjeta"><h2>📋 Datos</h2>
      <ul class="mini">
        <li><span>Banco</span><b>${esc(h.entidad || '—')}</b></li>
        <li><span>Firmada</span><b>${h.fechaInicio ? fecha(h.fechaInicio) : '—'}</b></li>
        <li><span>Plazo</span><b>${h.plazoAnios ? `${esc(h.plazoAnios)} años` : '—'}</b></li>
        ${h.fechaFin ? `<li><span>Vencimiento (contrato)</span><b>${fecha(h.fechaFin)}</b></li>` : ''}
        ${h.referencia ? `<li><span>Nº de préstamo</span><b>${esc(h.referencia)}</b></li>` : ''}
      </ul>
      ${h.notas ? `<p class="ayuda">${esc(h.notas)}</p>` : ''}
      <a class="btn" href="#editar-hipoteca">✏️ Editar o poner el dato real del banco</a>
    </section>`;

  const pintarSim = () => {
    const extra = Math.max(0, Number(caja.querySelector('#extra').value) || 0);
    const s = simularAmortizacion(h, extra);
    caja.querySelector('#sim').innerHTML = extra ? `<ul class="mini">
      <li><span>Reduciendo <b>plazo</b> (misma cuota)</span><b class="sube">ahorras ${euros(s.plazo.ahorro)}</b></li>
      <li><span>&nbsp;&nbsp;terminas</span><b>${fecha(s.plazo.fin)} (${anios(Math.max(0, s.antes.meses - s.plazo.meses))} antes)</b></li>
      <li><span>Reduciendo <b>cuota</b> (mismo plazo)</span><b class="sube">ahorras ${euros(s.cuota.ahorro)}</b></li>
      <li><span>&nbsp;&nbsp;cuota nueva</span><b>${euros(s.cuota.cuota)}/mes (−${euros(s.antes.cuota - s.cuota.cuota)})</b></li>
    </ul>` : '';
  };
  caja.querySelector('#extra').addEventListener('input', pintarSim);
  pintarSim();
}

// ---------- Formulario ----------
export function vistaFormHipoteca(ctx) {
  const { estado, esc, pintar, $, num } = ctx;
  const h = hipotecaDe(estado);
  const v = h || { modalidad: 'Fija', diaCargo: '1', fechaPendiente: iso(new Date()) };
  const campo = (nombre, etiqueta, extra = '') => `<label>${etiqueta}<input name="${nombre}" value="${esc(v[nombre] ?? '')}" ${extra}></label>`;
  pintar(`<header class="cabecera"><a href="#inversiones?t=hipoteca" class="volver">‹ Hipoteca</a>
      <h1>${h ? 'Editar hipoteca' : 'Nueva hipoteca'}</h1></header>
    <form id="f" class="tarjeta" autocomplete="off">
      ${campo('entidad', 'Banco', 'required')}
      <div class="dos">${campo('capitalInicial', 'Importe prestado (€)', 'inputmode="decimal"')}${campo('fechaInicio', 'Fecha de firma', 'type="date"')}</div>
      <div class="dos">${campo('plazoAnios', 'Plazo (años)', 'inputmode="numeric"')}${campo('fechaFin', 'Vencimiento', 'type="date"')}</div>
      <div class="dos">${campo('tin', 'Tipo de interés (TIN %)', 'required inputmode="decimal"')}
        <label>Modalidad<select name="modalidad">${['Fija', 'Variable', 'Mixta'].map((m) => `<option ${m === v.modalidad ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
      <div class="dos">${campo('mesesFijo', 'Si es mixta: cuotas a tipo fijo', 'inputmode="numeric"')}${campo('tinDespues', 'Tipo después (%, estimado)', 'inputmode="decimal"')}</div>
      ${campo('notaVariable', 'Cómo se calcula el variable', 'placeholder="Euríbor 12 meses + diferencial"')}
      <div class="dos">${campo('cuota', 'Cuota mensual (€)', 'required inputmode="decimal"')}${campo('diaCargo', 'Día del cargo', 'inputmode="numeric"')}</div>
      ${campo('inicioComputo', 'Inicio del cómputo (las cuotas cuentan desde aquí)', 'type="date"')}
      <p class="ayuda">El dato real del banco. Desde aquí la app calcula sola cómo baja cada mes.</p>
      <div class="dos">${campo('pendiente', 'Capital pendiente (€)', 'required inputmode="decimal"')}${campo('fechaPendiente', 'A fecha de', 'type="date" required')}</div>
      <div class="dos">${campo('valorVivienda', 'Valor de la vivienda (€)', 'inputmode="decimal"')}${campo('fuenteValor', 'Según', 'placeholder="tasación, precio de compra…"')}</div>
      ${campo('tuParte', 'Tu parte de la casa y de la hipoteca (%)', 'inputmode="decimal" placeholder="100"')}
      ${campo('referencia', 'Nº de préstamo (opcional)')}
      <label>Notas<textarea name="notas" rows="3" placeholder="Bonificaciones, seguros vinculados, comisiones…">${esc(v.notas)}</textarea></label>
      <button class="btn primario" type="submit">Guardar</button>
      ${h ? '<button class="btn peligro ancho" type="button" id="borrar">🗑️ Borrar hipoteca</button>' : ''}
      <p class="error" id="err"></p>
    </form>`);
  $('#borrar')?.addEventListener('click', async () => {
    if (!confirm('¿Borrar los datos de la hipoteca?')) return;
    await ctx.borrarRegistro(h.id);
    ctx.ir('#inversiones?t=hipoteca');
  });
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const t = (k) => String(f.get(k) || '').trim();
    const x = (k) => (t(k) ? num(t(k)) : '');
    ctx.ocupado($('#f button[type=submit]'), 'Guardando…', async () => {
      try {
        await ctx.guardarRegistro({
          ...(h || {}), tipo: 'hipoteca', entidad: t('entidad'), capitalInicial: x('capitalInicial'), fechaInicio: t('fechaInicio'),
          plazoAnios: t('plazoAnios'), fechaFin: t('fechaFin'), tin: x('tin'), modalidad: t('modalidad'), cuota: x('cuota'),
          diaCargo: t('diaCargo'), pendiente: x('pendiente'), fechaPendiente: t('fechaPendiente'), valorVivienda: x('valorVivienda'),
          fuenteValor: t('fuenteValor'), referencia: t('referencia'), notas: t('notas'),
          mesesFijo: t('mesesFijo'), tinDespues: x('tinDespues'), notaVariable: t('notaVariable'),
          inicioComputo: t('inicioComputo'), tuParte: x('tuParte'),
        });
        ctx.aviso('Hipoteca guardada 🔒');
        ctx.ir('#inversiones?t=hipoteca');
      } catch (error) { $('#err').textContent = 'No se pudo guardar: ' + (error.message || error); }
    });
  };
}
