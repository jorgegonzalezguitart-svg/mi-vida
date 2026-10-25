-- ============================================================
--  Mi Vida — tabla de INVERSIONES
--  Pégalo en: Supabase (tu proyecto) → SQL Editor → New query → Run
--  Solo crea cosas nuevas con prefijo "mivida"; no toca nada de la web.
--  Se puede ejecutar más de una vez sin romper nada.
-- ============================================================

-- Cada fila es una posición (un fondo, el bitcoin…). TODO va cifrado en "datos":
-- nombre, ISIN, participaciones, dinero invertido, precios e histórico.
create table if not exists public.mivida_inversiones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datos       text not null,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists mivida_inversiones_user_idx on public.mivida_inversiones(user_id);

alter table public.mivida_inversiones enable row level security;

drop policy if exists "mivida solo lo mio" on public.mivida_inversiones;
create policy "mivida solo lo mio" on public.mivida_inversiones for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.mivida_inversiones from anon;
