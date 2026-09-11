// SERVER-ONLY. Shared by app/api/admin/finalize-trip and
// app/api/admin/declare-trip-winner — the actual "who won" computation and
// trophy-awarding, factored out so both routes (automatic/manual end-of-trip,
// and picking a winner out of a tie) run the exact same logic. Not a
// route.js file itself: Next's App Router only allows HTTP-method exports
// (POST, GET, ...) plus a few reserved config exports from a route.js, so
// this lives here instead and gets imported by both routes.

import { supabaseAdmin } from "./supabaseAdmin";
import { totals } from "./points";
import { pushConfigured, sendEventEndedPing } from "./webpush";
import { recordNotification } from "./notifications";

export async function finalizeTrip(trip, forcedWinnerId = null) {
  const [rosterRes, eventsRes, adjustmentsRes, gayCardPassesRes] = await Promise.all([
    supabaseAdmin
      .from("trip_players")
      .select("player_id, players (id, name, emoji, icon_id)")
      .eq("trip_id", trip.id),
    supabaseAdmin.from("events").select("id, ranking").eq("trip_id", trip.id),
    supabaseAdmin.from("point_adjustments").select("player_id, amount").eq("trip_id", trip.id),
    trip.hot_potato_enabled
      ? supabaseAdmin
          .from("hot_potato_history")
          .select("to_player_id")
          .eq("trip_id", trip.id)
          .not("from_player_id", "is", null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // A failed read here used to fall through as `(roster || [])` — an empty
  // array indistinguishable from "this trip genuinely has no players" — so
  // a transient blip on any one of these four queries got misreported as a
  // permanent, nonsensical error and the trip was left stuck 'active'
  // instead of being retried. The cron calls this again in 5 minutes
  // regardless (it re-queries for any active trip past its deadline every
  // time), so surfacing the real failure and bailing out is enough to let
  // that retry actually happen instead of silently giving up for good.
  const queryError = rosterRes.error || eventsRes.error || adjustmentsRes.error || gayCardPassesRes.error;
  if (queryError) {
    return { error: `Couldn't read this trip's data: ${queryError.message}` };
  }

  const roster = rosterRes.data;
  const events = eventsRes.data;
  const adjustments = adjustmentsRes.data;
  const gayCardPasses = gayCardPassesRes.data;

  const players = (roster || []).map((r) => r.players).filter(Boolean);
  if (players.length === 0) {
    return { error: "This trip has no players on its roster." };
  }

  let liveAdjustments = adjustments || [];

  // The secret Gay Card reveal: every successful pass (a real pass, or the
  // holder self-reporting "I GOT CAUGHT" — either way a row in
  // hot_potato_history with a real from_player_id, excluding the initial
  // random deal) cost the receiving player 2 points, but nobody's seen any
  // of it happen — it's been tallied invisibly all event. This is the
  // moment it all lands at once, folded in as real point_adjustments rows
  // (same as any other award/deduction) BEFORE standings are computed, so
  // it actually counts toward who wins.
  const tally = {};
  (gayCardPasses || []).forEach((row) => {
    tally[row.to_player_id] = (tally[row.to_player_id] || 0) + 1;
  });
  for (const [playerId, count] of Object.entries(tally)) {
    if (!players.some((p) => p.id === playerId)) continue;
    const deduction = count * 2;
    await supabaseAdmin.from("point_adjustments").insert({
      trip_id: trip.id,
      player_id: playerId,
      amount: -deduction,
      note: `Gay Card — caught out ${count} time${count === 1 ? "" : "s"}`,
    });
    liveAdjustments = [...liveAdjustments, { player_id: playerId, amount: -deduction }];
  }

  const standings = totals(players, events || [], liveAdjustments);

  let winner;
  if (forcedWinnerId) {
    winner = standings.find((s) => s.id === forcedWinnerId);
    if (!winner) return { error: "That player isn't on this trip's roster." };
  } else {
    const top = standings[0];
    const tied = standings.filter((s) => s.points === top.points);
    if (tied.length > 1) {
      await supabaseAdmin.from("trips").update({ status: "tied" }).eq("id", trip.id);
      return {
        tied: true,
        tiedPlayers: tied.map((s) => ({ id: s.id, name: s.name, points: s.points })),
      };
    }
    winner = top;
  }

  const { error: trophyError } = await supabaseAdmin.from("trophies").upsert(
    {
      trip_id: trip.id,
      player_id: winner.id,
      trip_name: trip.name,
      badge_id: trip.badge_id,
      points: winner.points,
      starts_on: trip.starts_on,
      ends_on: trip.ends_on,
    },
    { onConflict: "trip_id" }
  );
  if (trophyError) return { error: trophyError.message };

  // This is the one moment two concurrent calls could actually collide —
  // e.g. the admin has the board open on two tabs/devices, both notice the
  // deadline's passed, and both call finalize-trip within milliseconds of
  // each other. Everything above this point is idempotent either way
  // (upsert, and the same values), but sending the "it's over" notification
  // twice isn't. So this update only "counts" if finalized_at was still
  // null — whichever call's write actually lands first wins the race and
  // is the only one that proceeds to notify anyone.
  const { data: claimedTrip, error: tripError } = await supabaseAdmin
    .from("trips")
    .update({
      status: "finalized",
      winner_player_id: winner.id,
      finalized_at: new Date().toISOString(),
    })
    .eq("id", trip.id)
    .is("finalized_at", null)
    .select()
    .maybeSingle();
  if (tripError) return { error: tripError.message };

  if (!claimedTrip) {
    // Another concurrent call already finalized this trip and already sent
    // the notification — nothing left to do here.
    return { finalized: true, winner: { id: winner.id, name: winner.name, points: winner.points } };
  }

  // A queued mission belongs to the event it was queued for. Once that
  // event's done, anything still waiting to go out is moot — it would
  // otherwise land on someone's phone after the final whistle, pointing at
  // an event they can no longer score in.
  await supabaseAdmin
    .from("scheduled_missions")
    .delete()
    .eq("trip_id", trip.id)
    .is("sent_at", null);

  // Tell the whole roster it's over — not just whoever happens to have the
  // app open right when this fires (the cron in app/api/cron is what makes
  // this land on time; a player's device triggering the deadline check, or
  // the admin manually ending/declaring it, are the other ways in).
  await Promise.all(players.map((p) => recordNotification(p.id, {
    kind: "event_ended",
    title: "🏁 Game over, you pricks.",
    body: `${trip.name} is over. One of you actually won. The rest of you were fucking useless.`,
    url: "/",
  })));
  if (pushConfigured) {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .in("player_id", players.map((p) => p.id));
    if (subs?.length) {
      const deadIds = await sendEventEndedPing(subs, trip.name);
      if (deadIds.length) {
        await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
      }
    }
  }

  return { finalized: true, winner: { id: winner.id, name: winner.name, points: winner.points } };
}
