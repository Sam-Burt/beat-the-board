import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendLeroyPing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

const AMOUNT = 5;
const WINDOW_HOURS = 18;

// Any signed-in player can call this — sending Leroy is a player action,
// not an admin one. What this route actually enforces server-side: you're
// a real player on the current event's roster, you're picking someone
// else on that roster, and you haven't already used your one send this
// event. The steal itself doesn't happen here — it's just a marker with a
// shelf life (see saveEvent in lib/useBoardData.js, which resolves it the
// next time the target plays any round, within the window).
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

  const now = new Date();
  const expiresAt = new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000);
  const { error: insertError } = await supabaseAdmin.from("leroy_sends").insert({
    trip_id: trip.id,
    sender_id: me.id,
    target_id: targetId,
    amount: AMOUNT,
    sent_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const pingBody = `${me.name} has sent Leroy to steal your shit!`;
  await recordNotification(targetId, {
    kind: "leroy",
    title: "🥷 Leroy's on his way",
    body: pingBody,
    url: "/leroy",
  });

  if (!pushConfigured) {
    return NextResponse.json({ sent: true, pushed: 0, pushConfigured: false });
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("player_id", targetId);

  let pushed = 0;
  if (subs?.length) {
    const deadIds = await sendLeroyPing(subs, pingBody);
    pushed = subs.length - deadIds.length;
    if (deadIds.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
    }
  }

  return NextResponse.json({ sent: true, pushed, pushConfigured: true });
}
