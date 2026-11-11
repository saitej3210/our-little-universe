-- OUR LITTLE UNIVERSE V9
-- Per-profile categories, custom category artwork, website/AI-project collections,
-- and a per-profile New & Highlight experience.

create table if not exists public.profile_categories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  poster_path text,
  background_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (profile_id, name)
);

alter table public.profile_memories
  add column if not exists profile_category_id uuid references public.profile_categories(id) on delete set null,
  add column if not exists is_highlighted boolean not null default false;

alter table public.memories
  add column if not exists memory_background_path text,
  add column if not exists external_url text,
  add column if not exists is_highlighted boolean not null default false;

alter table public.profile_categories enable row level security;
drop policy if exists "viewers read own profile categories" on public.profile_categories;
drop policy if exists "admins manage profile categories" on public.profile_categories;
create policy "viewers read own profile categories" on public.profile_categories
  for select to authenticated using (
    public.is_admin() or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'viewer'
      and profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
    )
  );
create policy "admins manage profile categories" on public.profile_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.profile_categories to authenticated;

-- Seed independent starter categories for every existing profile.
insert into public.profile_categories (profile_id, name, sort_order)
select p.id, v.name, v.sort_order
from public.profiles p
cross join (values
  ('Our Story', 1),
  ('Travel Diaries', 2),
  ('Funny Moments', 3),
  ('Birthdays', 4),
  ('Favourite Moments', 5),
  ('Letters & Messages', 6),
  ('My Websites & AI Creations', 7)
) as v(name, sort_order)
on conflict (profile_id, name) do nothing;

-- Backfill each existing profile-memory link into that profile's own category.
insert into public.profile_categories (profile_id, name)
select distinct pm.profile_id, coalesce(nullif(trim(m.category), ''), 'Our Story')
from public.profile_memories pm
join public.memories m on m.id = pm.memory_id
on conflict (profile_id, name) do nothing;
update public.profile_memories pm
set profile_category_id = pc.id
from public.memories m, public.profile_categories pc
where m.id = pm.memory_id
  and pc.profile_id = pm.profile_id
  and pc.name = coalesce(nullif(trim(m.category), ''), 'Our Story')
  and pm.profile_category_id is distinct from pc.id;

-- Ensure every profile created in the future receives its own homepage row and categories.
create or replace function public.initialize_profile_universe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile_site_settings (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  insert into public.profile_categories (profile_id, name, sort_order)
  values
    (new.id, 'Our Story', 1),
    (new.id, 'Travel Diaries', 2),
    (new.id, 'Funny Moments', 3),
    (new.id, 'Birthdays', 4),
    (new.id, 'Favourite Moments', 5),
    (new.id, 'Letters & Messages', 6),
    (new.id, 'My Websites & AI Creations', 7)
  on conflict (profile_id, name) do nothing;
  return new;
end;
$$;
drop trigger if exists profiles_initialize_universe on public.profiles;
create trigger profiles_initialize_universe
after insert on public.profiles
for each row execute function public.initialize_profile_universe();

-- Profile-specific media access includes category artwork and project backgrounds.
drop policy if exists "profiles can view assigned private media" on storage.objects;
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
            and (m.media_path = storage.objects.name or m.poster_path = storage.objects.name or m.memory_background_path = storage.objects.name)
        )
        or exists (
          select 1 from public.profile_site_settings ps
          where ps.profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
            and ps.hero_background_path = storage.objects.name
        )
        or exists (
          select 1 from public.profile_categories pc
          where pc.profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
            and (pc.poster_path = storage.objects.name or pc.background_path = storage.objects.name)
        )
      )
    )
  )
);

-- All media writes remain administrator-only.
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

notify pgrst, 'reload schema';
