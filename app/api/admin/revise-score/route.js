import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { totals } from "../../../../lib/points";
import { pushConfigured, sendVarPing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

// The one deliberate way to change a score after an event's already
// finalized — someone's mission proof turns out to be fake, or similar.
// Only reachable for the CURRENT trip (the one still showing as "last
// results"), and only once it's actually finalized; a live event just uses
// the normal point_adjustments write (see lib/useBoardData.js's
// addPointAdjustment, which routes here itself once the trip's finalized).
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

  const body = await request.json().catch(() => ({}));
  const playerId = body.playerId;
  const amount = Number(body.amount);
  const note = (body.note || "").trim();
  if (!playerId || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "playerId and a non-zero amount are required." }, { status: 400 });
  }

  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("*")
    .eq("status", "finalized")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json(
      { error: "There's no finalized event to revise — the normal points control handles a live one." },
      { status: 400 }
    );
  }

  const { error: insertError } = await supabaseAdmin.from("point_adjustments").insert({
    trip_id: trip.id,
    player_id: playerId,
    amount,
    note,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // A negative revision after the fact means someone claimed points they
  // hadn't actually earned — that's what the cheat flag marks. It sticks
  // around (badge on the board, no counter) until they next place first
  // in a future round, at which point that win gets voided and the flag
  // clears (see saveEvent in lib/useBoardData.js).
  if (amount < 0) {
    await supabaseAdmin.from("players").update({ cheat_flagged: true }).eq("id", playerId);
  }

  const [{ data: roster }, { data: events }, { data: adjustments }] = await Promise.all([
    supabaseAdmin
      .from("trip_players")
      .select("player_id, players (id, name, emoji, icon_id)")
      .eq("trip_id", trip.id),
    supabaseAdmin.from("events").select("id, ranking").eq("trip_id", trip.id),
    supabaseAdmin.from("point_adjustments").select("player_id, amount").eq("trip_id", trip.id),
  ]);
  const players = (roster || []).map((r) => r.players).filter(Boolean);
  const standings = totals(players, events || [], adjustments || []);
  const newTop = standings[0];
  const tiedAtTop = newTop && standings.filter((s) => s.points === newTop.points).length > 1;

  // A tie at the top isn't something this route resolves on its own — same
  // as finalizeTrip, that needs an admin to actually pick — so the existing
  // trophy is left alone rather than guessing who to hand it to.
  if (!newTop || tiedAtTop || newTop.id === trip.winner_player_id) {
    return NextResponse.json({ ok: true, winnerChanged: false });
  }

  const newWinner = newTop;
  const now = new Date().toISOString();

  const { error: trophyError } = await supabaseAdmin.from("trophies").upsert(
    {
      trip_id: trip.id,
      player_id: newWinner.id,
      trip_name: trip.name,
      badge_id: trip.badge_id,
      points: newWinner.points,
      starts_on: trip.starts_on,
      ends_on: trip.ends_on,
      revised_at: now,
    },
    { onConflict: "trip_id" }
  );
  if (trophyError) return NextResponse.json({ error: trophyError.message }, { status: 400 });

  await supabaseAdmin.from("trips").update({ winner_player_id: newWinner.id }).eq("id", trip.id);

  // The push (below) never names the new winner, same "open the app to
  // find out" pattern as the original event-ended alert — the VAR popup on
  // the board is what actually announces them.
  await Promise.all(
    players.map((p) =>
      recordNotification(p.id, {
        kind: "var",
        title: "📺 VAR: Cheating Bastard",
        body: "Someone's been caught cheating. Was it you? God, you people are fucking desperate.",
        url: "/",
      })
    )
  );
  if (pushConfigured) {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .in(
        "player_id",
        players.map((p) => p.id)
      );
    if (subs?.length) {
      const deadIds = await sendVarPing(subs);
      if (deadIds.length) {
        await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    winnerChanged: true,
    newWinner: { id: newWinner.id, name: newWinner.name, points: newWinner.points },
  });
}
