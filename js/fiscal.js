// ============================================================
//  Motor fiscal de Mi Vida (España, IRPF, base del ahorro)
//  - FIFO por fondo (ISIN), sumando todas las cuentas del titular
//  - Tramos del ahorro del año
//  - Optimizador: qué vender para pagar lo mínimo
//  Es una SIMULACIÓN para planificar: no sustituye a un asesor fiscal.
// ============================================================

// Tramos de la base del ahorro (estatal + autonómico). Revisar cada año.
export const TRAMOS_AHORRO = [
  { hasta: 6000, tipo: 0.19 },
  { hasta: 50000, tipo: 0.21 },
  { hasta: 200000, tipo: 0.23 },
  { hasta: 300000, tipo: 0.27 },
  { hasta: Infinity, tipo: 0.30 },
];

const r2 = (n) => Math.round(n * 100) / 100;
const r6 = (n) => Math.round(n * 1e6) / 1e6;

// Impuesto de una ganancia neta del año, tramo a tramo
export function impuestoAhorro(ganancia, tramos = TRAMOS_AHORRO) {
  const detalle = [];
  let resto = Math.max(0, ganancia);
  let desde = 0;
  let total = 0;
  for (const t of tramos) {
    if (resto <= 0) break;
    const ancho = t.hasta - desde;
    const base = Math.min(resto, ancho);
    const cuota = r2(base * t.tipo);
    detalle.push({ desde, hasta: t.hasta, tipo: t.tipo, base: r2(base), cuota });
    total += cuota;
    resto -= base;
    desde = t.hasta;
  }
  return { total: r2(total), detalle, tipoMedio: ganancia > 0 ? total / ganancia : 0 };
}

// Lo que pagarías por una ganancia nueva, encima de lo ya realizado este año
export function impuestoAdicional(gananciaNueva, yaRealizada = 0) {
  const antes = impuestoAhorro(yaRealizada).total;
  const despues = impuestoAhorro(yaRealizada + gananciaNueva).total;
  return r2(despues - antes);
}

// Lotes FIFO de un ISIN juntando todas las posiciones (más antiguo primero)
export function lotesPorIsin(posiciones) {
  const mapa = new Map();
  for (const p of posiciones) {
    if (!p.isin || !Array.isArray(p.lotes)) continue;
    const lista = mapa.get(p.isin) || [];
    for (const l of p.lotes) lista.push({ ...l, cuenta: p.cuenta || '', entidad: p.entidad || '' });
    mapa.set(p.isin, lista);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.f.localeCompare(b.f));
  return mapa;
}

// Vende "participaciones" de un ISIN por FIFO. Devuelve los trozos de lote usados.
export function venderFifo(lotes, participaciones, precioVentaEur, consumidas = []) {
  const trozos = [];
  let falta = participaciones;
  for (let k = 0; k < lotes.length && falta > 1e-9; k++) {
    const l = lotes[k];
    const libres = l.part - (consumidas[k] || 0);
    if (libres <= 1e-9) continue;
    const usa = Math.min(libres, falta);
    const coste = r2(l.coste * (usa / l.part));
    const valor = r2(usa * precioVentaEur);
    trozos.push({
      f: l.f, tipo: l.tipo, cuenta: l.cuenta, entidad: l.entidad,
      part: r6(usa), precioCompra: l.coste / l.part, precioVenta: precioVentaEur,
      coste, valor, ganancia: r2(valor - coste), pct: coste ? (valor - coste) / coste : 0,
    });
    consumidas[k] = (consumidas[k] || 0) + usa;
    falta -= usa;
  }
  return { trozos, sinCubrir: falta > 1e-6 ? r6(falta) : 0 };
}

// Regla de los 2 meses: pérdidas en fondos que se compran (o compraste) cerca de la venta
export function aplicaRegla2Meses(lotes, fechaVenta = new Date(), compraRecurrente = false) {
  if (compraRecurrente) return true;
  const ms = 62 * 86400000;
  return lotes.some((l) => Math.abs(new Date(l.f + 'T00:00:00') - fechaVenta) <= ms);
}

