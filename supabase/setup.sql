-- ============================================================
--  Mi Vida — configuración de la base de datos en Supabase
--  Pégalo entero en: Supabase → SQL Editor → New query → Run
--
--  Pensado para convivir en un proyecto que ya usa otra web:
--  todo lleva el prefijo "mivida" y NO se toca nada que ya exista.
--  Se puede ejecutar más de una vez sin romper nada.
-- ============================================================

-- 1) Bóveda: datos para comprobar la clave maestra (nunca la clave en sí)
create table if not exists public.mivida_boveda (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  sal          text not null,
  iteraciones  int  not null default 600000,
  comprobacion text not null,
  creado       timestamptz not null default now()
);

-- 2) Documentos: TODO va cifrado dentro de "datos" (también la caducidad)
create table if not exists public.mivida_documentos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datos       text not null,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists mivida_documentos_user_idx on public.mivida_documentos(user_id);

-- 3) Contraseñas: todo cifrado
create table if not exists public.mivida_contrasenas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datos       text not null,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists mivida_contrasenas_user_idx on public.mivida_contrasenas(user_id);

-- 4) Seguridad (RLS): cada usuario solo ve y toca lo suyo
alter table public.mivida_boveda      enable row level security;
alter table public.mivida_documentos  enable row level security;
alter table public.mivida_contrasenas enable row level security;

drop policy if exists "mivida solo lo mio" on public.mivida_boveda;
create policy "mivida solo lo mio" on public.mivida_boveda for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "mivida solo lo mio" on public.mivida_documentos;
create policy "mivida solo lo mio" on public.mivida_documentos for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "mivida solo lo mio" on public.mivida_contrasenas;
create policy "mivida solo lo mio" on public.mivida_contrasenas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Nadie sin sesión puede ni intentarlo
revoke all on public.mivida_boveda, public.mivida_documentos, public.mivida_contrasenas from anon;

-- 5) Almacén de archivos PRIVADO (máx. 50 MB por archivo; todos van cifrados)
insert into storage.buckets (id, name, public, file_size_limit)
values ('mivida-documentos', 'mivida-documentos', false, 52428800)
on conflict (id) do update set public = false;

-- Cada usuario solo puede usar su propia carpeta: mivida-documentos/<su id>/...
drop policy if exists "mivida carpeta - ver" on storage.objects;
create policy "mivida carpeta - ver" on storage.objects for select to authenticated
  using (bucket_id = 'mivida-documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "mivida carpeta - subir" on storage.objects;
create policy "mivida carpeta - subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'mivida-documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "mivida carpeta - cambiar" on storage.objects;
create policy "mivida carpeta - cambiar" on storage.objects for update to authenticated
  using (bucket_id = 'mivida-documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "mivida carpeta - borrar" on storage.objects;
create policy "mivida carpeta - borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'mivida-documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);
