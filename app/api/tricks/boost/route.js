import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendJackpotRequestPing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

const WINDOW_HOURS = 18;

// Any signed-in player can call this — Jackpot is self-directed (there's
// no target, unlike Leroy), so all this route checks is: you're a real
// player, there's an event actually running, and you haven't already
// used your one activation this event. The doubling itself doesn't
// happen here — same as Leroy, this just plants a marker with a shelf
// life that saveEvent (lib/useBoardData.js) resolves the next time you
// play any round, within the window, and only once an admin's confirmed
// it (see app/api/admin/confirm-boost).
//
// Unlike Leroy, this request is announced to the WHOLE roster the moment
// it goes in — that's deliberate, not an oversight: public pressure is
// part of what makes "confirm it before you know the result" actually
// hold up socially, and it gives everyone else a reason to go watch
// whether whoever's asking actually pulls it off.
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

  const { data: me } = await supabaseAdmin
    .from("players")
    .select("id, name")
    .eq("user_id", callerId)
    .maybeSingle();
  if (!me) {
    return NextResponse.json({ error: "No player profile is linked to your account." }, { status: 400 });
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

  const { data: already } = await supabaseAdmin
    .from("point_boosts")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("player_id", me.id)
    .maybeSingle();
  if (already) {
    return NextResponse.json({ error: "You've already used Jackpot this event." }, { status: 400 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000);
  const { error: insertError } = await supabaseAdmin.from("point_boosts").insert({
    trip_id: trip.id,
    player_id: me.id,
    activated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const { data: roster } = await supabaseAdmin
    .from("trip_players")
    .select("player_id")
    .eq("trip_id", trip.id);
  const rosterIds = (roster || []).map((r) => r.player_id);

  const pingTitle = `👀 Look out, ${me.name}'s getting ahead of themselves`;
  const pingBody = "Let's see if Barry Big Bollocks bottles it.";
  await Promise.all(
    rosterIds.map((playerId) =>
      recordNotification(playerId, { kind: "jackpot", title: pingTitle, body: pingBody, url: "/tricks" })
    )
  );

  if (pushConfigured && rosterIds.length) {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .in("player_id", rosterIds);
    if (subs?.length) {
      const deadIds = await sendJackpotRequestPing(subs, pingTitle);
      if (deadIds.length) {
        await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
      }
    }
  }

  return NextResponse.json({ activated: true });
}
