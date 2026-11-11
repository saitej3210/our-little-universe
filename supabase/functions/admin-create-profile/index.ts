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

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const admin = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user || user.app_metadata?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const serviceClient = createClient(url, service);
  const body = await req.json();
  if (body.action === "delete") {
    const { data: profile, error: findError } = await serviceClient.from("profiles").select("auth_user_id").eq("id", body.profileId).single();
    if (findError) return new Response(JSON.stringify({ error: findError.message }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    if (profile?.auth_user_id) {
      const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(profile.auth_user_id);
      if (deleteAuthError) return new Response(JSON.stringify({ error: deleteAuthError.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    await serviceClient.from("profiles").delete().eq("id", body.profileId);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
  if (body.action === "name") {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 50) return new Response(JSON.stringify({ error: "Profile name must be 1–50 characters." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const { error: updateError } = await serviceClient.from("profiles").update({ name: body.name.trim() }).eq("id", body.profileId);
    if (updateError) return new Response(JSON.stringify({ error: updateError.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
  if (body.action === "password") {
    const { data: profile, error: findError } = await serviceClient.from("profiles").select("auth_user_id").eq("id", body.profileId).single();
    if (findError || !profile?.auth_user_id) return new Response(JSON.stringify({ error: "Profile not found." }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) return new Response(JSON.stringify({ error: "Password must be 8–128 characters." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const { error: passwordError } = await serviceClient.auth.admin.updateUserById(profile.auth_user_id, { password: body.password });
    if (passwordError) return new Response(JSON.stringify({ error: passwordError.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const { name, password, accent_color = "#8b4962" } = body;
  if (typeof name !== "string" || name.trim().length < 1 || name.length > 50 || typeof password !== "string" || password.length < 8 || password.length > 128) {
    return new Response(JSON.stringify({ error: "Enter a profile name and a password between 8 and 128 characters." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const profileId = crypto.randomUUID();
  const loginEmail = `profile-${profileId}@ourlittleuniverse.app`;
  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email: loginEmail,
    password,
    email_confirm: true,
    app_metadata: { role: "viewer", profile_id: profileId },
    user_metadata: {},
  });
  if (createError || !created.user) {
    return new Response(JSON.stringify({ error: createError?.message || "Could not create profile login." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const { error: insertError } = await serviceClient.from("profiles").insert({
    id: profileId,
    name: name.trim(),
    accent_color,
    auth_user_id: created.user.id,
    login_email: loginEmail,
  });
  if (insertError) {
    await serviceClient.auth.admin.deleteUser(created.user.id);
    return new Response(JSON.stringify({ error: insertError.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ profile: { id: profileId, name: name.trim() } }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
