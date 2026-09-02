import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Doesn't throw at import time (that would break the build) — components
  // that need a working client check `supabase` for null and show a setup
  // message instead.
  console.warn(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — " +
      "set them in .env.local (local dev) or your Vercel project's " +
      "Environment Variables (deployed)."
  );
}

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
