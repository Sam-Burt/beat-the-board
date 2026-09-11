import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";
import { isGayCardBlackout, GAY_CARD_BLACKOUT_MESSAGE } from "../../../../lib/gayCardBlackout";

// The current holder presses this themselves, witnessed by whoever just
// caught them red-handed — there's no technical verification of that,
// it's a social-trust thing same as the rest of this game. Counts exactly
// like a real pass for the secret tally (another 2 points off them at the
// end), but the card stays put: nobody else's holder_id changes.
export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server isn't configured with SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const callerId = await getAuthedUser(request);
  if (!callerId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  if (isGayCardBlackout()) {
    return NextResponse.json({ error: GAY_CARD_BLACKOUT_MESSAGE }, { status: 400 });
  }

  const { data: me } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("user_id", callerId)
    .maybeSingle();
  if (!me) {
    return NextResponse.json({ error: "No player profile is linked to your account." }, { status: 400 });
  }

  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("id, hot_potato_enabled")
    .in("status", ["active", "tied"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trip?.hot_potato_enabled) {
    return NextResponse.json({ error: "Gay Card isn't switched on for this event." }, { status: 400 });
  }

  const { data: state } = await supabaseAdmin
    .from("hot_potato_state")
    .select("trip_id, holder_id")
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!state || state.holder_id !== me.id) {
    return NextResponse.json({ error: "You're not holding the Gay Card right now." }, { status: 403 });
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("hot_potato_history")
    .insert({ trip_id: trip.id, from_player_id: me.id, to_player_id: me.id, self_caught: true });

  await supabaseAdmin.from("hot_potato_state").update({ last_passed_at: now }).eq("trip_id", trip.id);

  return NextResponse.json({ caught: true });
}
