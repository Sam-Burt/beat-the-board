import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendHotPotatoPing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

// Any signed-in player can call this — not just the admin — but only the
// player who's actually holding the Gay Card right now is allowed to move
// it (internal code/table names still say "hot potato" — see the project
// doc), and only onto someone else on the same event's roster. That check
// is what this route exists to enforce server-side (the client never gets
// to just declare who holds it).
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

  const body = await request.json().catch(() => ({}));
  const toPlayerId = body.toPlayerId;
  const note = (body.note || "").trim();
  if (!toPlayerId) {
    return NextResponse.json({ error: "Pick who you passed it to." }, { status: 400 });
  }

  const { data: me } = await supabaseAdmin
    .from("players")
    .select("id, name")
    .eq("user_id", callerId)
    .maybeSingle();
  if (!me) {
    return NextResponse.json({ error: "No player profile is linked to your account." }, { status: 400 });
  }
  if (me.id === toPlayerId) {
    return NextResponse.json({ error: "Pick someone else to pass it to." }, { status: 400 });
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

  const { data: onRoster } = await supabaseAdmin
    .from("trip_players")
    .select("player_id")
    .eq("trip_id", trip.id)
    .eq("player_id", toPlayerId)
    .maybeSingle();
  if (!onRoster) {
    return NextResponse.json({ error: "That player isn't on this event's roster." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: stateError } = await supabaseAdmin
    .from("hot_potato_state")
    .update({ holder_id: toPlayerId, note, last_passed_at: now })
    .eq("trip_id", trip.id);
  if (stateError) return NextResponse.json({ error: stateError.message }, { status: 400 });

  await supabaseAdmin
    .from("hot_potato_history")
    .insert({ trip_id: trip.id, from_player_id: me.id, to_player_id: toPlayerId, note });

  const pingBody = `${me.name} has passed the card to you…`;
  await recordNotification(toPlayerId, {
    kind: "hot_potato",
    title: "Whoops 🌈",
    body: pingBody,
    url: "/hot-potato",
  });

  if (pushConfigured) {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("player_id", toPlayerId);
    if (subs?.length) {
      const deadIds = await sendHotPotatoPing(subs, pingBody);
      if (deadIds.length) {
        await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
      }
    }
  }

  return NextResponse.json({ passed: true });
}
