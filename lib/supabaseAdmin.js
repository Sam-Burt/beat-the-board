// SERVER-ONLY. Never import this file from a "use client" component — it
// uses the Supabase service role key, which can read and write anything in
// the project regardless of RLS. It must only ever run inside API routes
// (app/api/**/route.js), which execute on Vercel's servers, not in the
// visitor's browser.
//
// Requires SUPABASE_SERVICE_ROLE_KEY to be set (Supabase → Settings → API
// → service_role key — the "secret" one, not the "anon public" one) as a
// plain (non-NEXT_PUBLIC_) environment variable, so Next.js never ships it
// to the client bundle.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// Verifies the bearer token from an incoming request actually belongs to a
// signed-in user, then checks that user is in the admins table. Returns the
// caller's user id if they're a genuine admin, or null otherwise. Every API
// route below must call this before doing anything privileged — the
// service role key bypasses RLS entirely, so this check IS the security
// boundary for these routes.
export async function requireAdmin(request) {
  if (!supabaseAdmin) return null;
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: adminRow } = await supabaseAdmin
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return adminRow ? userData.user.id : null;
}

// Like requireAdmin, but for routes any signed-in user can call (not just
// the admin) — e.g. a player changing their own profile. Verifies the
// bearer token belongs to a real signed-in user and returns their id, or
// null if not. Does NOT check the admins table.
export async function getAuthedUser(request) {
  if (!supabaseAdmin) return null;
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return null;
  return userData.user.id;
}

export async function isAdminUser(userId) {
  if (!supabaseAdmin || !userId) return false;
  const { data } = await supabaseAdmin
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}
