import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { finalizeTrip } from "../../../lib/tripFinalize";
import { processDueMissions } from "../../../lib/processDue";

// The heartbeat. Everything time-based in this app used to depend on
// somebody happening to open it: scheduled missions only went out when any
// player's device checked in, and an event only finalized (trophy awarded,
// Gay Card penalty applied, "it's over" alert sent to everyone) when the
// ADMIN specifically opened the app. Miss the deadline by a night's sleep
// and nobody heard anything until morning.
//
// A cron job on samburt.co.uk hits this every few minutes instead, so both
// happen on time regardless of who's looking. The app-open checks are
// deliberately left in place as a backstop.
//
// A cron isn't a signed-in person, so it can't authenticate the way every
// other route here does. It presents a shared secret instead: CRON_SECRET,
// set in the Vercel environment variables, sent as the x-cron-secret
// header. Without that lock anyone who found this URL could end an event
// early, mid-holiday.
async function handle(request) {
  const expected = process.env.CRON_SECRET;
  // No secret configured means no way to tell a real caller from anyone
  // else, so refuse outright rather than defaulting to open.
  if (!expected) {
    return NextResponse.json({ error: "Server isn't configured with CRON_SECRET." }, { status: 500 });
  }
  if (request.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server isn't configured with SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  // Finalize the current event if its deadline has passed. finalizeTrip
  // claims the trip atomically, so the cron racing a player's device (or
  // itself, on a slow run) can't award two trophies or double-send the
  // "it's over" alert.
  let finalized = null;
  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("*")
    .eq("status", "active")
    .not("deadline", "is", null)
    .lte("deadline", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (trip) {
    const result = await finalizeTrip(trip);
    finalized = result.error ? { error: result.error } : { trip: trip.name, ...result };
  }

  // Deliberately after the finalize above. If the cron has been down and is
  // catching up, a mission that came due before the deadline but wasn't sent
  // in time is void rather than late — finalizing first clears the queue, so
  // nobody gets handed a task for an event they can no longer score in.
  const missions = await processDueMissions();

  return NextResponse.json({ ok: true, finalized, missions });
}

export async function GET(request) {
  return handle(request);
}

// Some cron services only send POST. Same job either way.
export async function POST(request) {
  return handle(request);
}
