import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { finalizeTrip } from "../../../../lib/tripFinalize";

// Ends the current trip and, if there's a single clear top scorer, awards
// them the trophy. Called two ways: automatically (useBoardData checks on
// load whether the current trip's deadline has passed and, if so, calls
// this once) and manually (the admin's "End trip now" button, for wrapping
// up early) — same logic either way, just triggered differently. If the
// top of the leaderboard is tied, the trip is marked "tied" instead and no
// trophy is awarded yet — see declare-trip-winner/route.js, which an admin
// uses to break the tie by hand.
export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server isn't configured with SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const callerId = await requireAdmin(request);
  if (!callerId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("*")
    .in("status", ["active", "tied"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "There's no trip currently running." }, { status: 400 });
  }

  const result = await finalizeTrip(trip);
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