// Simula una retirada: ventas = [{ isin, importe }] (importe bruto en €)
// precios = { isin: precioEur }, posiciones con lotes
export function simular(ventas, posiciones, precios, opciones = {}) {
  const { yaRealizada = 0, dcaIsins = [], fecha = new Date() } = opciones;
  const lotes = lotesPorIsin(posiciones);
  const porIsin = [];
  let bruto = 0; let ganancia = 0; let costeTotal = 0;
  for (const v of ventas) {
    if (!v.importe || v.importe <= 0) continue;
    const lista = lotes.get(v.isin) || [];
    const precio = precios[v.isin];
    if (!precio) continue;
    const part = v.importe / precio;
    const { trozos, sinCubrir } = venderFifo(lista, part, precio, []);
    const g = r2(trozos.reduce((s, t) => s + t.ganancia, 0));
    const c = r2(trozos.reduce((s, t) => s + t.coste, 0));
    const perdida = trozos.some((t) => t.ganancia < 0);
    porIsin.push({
      isin: v.isin, nombre: v.nombre || v.isin, importe: r2(v.importe), part: r6(part), precio,
      trozos, ganancia: g, coste: c, sinCubrir,
      regla2Meses: perdida && aplicaRegla2Meses(lista, fecha, dcaIsins.includes(v.isin)),
    });
    bruto += v.importe; ganancia += g; costeTotal += c;
  }
  ganancia = r2(ganancia);
  // Pérdidas bloqueadas por la regla de los 2 meses: no restan este año
  const bloqueada = r2(porIsin.filter((x) => x.regla2Meses)
    .reduce((s, x) => s + x.trozos.filter((t) => t.ganancia < 0).reduce((a, t) => a + t.ganancia, 0), 0));
  const gananciaComputable = r2(ganancia - bloqueada);
  const totalAnio = r2(yaRealizada + gananciaComputable);
  const imp = impuestoAhorro(totalAnio);
  const impuesto = r2(imp.total - impuestoAhorro(yaRealizada).total);
  return {
    porIsin, bruto: r2(bruto), coste: r2(costeTotal), ganancia, perdidaBloqueada: bloqueada,
    gananciaComputable, yaRealizada, totalAnio, impuesto, neto: r2(bruto - impuesto),
    tramos: imp.detalle, tipoEfectivo: gananciaComputable > 0 ? impuesto / gananciaComputable : 0,
  };
}

// Convierte "fuentes" (fondos sueltos o carteras) en ventas por ISIN.
// fuente = { id, nombre, componentes: [{ isin, nombre, valor }] } → reparte en proporción al valor
export function repartirFuente(fuente, importe) {
  const total = fuente.componentes.reduce((s, c) => s + c.valor, 0);
  if (!total) return [];
  return fuente.componentes.map((c) => ({ isin: c.isin, nombre: c.nombre, importe: (importe * c.valor) / total }));
}

function juntar(ventas) {
  const m = new Map();
  for (const v of ventas) {
    const x = m.get(v.isin) || { isin: v.isin, nombre: v.nombre, importe: 0 };
    x.importe += v.importe;
    m.set(v.isin, x);
  }
  return [...m.values()];
}

