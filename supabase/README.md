# Supabase setup

Apply migrations in order:
1. `migrations/001_initial_private_schema.sql` (already applied in V4)
2. `migrations/002_v5_individual_profiles.sql` (already applied in V5)
3. `migrations/003_v6_homepage_experience.sql` (new in V6)

Deploy Edge Functions from the project root:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy admin-create-profile
npx supabase functions deploy profile-picker
```

`profile-picker` has JWT verification disabled in `config.toml` intentionally because it runs before a viewer signs in. It returns only display-safe profile fields and 5-minute signed image URLs. It does not return passwords, auth user IDs, or stored login email values. The browser derives the synthetic login email from the profile UUID.

Never put the Supabase service-role/secret key in a `VITE_` variable or browser code. Supabase provides `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically.
