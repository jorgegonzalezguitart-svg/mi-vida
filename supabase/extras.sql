-- ============================================================
--  Mi Vida — tablas para Dinero, Calendario y Avisos
--  Pegar en: Supabase → SQL Editor → New query → Run
--  Solo crea cosas nuevas con prefijo "mivida"; no toca nada de la web.
-- ============================================================

-- 1) Registros genéricos cifrados (movimientos de dinero, eventos del calendario…)
create table if not exists public.mivida_registros (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datos       text not null,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists mivida_registros_user_idx on public.mivida_registros(user_id);

-- 2) Dispositivos con avisos activados (suscripciones push)
create table if not exists public.mivida_push (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh   text not null,
  auth     text not null,
  creado   timestamptz not null default now()
);
create index if not exists mivida_push_user_idx on public.mivida_push(user_id);

-- 3) Horas de aviso (SIN contenido: el texto vive solo en el móvil)
create table if not exists public.mivida_avisos (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cuando   timestamptz not null,
  enviado  boolean not null default false,
  creado   timestamptz not null default now()
);
create index if not exists mivida_avisos_pend_idx on public.mivida_avisos(enviado, cuando);

-- 4) Seguridad (RLS): cada usuario solo ve y toca lo suyo
alter table public.mivida_registros enable row level security;
alter table public.mivida_push      enable row level security;
alter table public.mivida_avisos    enable row level security;

drop policy if exists "mivida solo lo mio" on public.mivida_registros;
create policy "mivida solo lo mio" on public.mivida_registros for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "mivida solo lo mio" on public.mivida_push;
create policy "mivida solo lo mio" on public.mivida_push for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "mivida solo lo mio" on public.mivida_avisos;
create policy "mivida solo lo mio" on public.mivida_avisos for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.mivida_registros, public.mivida_push, public.mivida_avisos from anon;

-- 5) Extensiones para la tarea programada de avisos
create extension if not exists pg_cron;
create extension if not exists pg_net;