// Optimizador: reparte "objetivo" (neto o bruto) entre las fuentes pagando lo mínimo.
// Avanza en pasos pequeños y en cada paso vende de la fuente cuyo siguiente tramo FIFO tiene menos ganancia.
export function optimizar(objetivo, fuentes, posiciones, precios, opciones = {}) {
  const { modo = 'neto', paso = 50, yaRealizada = 0, dcaIsins = [] } = opciones;
  const disponible = Object.fromEntries(fuentes.map((f) => [f.id, f.componentes.reduce((s, c) => s + c.valor, 0)]));
  const asignado = Object.fromEntries(fuentes.map((f) => [f.id, 0]));
  const ventasDe = () => juntar(fuentes.flatMap((f) => repartirFuente(f, asignado[f.id])));
  const evaluar = (ventas) => simular(ventas, posiciones, precios, { yaRealizada, dcaIsins });
  let actual = evaluar([]);
  let vueltas = 0;
  const meta = () => (modo === 'neto' ? actual.neto : actual.bruto);
  while (meta() < objetivo - 0.005 && vueltas < 20000) {
    vueltas++;
    const falta = objetivo - meta();
    const trozo = Math.min(paso, falta * (modo === 'neto' ? 1.35 : 1));
    let mejor = null;
    for (const f of fuentes) {
      const libre = disponible[f.id] - asignado[f.id];
      if (libre <= 0.01) continue;
      const cantidad = Math.min(trozo, libre);
      asignado[f.id] += cantidad;
      const prueba = evaluar(ventasDe());
      asignado[f.id] -= cantidad;
      // Coste fiscal por euro conseguido
      const ganado = (modo === 'neto' ? prueba.neto : prueba.bruto) - meta();
      if (ganado <= 0) continue;
      const coste = (prueba.impuesto - actual.impuesto) / ganado;
      if (!mejor || coste < mejor.coste - 1e-9) mejor = { f, cantidad, coste, prueba };
    }
    if (!mejor) break; // no queda dinero disponible
    asignado[mejor.f.id] += mejor.cantidad;
    actual = mejor.prueba;
  }
  // Ajuste fino para no pasarse del objetivo
  const exceso = meta() - objetivo;
  if (exceso > 0.01) {
    const f = [...fuentes].reverse().find((x) => asignado[x.id] > exceso);
    if (f) { asignado[f.id] -= exceso * (modo === 'neto' ? 0.8 : 1); actual = evaluar(ventasDe()); }
  }
  return {
    asignacion: fuentes.map((f) => ({ id: f.id, nombre: f.nombre, importe: r2(asignado[f.id]) })).filter((x) => x.importe > 0),
    resultado: actual,
    alcanzado: meta() >= objetivo - 1,
  };
}

// Cuánto se puede sacar (de la mejor fuente) sin que la ganancia del año pase de "limite"
export function maximoEnTramo(limite, fuentes, posiciones, precios, opciones = {}) {
  const { yaRealizada = 0 } = opciones;
  const margen = limite - yaRealizada;
  if (margen <= 0) return { importe: 0 };
  let bajo = 0; let alto = fuentes.reduce((s, f) => s + f.componentes.reduce((a, c) => a + c.valor, 0), 0);
  let mejor = null;
  for (let k = 0; k < 18; k++) {
    const medio = (bajo + alto) / 2;
    const o = optimizar(medio, fuentes, posiciones, precios, { ...opciones, modo: 'bruto', paso: Math.max(50, medio / 60) });
    if (o.resultado.ganancia <= margen) { bajo = medio; mejor = o; } else alto = medio;
  }
  return { importe: r2(bajo), plan: mejor };
}

// TIR anual (XIRR) de flujos [{ f: 'YYYY-MM-DD', importe }] (aportaciones negativas, valor final positivo)
export function tir(flujos) {
  if (flujos.length < 2) return null;
  const t0 = new Date(flujos[0].f).getTime();
  const anios = flujos.map((x) => (new Date(x.f).getTime() - t0) / (365.25 * 86400000));
  const vpn = (r) => flujos.reduce((s, x, k) => s + x.importe / (1 + r) ** anios[k], 0);
  let bajo = -0.99; let alto = 5;
  if (vpn(bajo) * vpn(alto) > 0) return null;
  for (let k = 0; k < 200; k++) {
    const medio = (bajo + alto) / 2;
    if (vpn(bajo) * vpn(medio) <= 0) alto = medio; else bajo = medio;
  }
  return (bajo + alto) / 2;
}
