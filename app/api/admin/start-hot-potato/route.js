import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendHotPotatoPing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

// Randomly deals the Gay Card to one player on the current event's roster
// (internal code/table names still say "hot potato" — see the project doc
// for why: same UI-text-vs-code split as trip/Event). Only ever needed once
// per event — if it's already running, this just tells the admin that
// instead of re-rolling who has it.
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
    .select("id, status, hot_potato_enabled")
    .in("status", ["active", "tied"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "There's no event currently running." }, { status: 400 });
  }
  if (!trip.hot_potato_enabled) {
    return NextResponse.json(
      { error: "Gay Card isn't switched on for this event." },
      { status: 400 }
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("hot_potato_state")
    .select("trip_id, holder_id")
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (existing?.holder_id) {
    return NextResponse.json({ error: "Gay Card is already in play for this event." }, { status: 400 });
  }

  const { data: roster } = await supabaseAdmin
    .from("trip_players")
    .select("player_id")
    .eq("trip_id", trip.id);
  if (!roster?.length) {
    return NextResponse.json({ error: "This event has no players on its roster." }, { status: 400 });
  }

  const holderId = roster[Math.floor(Math.random() * roster.length)].player_id;
  const now = new Date().toISOString();

  const { error: stateError } = await supabaseAdmin.from("hot_potato_state").upsert(
    { trip_id: trip.id, holder_id: holderId, note: "", started_at: now, last_passed_at: now },
    { onConflict: "trip_id" }
  );
  if (stateError) return NextResponse.json({ error: stateError.message }, { status: 400 });

  await supabaseAdmin
    .from("hot_potato_history")
    .insert({ trip_id: trip.id, from_player_id: null, to_player_id: holderId, note: "Game started" });

  const body = "You've been dealt the card…";
  await recordNotification(holderId, {
    kind: "hot_potato",
    title: "Whoops 🌈",
    body,
    url: "/hot-potato",
  });

  if (pushConfigured) {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("player_id", holderId);
    if (subs?.length) {
      const deadIds = await sendHotPotatoPing(subs, body);
      if (deadIds.length) {
        await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
      }
    }
  }

  return NextResponse.json({ started: true });
}
