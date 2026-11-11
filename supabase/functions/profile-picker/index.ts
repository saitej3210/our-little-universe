import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return new Response(JSON.stringify({ error: "Server configuration is incomplete." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  // Public endpoint intentionally returns only display-safe profile data and short-lived
  // signed image URLs. It never returns passwords, auth IDs, or stored login email values.
  const admin = createClient(url, service);
  const { data, error } = await admin.from("profiles")
    .select("id,name,avatar_path,cover_path,accent_color,sort_order,created_at")
    .not("login_email", "is", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  const profiles = await Promise.all((data || []).map(async (profile) => {
    const [avatar, cover] = await Promise.all([
      profile.avatar_path ? admin.storage.from("memory-media").createSignedUrl(profile.avatar_path, 300) : Promise.resolve({ data: null }),
      profile.cover_path ? admin.storage.from("memory-media").createSignedUrl(profile.cover_path, 300) : Promise.resolve({ data: null }),
    ]);
    return {
      id: profile.id,
      name: profile.name,
      accent_color: profile.accent_color,
      // Synthetic login identifier is derived from the profile UUID; the stored email is not exposed.
      login_email: `profile-${profile.id}@ourlittleuniverse.app`,
      avatar_url: avatar.data?.signedUrl || "",
      cover_url: cover.data?.signedUrl || "",
    };
  }));

  return new Response(JSON.stringify({ profiles }), { status: 200, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
