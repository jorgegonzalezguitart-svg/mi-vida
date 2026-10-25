// Mi Vida — función "mivida-avisos" (la llama Supabase cada 15 minutos con pg_cron).
// Busca avisos cuya hora ya ha llegado y envía un push GENÉRICO a los móviles del usuario.
// No conoce el contenido de ningún aviso: el texto está guardado solo en el móvil.
import webpush from 'npm:web-push@3.6.7';

const URL_BASE = `${Deno.env.get('SUPABASE_URL')}/rest/v1`;
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CABECERAS = { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}`, 'Content-Type': 'application/json' };

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

async function rest(ruta: string, opciones: RequestInit = {}) {
  const r = await fetch(`${URL_BASE}/${ruta}`, { ...opciones, headers: { ...CABECERAS, ...(opciones.headers ?? {}) } });
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

Deno.serve(async (req) => {
  const token = Deno.env.get('MIVIDA_CRON_TOKEN');
  if (!token || req.headers.get('x-mivida-cron') !== token) return json({ error: 'No autorizado' }, 401);
  try {
    webpush.setVapidDetails('mailto:avisos@mi-vida.invalid', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
    const ahora = new Date().toISOString();
    const avisos = await rest(`mivida_avisos?select=id,user_id&enviado=eq.false&cuando=lte.${encodeURIComponent(ahora)}&limit=1000`);
    if (!avisos.length) return json({ enviados: 0 });
    const usuarios = [...new Set(avisos.map((a: { user_id: string }) => a.user_id))];
    const subs = await rest(`mivida_push?select=id,user_id,endpoint,p256dh,auth&user_id=in.(${usuarios.join(',')})`);
    let enviados = 0;
    const caducadas: string[] = [];
    for (const u of usuarios) {
      const n = avisos.filter((a: { user_id: string }) => a.user_id === u).length;
      for (const s of subs.filter((x: { user_id: string }) => x.user_id === u)) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ n }), { TTL: 86400 });
          enviados++;
        } catch (e) {
          const codigo = (e as { statusCode?: number }).statusCode;
          if (codigo === 404 || codigo === 410) caducadas.push(s.id);
        }
      }
    }
    await rest(`mivida_avisos?id=in.(${avisos.map((a: { id: string }) => a.id).join(',')})`, { method: 'PATCH', body: JSON.stringify({ enviado: true }) });
    if (caducadas.length) await rest(`mivida_push?id=in.(${caducadas.join(',')})`, { method: 'DELETE' });
    // Limpieza: avisos ya enviados hace más de 30 días
    const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();
    await rest(`mivida_avisos?enviado=eq.true&cuando=lt.${encodeURIComponent(hace30)}`, { method: 'DELETE' });
    return json({ avisos: avisos.length, enviados, suscripcionesBorradas: caducadas.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
