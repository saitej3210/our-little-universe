-- V10: individual profile homepage background video support.
alter table public.profile_site_settings
  add column if not exists hero_background_video_path text;

-- Allow a viewer to read only their own homepage background video object.
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
            and (ps.hero_background_path = storage.objects.name or ps.hero_background_video_path = storage.objects.name)
        )
        or exists (
          select 1 from public.profile_categories pc
          where pc.profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
            and (pc.poster_path = storage.objects.name or pc.background_path = storage.objects.name or pc.background_video_path = storage.objects.name)
        )
      )
    )
  )
);
notify pgrst, 'reload schema';
