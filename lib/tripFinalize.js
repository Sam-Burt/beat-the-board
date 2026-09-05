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
  const [{ data: roster }, { data: events }, { data: adjustments }, { data: hotPotato }] = await Promise.all([
    supabaseAdmin
      .from("trip_players")
      .select("player_id, players (id, name, emoji, icon_id)")
      .eq("trip_id", trip.id),
    supabaseAdmin.from("events").select("id, ranking").eq("trip_id", trip.id),
    supabaseAdmin.from("point_adjustments").select("player_id, amount").eq("trip_id", trip.id),
    trip.hot_potato_enabled
      ? supabaseAdmin.from("hot_potato_state").select("holder_id").eq("trip_id", trip.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const players = (roster || []).map((r) => r.players).filter(Boolean);
  if (players.length === 0) {
    return { error: "This trip has no players on its roster." };
  }

  let liveAdjustments = adjustments || [];

  // Whoever's holding the Hot Potato at the deadline loses 10 points. If
  // that holder is sitting in 1st by more than 10, a flat -10 wouldn't cost
  // them the lead at all — so instead they lose exactly enough to hand 1st
  // to whoever's in 2nd, by 1 point. Computed off standings BEFORE this
  // penalty, then folded in as a real point_adjustments row (same as any
  // other award/deduction) so it shows up in history and is included from
  // here on.
  const holderId = hotPotato?.holder_id;
  if (holderId && players.some((p) => p.id === holderId)) {
    const preStandings = totals(players, events || [], liveAdjustments);
    const holder = preStandings.find((s) => s.id === holderId);
    const top = preStandings[0];
    let deduction = 10;
    if (holder && top && holder.id === top.id) {
      const secondPlace = preStandings.find((s) => s.points < top.points);
      const lead = top.points - (secondPlace?.points ?? 0);
      if (lead > 10) deduction = lead + 1;
    }
    if (holder && deduction > 0) {
      await supabaseAdmin.from("point_adjustments").insert({
        trip_id: trip.id,
        player_id: holderId,
        amount: -deduction,
        note: "Hot Potato — left holding it at the deadline",
      });
      liveAdjustments = [...liveAdjustments, { player_id: holderId, amount: -deduction }];
    }
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
