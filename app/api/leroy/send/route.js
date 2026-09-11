import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";

const AMOUNT = 5;

// Any signed-in player can call this — sending Leroy is a player action,
// not an admin one. What this route actually enforces server-side: you're
// a real player on the current event's roster, you're picking someone
// else on that roster, and you haven't already used your one send this
// event.
//
// Deliberately silent: no notification, no push, nothing. The whole point
// is the target has no idea — they only find out once he actually
// strikes (see app/api/leroy/reveal, called from saveEvent in
// lib/useBoardData.js the next time the target plays any round).
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
  const targetId = body.targetId;
  if (!targetId) {
    return NextResponse.json({ error: "Pick who to send him after." }, { status: 400 });
  }

  const { data: me } = await supabaseAdmin
    .from("players")
    .select("id, name")
    .eq("user_id", callerId)
    .maybeSingle();
  if (!me) {
    return NextResponse.json({ error: "No player profile is linked to your account." }, { status: 400 });
  }
  if (me.id === targetId) {
    return NextResponse.json({ error: "Pick someone else. This is about them, not you." }, { status: 400 });
  }

  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("id")
    .in("status", ["active", "tied"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "There's no event running." }, { status: 400 });
  }

  const { data: onRoster } = await supabaseAdmin
    .from("trip_players")
    .select("player_id")
    .eq("trip_id", trip.id)
    .eq("player_id", targetId)
    .maybeSingle();
  if (!onRoster) {
    return NextResponse.json({ error: "That player isn't on this event's roster." }, { status: 400 });
  }

  const { data: alreadySent } = await supabaseAdmin
    .from("leroy_sends")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("sender_id", me.id)
    .maybeSingle();
  if (alreadySent) {
    return NextResponse.json({ error: "You've already sent Leroy this event." }, { status: 400 });
  }

  const { error: insertError } = await supabaseAdmin.from("leroy_sends").insert({
    trip_id: trip.id,
    sender_id: me.id,
    target_id: targetId,
    amount: AMOUNT,
    sent_at: new Date().toISOString(),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ sent: true });
}
