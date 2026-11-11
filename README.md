# OUR LITTLE UNIVERSE — V9

A private, Netflix-inspired memory streaming site built with React, Vite and Supabase.

## V9 changes
- Fixes category routing: each profile has its own category records and each profile-memory assignment stores its own category.
- Admin can create profile-specific categories and upload a category poster and background.
- Includes a starter **My Websites & AI Creations** category for every profile. Upload a website walkthrough as a video memory, with its own poster and cinematic background.
- Each memory can be highlighted for one profile. The newest highlighted item appears in a cinematic 10-second intro the first time that profile opens it, then remains in **Newly Added**.
- Each profile has its own editable homepage title, description, labels and background image.
- Migration 005 creates the missing legacy `site_settings` table and the per-profile `profile_site_settings` table, fixing the earlier schema-cache error.
- Keeps separate profile passwords, profile pictures/covers, profile-assigned private media, and admin-only media writes.

## 1. Install and configure

Open the inner `our-little-universe` folder (the folder containing `package.json`). Copy your existing `.env.local` from the previous project into this folder. It must contain your Supabase project URL and publishable key:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Never put an `sb_secret_...` or service-role key in `.env.local` or browser code.

```powershell
npm install
npm run dev
```

## 2. Apply database migrations

In Supabase SQL Editor, run these files in order if they have not already been applied:

1. `supabase/migrations/004_fix_memory_categories.sql`
2. `supabase/migrations/005_profile_homepages_and_category_sync.sql`
3. `supabase/migrations/006_profile_categories_new_arrivals.sql`

Do not rerun migrations 001–003 if they have already been applied. Migrations 004–006 are designed to be re-runnable for their added objects. Migration 005 creates the missing `site_settings` and `profile_site_settings` tables and asks PostgREST to reload its schema cache.

## 3. Deploy Edge Functions

From this project folder:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy admin-create-profile
npx supabase functions deploy profile-picker
```

The profile picker returns display-safe profile data and short-lived signed avatar/cover URLs. The `admin-create-profile` function creates and maintains profile Auth users. Supabase provides the service-role secret to Edge Functions server-side; do not copy it into frontend env files.

## 4. Verify V9

1. Sign in as Admin and confirm all profiles appear.
2. Open **Categories**, select one profile, and create a test category with a poster and background. Repeat with a different profile and verify its category list is separate.
3. Open **Add memories**, select one or more profiles, choose/type a category, upload a test video or photo, add an optional poster and background, and enable **New & Highlight**.
4. Sign out and sign in to one assigned profile. Confirm the highlighted item appears for 10 seconds and then remains in **Newly Added**.
5. Confirm the item appears under the category selected for that profile, not under Our Story.
6. Open **Homepage design**, select each profile, and save a different title and background for each.
7. Sign in as a second profile and verify the first profile's memories, categories and artwork are not visible.

## Important

This ZIP is a source update, not a completed production deployment. Test with two separate viewer profiles before uploading private real media. Private Storage signed URLs are temporary; the app creates them after login. A website cannot prevent screenshots or screen recording. Keep a backup of your current project and run the production build before deployment.


## V10 — Profile homepage background video

Run `supabase/migrations/008_profile_homepage_background_video.sql` after migrations 001–007. In Admin Dashboard → Homepage design, select a profile and upload a background video (MP4/WebM) in addition to its fallback image. Each profile stores its own video path. The viewer homepage uses a muted, looping, inline video with the image as poster/fallback. Keep the original media file in private Supabase Storage; practical playback resolution depends on browser/device/network and your Supabase storage/bandwidth limits.
