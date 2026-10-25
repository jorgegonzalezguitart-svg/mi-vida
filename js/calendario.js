// Calendario: eventos propios (registros cifrados de tipo "evento") + caducidades de documentos.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hoyIso = () => iso(new Date());
const sumarMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const nombreMes = (ym) => { const [y, m] = ym.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };

export const REPETIR = [['no', 'No se repite'], ['semanal', 'Cada semana'], ['mensual', 'Cada mes'], ['anual', 'Cada año']];
export const AVISO = [['no', 'Sin aviso'], ['0', 'A la hora del evento'], ['60', '1 hora antes'], ['1440', '1 día antes'], ['10080', '1 semana antes']];

// Fechas (YYYY-MM-DD) en que ocurre un evento entre "desde" y "hasta" (incluidas)
export function ocurrencias(ev, desde, hasta) {
  const fechas = [];
  const inicio = deIso(ev.fecha);
  const fin = deIso(hasta);
  const d0 = deIso(desde);
  if (!ev.repetir || ev.repetir === 'no') {
    if (ev.fecha >= desde && ev.fecha <= hasta) fechas.push(ev.fecha);
    return fechas;
  }
  let k = 0;
  for (let d = new Date(inicio); d <= fin && k < 2000; k++) {
    if (d >= d0) fechas.push(iso(d));
    if (ev.repetir === 'semanal') d.setDate(d.getDate() + 7);
    else if (ev.repetir === 'mensual') { const dia = inicio.getDate(); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
    else if (ev.repetir === 'anual') d = new Date(d.getFullYear() + 1, inicio.getMonth(), inicio.getDate());
    else break;
  }
  return fechas;
}

// Todos los elementos del calendario entre dos fechas: eventos + caducidades de documentos
export function elementos(estado, desde, hasta) {
  const lista = [];
  for (const ev of (estado.registros || []).filter((r) => r.tipo === 'evento')) {
    for (const f of ocurrencias(ev, desde, hasta)) lista.push({ clase: 'evento', f, hora: ev.hora || '', titulo: ev.titulo, id: ev.id, ev });
  }
  for (const d of estado.docs || []) {
    if (d.caduca && d.caduca >= desde && d.caduca <= hasta) lista.push({ clase: 'caducidad', f: d.caduca, titulo: `Caduca: ${d.titulo}`, id: d.id });
  }
  return lista.sort((a, b) => (a.f + a.hora).localeCompare(b.f + b.hora));
}

export function vistaCalendario(ctx, q) {
  const { estado, esc, pintar, $, $$ } = ctx;
  const ym = /^\d{4}-\d{2}$/.test(q.get('m') || '') ? q.get('m') : hoyIso().slice(0, 7);
  const sel = /^\d{4}-\d{2}-\d{2}$/.test(q.get('d') || '') ? q.get('d') : (hoyIso().startsWith(ym) ? hoyIso() : `${ym}-01`);
  const primero = deIso(`${ym}-01`);
  const diasMes = new Date(primero.getFullYear(), primero.getMonth() + 1, 0).getDate();
  const huecos = (primero.getDay() + 6) % 7; // lunes = 0
  const delMes = elementos(estado, `${ym}-01`, `${ym}-${String(diasMes).padStart(2, '0')}`);
  const porDia = {};
  for (const e of delMes) (porDia[e.f] ||= []).push(e);
  const proximos = elementos(estado, hoyIso(), iso(new Date(Date.now() + 30 * 86400000)));
  const fila = (e) => `<li><a class="fila-item" href="${e.clase === 'evento' ? `#editar-evento/${e.id}` : `#doc/${e.id}`}">
      <span class="icono">${e.clase === 'evento' ? '📌' : '⏰'}</span>
      <span class="texto"><b>${esc(e.titulo)}</b><small>${ctx.fecha(e.f)}${e.hora ? ' · ' + esc(e.hora) : ''}${e.ev?.repetir && e.ev.repetir !== 'no' ? ' · 🔁' : ''}</small></span></a></li>`;

  pintar(`<header class="cabecera fila"><h1>Calendario</h1>
      <a class="btn primario peq" href="#nuevo-evento?f=${sel}">＋ Evento</a></header>
    <div class="selector-mes"><a class="btn texto" href="#calendario?m=${sumarMes(ym, -1)}">‹</a><b>${nombreMes(ym)}</b>
      <a class="btn texto" href="#calendario?m=${sumarMes(ym, 1)}">›</a></div>
    <section class="tarjeta calendario">
      <div class="cal-cabecera">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-dias">${'<span></span>'.repeat(huecos)}${Array.from({ length: diasMes }, (_, k) => {
        const f = `${ym}-${String(k + 1).padStart(2, '0')}`;
        const es = porDia[f] || [];
        return `<a href="#calendario?m=${ym}&d=${f}" class="${f === sel ? 'sel' : ''} ${f === hoyIso() ? 'hoy' : ''}">${k + 1}
          <i>${es.slice(0, 3).map((e) => `<b class="${e.clase}"></b>`).join('')}</i></a>`;
      }).join('')}</div>
    </section>
    <section class="tarjeta"><h2>${esc(ctx.fecha(sel))}</h2>
      <ul class="lista">${(porDia[sel] || []).map(fila).join('') || `<li class="vacio">Nada este día. <a href="#nuevo-evento?f=${sel}">Añadir evento</a></li>`}</ul>
    </section>
    <section class="tarjeta"><h2>🗓️ Próximos 30 días</h2>
      <ul class="lista">${proximos.map(fila).join('') || '<li class="vacio">Nada en los próximos 30 días.</li>'}</ul>
    </section>
    <div id="caja-avisos"></div>`);
  ctx.pintarAvisos?.($('#caja-avisos'));
}

export function vistaFormEvento(ctx, id, q) {
  const { estado, esc, pintar, $ } = ctx;
  const ev = id ? (estado.registros || []).find((r) => r.id === id) : null;
  if (id && !ev) return ctx.ir('#calendario');
  const v = ev || { fecha: q?.get('f') || hoyIso(), repetir: 'no', aviso: '1440', hora: '' };
  pintar(`<header class="cabecera"><a href="#calendario?m=${v.fecha.slice(0, 7)}&d=${v.fecha}" class="volver">‹ Calendario</a>
      <h1>${ev ? 'Editar evento' : 'Nuevo evento'}</h1></header>
    <form id="f" class="tarjeta" autocomplete="off">
      <label>Qué<input name="titulo" required value="${esc(v.titulo)}" placeholder="Ej: Revisión médica, cumpleaños, ITV…"></label>
      <div class="dos">
        <label>Día<input type="date" name="fecha" required value="${esc(v.fecha)}"></label>
        <label>Hora (opcional)<input type="time" name="hora" value="${esc(v.hora)}"></label>
      </div>
      <label>Repetir<select name="repetir">${REPETIR.map(([k, n]) => `<option value="${k}" ${k === v.repetir ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Aviso en el móvil<select name="aviso">${AVISO.map(([k, n]) => `<option value="${k}" ${k === String(v.aviso) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Notas<textarea name="nota" rows="2">${esc(v.nota)}</textarea></label>
      <button class="btn primario" type="submit">Guardar</button>
      ${ev ? '<button class="btn peligro ancho" type="button" id="borrar">🗑️ Borrar</button>' : ''}
      <p class="error" id="err"></p>
    </form>`);
  $('#borrar')?.addEventListener('click', async () => {
    if (!confirm(`¿Borrar "${ev.titulo}"?${ev.repetir !== 'no' ? ' Se borran todas sus repeticiones.' : ''}`)) return;
    await ctx.borrarRegistro(ev.id);
    ctx.aviso('Evento borrado');
    ctx.ir(`#calendario?m=${ev.fecha.slice(0, 7)}`);
  });
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    ctx.ocupado($('#f button[type=submit]'), 'Guardando…', async () => {
      try {
        const r = await ctx.guardarRegistro({
          ...(ev || {}), tipo: 'evento', titulo: f.get('titulo').trim(), fecha: f.get('fecha'), hora: f.get('hora'),
          repetir: f.get('repetir'), aviso: f.get('aviso'), nota: f.get('nota').trim(),
        });
        ctx.aviso('Evento guardado 🔒');
        ctx.ir(`#calendario?m=${r.fecha.slice(0, 7)}&d=${r.fecha}`);
      } catch (error) { $('#err').textContent = 'No se pudo guardar: ' + (error.message || error); }
    });
  };
}
