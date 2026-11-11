-- OUR LITTLE UNIVERSE V6: editable Netflix-style homepage experience
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

grant select, insert, update on public.site_settings to authenticated;

-- Let authenticated profiles read only the configured global hero background in addition
-- to their own assigned memory/profile images. Upload/update/delete remain admin-only.
drop policy if exists "profiles can view assigned private media" on storage.objects;
create policy "profiles can view assigned private media" on storage.objects
for select to authenticated using (
  bucket_id = 'memory-media'
  and (
    public.is_admin()
    or exists (
      select 1 from public.site_settings s
      where s.id = 'main' and s.hero_background_path = storage.objects.name
    )
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
      )
    )
  )
);
