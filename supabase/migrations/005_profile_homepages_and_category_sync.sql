-- OUR LITTLE UNIVERSE V8
-- Fixes category labels and gives every viewer profile its own editable homepage.

-- Keep the legacy global settings table available for older clients/migrations.
create table if not exists public.site_settings (
  id text primary key check (id = 'main'),
  hero_title text not null default 'Little',
  hero_emphasis text not null default 'Adventures.',
  hero_subtitle text not null default 'New roads, unexpected turns, and the little moments that made every journey ours.',
  hero_kicker text not null default 'OUR LITTLE UNIVERSE ORIGINAL',
  hero_collection_label text not null default 'OUR STORY COLLECTION',
  hero_type_label text not null default 'MEMORY FILM',
  hero_background_path text,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values ('main') on conflict (id) do nothing;
alter table public.site_settings enable row level security;
drop policy if exists "authenticated can read homepage settings" on public.site_settings;
drop policy if exists "admins manage homepage settings" on public.site_settings;
create policy "authenticated can read homepage settings" on public.site_settings
  for select to authenticated using (true);
create policy "admins manage homepage settings" on public.site_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.site_settings to authenticated;

-- Per-profile hero content/background. Each viewer can read only their own row.
create table if not exists public.profile_site_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  hero_title text not null default 'A little world',
  hero_emphasis text not null default 'of our own.',
  hero_subtitle text not null default 'The moments, places and people that make this profile special.',
  hero_kicker text not null default 'A PRIVATE COLLECTION',
  hero_collection_label text not null default 'PERSONAL MEMORIES',
  hero_type_label text not null default 'MADE JUST FOR YOU',
  hero_background_path text,
  updated_at timestamptz not null default now()
);
alter table public.profile_site_settings enable row level security;
drop policy if exists "viewers read own homepage settings" on public.profile_site_settings;
drop policy if exists "admins manage profile homepage settings" on public.profile_site_settings;
create policy "viewers read own homepage settings" on public.profile_site_settings
  for select to authenticated using (
    public.is_admin()
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'viewer'
      and profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
    )
  );
create policy "admins manage profile homepage settings" on public.profile_site_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.profile_site_settings to authenticated;

-- Backfill one independent homepage row per existing viewer profile.
insert into public.profile_site_settings (profile_id)
select id from public.profiles
on conflict (profile_id) do nothing;

-- The legacy category text had a default of 'Our Story'. Synchronize it from category_id.
update public.memories m
set category = c.name
from public.categories c
where m.category_id = c.id
  and m.category is distinct from c.name;

create or replace function public.sync_memory_category_from_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is not null then
    select c.name into new.category
    from public.categories c
    where c.id = new.category_id;
  end if;
  return new;
end;
$$;
drop trigger if exists memories_sync_category_from_id on public.memories;
create trigger memories_sync_category_from_id
before insert or update of category_id on public.memories
for each row execute function public.sync_memory_category_from_id();

-- Viewers can read their own profile assets, assigned memories and their own homepage hero.
drop policy if exists "profiles can view assigned private media" on storage.objects;
drop policy if exists "authenticated can view private memory media" on storage.objects;
create policy "profiles can view assigned private media" on storage.objects
for select to authenticated using (
  bucket_id = 'memory-media'
  and (
    public.is_admin()
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'viewer'
      and (
        exists (
          select 1 from public.profiles p
          where p.id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
            and (p.cover_path = storage.objects.name or p.avatar_path = storage.objects.name)
        )
        or exists (
          select 1 from public.memories m
          join public.profile_memories pm on pm.memory_id = m.id
          where pm.profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
            and (m.media_path = storage.objects.name or m.poster_path = storage.objects.name)
        )
        or exists (
          select 1 from public.profile_site_settings ps
          where ps.profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
            and ps.hero_background_path = storage.objects.name
        )
        or exists (
          select 1 from public.site_settings ss
          where ss.id = 'main' and ss.hero_background_path = storage.objects.name
        )
      )
    )
  )
);

-- Explicitly keep all writes admin-only.
drop policy if exists "admins upload private memory media" on storage.objects;
drop policy if exists "admins update private memory media" on storage.objects;
drop policy if exists "admins delete private memory media" on storage.objects;
create policy "admins upload private memory media" on storage.objects
for insert to authenticated with check (bucket_id = 'memory-media' and public.is_admin());
create policy "admins update private memory media" on storage.objects
for update to authenticated using (bucket_id = 'memory-media' and public.is_admin())
with check (bucket_id = 'memory-media' and public.is_admin());
create policy "admins delete private memory media" on storage.objects
for delete to authenticated using (bucket_id = 'memory-media' and public.is_admin());

-- Ask PostgREST to refresh its schema cache (fixes "table not found in schema cache").
notify pgrst, 'reload schema';
