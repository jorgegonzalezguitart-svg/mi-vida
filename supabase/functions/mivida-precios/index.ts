// Mi Vida — función "mivida-precios"
// 1) { fondos: [{ isin, moneda }] } → último valor liquidativo de cada fondo (Financial Times).
//    Solo ve los ISIN: nunca participaciones ni importes.
// 2) { accion: 'noticias' } → titulares recientes de prensa económica española (RSS públicos).
// Solo responde a usuarios con sesión iniciada (Supabase comprueba el token).

const FUENTES = [
  { nombre: 'Expansión · Mercados', url: 'https://e00-expansion.uecdn.es/rss/mercados.xml' },
  { nombre: 'Expansión · Ahorro', url: 'https://e00-expansion.uecdn.es/rss/ahorro.xml' },
  { nombre: 'Cinco Días · Mercados', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/cincodias.elpais.com/section/mercados-financieros/portada' },
  { nombre: 'Finanzas.com', url: 'https://www.finanzas.com/feed/' },
];

const limpiar = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const campo = (item: string, tag: string) => {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? limpiar(m[1]) : '';
};

async function noticias() {
  const listas = await Promise.all(FUENTES.map(async (f) => {
    try {
      const r = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (MiVida)' } });
      if (!r.ok) return [];
      const xml = new TextDecoder('utf-8').decode(await r.arrayBuffer());
      return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].slice(0, 40).map(([item]) => ({
        fuente: f.nombre,
        titulo: campo(item, 'title'),
        enlace: campo(item, 'link'),
        fecha: (() => { const d = new Date(campo(item, 'pubDate')); return isNaN(+d) ? null : d.toISOString(); })(),
        resumen: campo(item, 'description').slice(0, 280),
      })).filter((n) => n.titulo && /^https?:\/\//.test(n.enlace));
    } catch { return []; }
  }));
  return listas.flat().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MESES: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function respuesta(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function precioFT(isin: string, moneda: string) {
  const url = `https://markets.ft.com/data/funds/tearsheet/summary?s=${isin}:${moneda}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (MiVida)' } });
  if (!r.ok) return null;
  const html = await r.text();
  const p = html.match(/mod-ui-data-list__value">([0-9.,]+)</);
  if (!p) return null;
  const f = html.match(/as of ([A-Z][a-z]{2}) (\d{1,2}) (\d{4})/);
  const fecha = f ? `${f[3]}-${MESES[f[1]] ?? '01'}-${f[2].padStart(2, '0')}` : null;
  return { precio: Number(p[1].replace(/,/g, '')), moneda, fecha };
}

// Comprueba que quien llama tiene una sesión válida en este proyecto
async function conSesion(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!(await conSesion(req))) return respuesta({ error: 'Hace falta iniciar sesión' }, 401);
  try {
    const { fondos, accion } = await req.json();
    if (accion === 'noticias') return respuesta({ noticias: await noticias() });
    const lista = (Array.isArray(fondos) ? fondos : [])
      .filter((f) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(f?.isin ?? ''))
      .slice(0, 50);
    const resultado: Record<string, unknown> = {};
    await Promise.all(lista.map(async (f) => {
      const moneda = /^[A-Z]{3}$/.test(f.moneda ?? '') ? f.moneda : 'EUR';
      try {
        const dato = await precioFT(f.isin, moneda);
        if (dato) resultado[f.isin] = dato;
      } catch { /* si un fondo falla, se sigue con los demás */ }
    }));
    return respuesta(resultado);
  } catch (e) {
    return respuesta({ error: String(e) }, 400);
  }
});
