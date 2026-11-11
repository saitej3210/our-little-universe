-- OUR LITTLE UNIVERSE V5: individual profiles, per-profile auth, scoped media
create extension if not exists pgcrypto;

alter table public.profiles add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;
alter table public.profiles add column if not exists login_email text unique;
alter table public.profiles add column if not exists cover_path text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.memories add column if not exists category text;
update public.memories m set category = c.name from public.categories c where m.category_id = c.id and m.category is null;
alter table public.memories alter column category set default 'Our Story';

-- Login screen can see only the safe profile-picker fields, never passwords or auth metadata.
create or replace function public.list_profiles_for_login()
returns table(id uuid, name text, login_email text, avatar_path text, cover_path text, accent_color text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.login_email, p.avatar_path, p.cover_path, p.accent_color
  from public.profiles p
  where p.login_email is not null
  order by p.sort_order, p.created_at;
$$;
grant execute on function public.list_profiles_for_login() to anon, authenticated;

-- Tighten profile and content reads to the currently authenticated profile.
drop policy if exists "authenticated can read profiles" on public.profiles;
drop policy if exists "admin manages profiles" on public.profiles;
create policy "admin manages profiles" on public.profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "viewer reads own profile" on public.profiles
for select to authenticated using (id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid or public.is_admin());

drop policy if exists "authenticated can read published memories" on public.memories;
drop policy if exists "admin manages memories" on public.memories;
create policy "admin manages memories" on public.memories
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "viewer reads assigned published memories" on public.memories
for select to authenticated using (
  public.is_admin() or (
    is_published
    and exists (
      select 1 from public.profile_memories pm
      where pm.memory_id = memories.id
      and pm.profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
    )
  )
);

drop policy if exists "authenticated can read profile memory links" on public.profile_memories;
drop policy if exists "admin manages profile memory links" on public.profile_memories;
create policy "admin manages profile memory links" on public.profile_memories
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "viewer reads own memory links" on public.profile_memories
for select to authenticated using (profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid or public.is_admin());

drop policy if exists "users read own favorites" on public.favorites;
drop policy if exists "users insert own favorites" on public.favorites;
drop policy if exists "users delete own favorites" on public.favorites;
create policy "profile users read own favorites" on public.favorites
for select to authenticated using (user_id = auth.uid() and profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid or public.is_admin());
create policy "profile users insert own favorites" on public.favorites
for insert to authenticated with check (user_id = auth.uid() and profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid and not public.is_admin());
create policy "profile users delete own favorites" on public.favorites
for delete to authenticated using (user_id = auth.uid() and profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid or public.is_admin());

drop policy if exists "users read own watch progress" on public.watch_progress;
drop policy if exists "users insert own watch progress" on public.watch_progress;
drop policy if exists "users update own watch progress" on public.watch_progress;
create policy "profile users read own watch progress" on public.watch_progress
for select to authenticated using (user_id = auth.uid() and profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid or public.is_admin());
create policy "profile users insert own watch progress" on public.watch_progress
for insert to authenticated with check (user_id = auth.uid() and profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid and not public.is_admin());
create policy "profile users update own watch progress" on public.watch_progress
for update to authenticated using (user_id = auth.uid() and profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid or public.is_admin())
with check (user_id = auth.uid() and profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid or public.is_admin());

-- Replace broad Storage SELECT with profile-scoped access. Covers, posters and originals
-- are readable only by their assigned profile; admins can manage all objects.
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
            and (p.cover_path = name or p.avatar_path = name)
        )
        or exists (
          select 1 from public.memories m
          join public.profile_memories pm on pm.memory_id = m.id
          where pm.profile_id = (auth.jwt() -> 'app_metadata' ->> 'profile_id')::uuid
            and (m.media_path = name or m.poster_path = name)
        )
      )
    )
  )
);

-- Existing admin INSERT/UPDATE/DELETE policies are retained; force role-based checks.
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

-- Do not expose service-role credentials in the browser. The Edge Function creates
-- each profile's Supabase Auth user and writes app_metadata.role/profile_id.
