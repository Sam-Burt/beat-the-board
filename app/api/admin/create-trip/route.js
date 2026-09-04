import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { BADGE_IDS } from "../../../../lib/badges";

// Starts a new trip: a name, an optional badge/date-window/deadline, and a
// roster of existing player accounts. All-or-nothing — if the roster insert
// fails after the trip row is created, the trip row is rolled back so a
// retry doesn't leave a half-set-up trip behind (same pattern as
// create-player's account rollback).
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
  const name = (body.name || "").trim();
  const badgeId = BADGE_IDS.includes(body.badgeId) ? body.badgeId : null;
  const startsOn = body.startsOn || null;
  const endsOn = body.endsOn || null;
  const deadline = body.deadline || null;
  const playerIds = Array.isArray(body.playerIds) ? [...new Set(body.playerIds)] : [];

  if (!name) {
    return NextResponse.json({ error: "Give the trip a name." }, { status: 400 });
  }
  if (playerIds.length < 1) {
    return NextResponse.json(
      { error: "Pick at least one player for the roster." },
      { status: 400 }
    );
  }

  // Only one trip can be "current" (active or awaiting a tie-break) at a
  // time — the previous one needs finalizing first.
  const { data: existingCurrent } = await supabaseAdmin
    .from("trips")
    .select("id, status")
    .in("status", ["active", "tied"])
    .maybeSingle();
  if (existingCurrent) {
    return NextResponse.json(
      { error: "There's already a trip running — finalize it before starting a new one." },
      { status: 400 }
    );
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .insert({
      name,
      badge_id: badgeId,
      starts_on: startsOn,
      ends_on: endsOn,
      deadline,
      status: "active",
    })
    .select()
    .single();
  if (tripError) {
    return NextResponse.json({ error: tripError.message }, { status: 400 });
  }

  const { error: rosterError } = await supabaseAdmin
    .from("trip_players")
    .insert(playerIds.map((playerId) => ({ trip_id: trip.id, player_id: playerId })));
  if (rosterError) {
    await supabaseAdmin.from("trips").delete().eq("id", trip.id).catch(() => {});
    return NextResponse.json({ error: rosterError.message }, { status: 400 });
  }

  return NextResponse.json({ trip });
}
