-- OUR LITTLE UNIVERSE: initial private schema
create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_path text,
  accent_color text default '#8b4962',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  category_id uuid references public.categories(id) on delete set null,
  memory_date date,
  poster_path text,
  media_path text,
  media_type text check (media_type in ('photo','video','audio','voice')),
  duration_seconds integer,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.profile_memories (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, memory_id)
);
create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id, memory_id)
);
create table if not exists public.watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  position_seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, memory_id)
);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.memories enable row level security;
alter table public.profile_memories enable row level security;
alter table public.favorites enable row level security;
alter table public.watch_progress enable row level security;

create policy "authenticated can read profiles" on public.profiles
for select to authenticated using (true);
create policy "admin manages profiles" on public.profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated can read categories" on public.categories
for select to authenticated using (true);
create policy "admin manages categories" on public.categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated can read published memories" on public.memories
for select to authenticated using (is_published or public.is_admin());
create policy "admin manages memories" on public.memories
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated can read profile memory links" on public.profile_memories
for select to authenticated using (true);
create policy "admin manages profile memory links" on public.profile_memories
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "users read own favorites" on public.favorites
for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "users insert own favorites" on public.favorites
for insert to authenticated with check (user_id = auth.uid() and not public.is_admin());
create policy "users delete own favorites" on public.favorites
for delete to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "users read own watch progress" on public.watch_progress
for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "users insert own watch progress" on public.watch_progress
for insert to authenticated with check (user_id = auth.uid() and not public.is_admin());
create policy "users update own watch progress" on public.watch_progress
for update to authenticated using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- Create a Storage bucket named memory-media with Public bucket OFF.
create policy "authenticated can view private memory media" on storage.objects
for select to authenticated using (bucket_id = 'memory-media');
create policy "admins upload private memory media" on storage.objects
for insert to authenticated with check (bucket_id = 'memory-media' and public.is_admin());
create policy "admins update private memory media" on storage.objects
for update to authenticated using (bucket_id = 'memory-media' and public.is_admin())
with check (bucket_id = 'memory-media' and public.is_admin());
create policy "admins delete private memory media" on storage.objects
for delete to authenticated using (bucket_id = 'memory-media' and public.is_admin());
