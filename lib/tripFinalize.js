// SERVER-ONLY. Shared by app/api/admin/finalize-trip and
// app/api/admin/declare-trip-winner — the actual "who won" computation and
// trophy-awarding, factored out so both routes (automatic/manual end-of-trip,
// and picking a winner out of a tie) run the exact same logic. Not a
// route.js file itself: Next's App Router only allows HTTP-method exports
// (POST, GET, ...) plus a few reserved config exports from a route.js, so
// this lives here instead and gets imported by both routes.

import { supabaseAdmin } from "./supabaseAdmin";
import { totals } from "./points";

export async function finalizeTrip(trip, forcedWinnerId = null) {
  const [{ data: roster }, { data: events }, { data: adjustments }] = await Promise.all([
    supabaseAdmin
      .from("trip_players")
      .select("player_id, players (id, name, emoji, icon_id)")
      .eq("trip_id", trip.id),
    supabaseAdmin.from("events").select("id, ranking").eq("trip_id", trip.id),
    supabaseAdmin.from("point_adjustments").select("player_id, amount").eq("trip_id", trip.id),
  ]);

  const players = (roster || []).map((r) => r.players).filter(Boolean);
  if (players.length === 0) {
    return { error: "This trip has no players on its roster." };
  }

  const standings = totals(players, events || [], adjustments || []);

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

  const { error: tripError } = await supabaseAdmin
    .from("trips")
    .update({
      status: "finalized",
      winner_player_id: winner.id,
      finalized_at: new Date().toISOString(),
    })
    .eq("id", trip.id);
  if (tripError) return { error: tripError.message };

  return { finalized: true, winner: { id: winner.id, name: winner.name, points: winner.points } };
}
