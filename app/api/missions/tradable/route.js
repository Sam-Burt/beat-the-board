import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";

// Lists every OTHER player's pending, not-already-spoken-for missions for
// the current event — what the Trade picker offers to swap for. Missions
// stay private to whoever they were sent to everywhere else in the app
// (see "missions read own" in schema.sql); this is the one deliberate,
// narrow exception, since there's no way to decide whether you want
// someone's mission without seeing what it actually says. Server-side only
// — the browser's own anon key could never read this directly.
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
    .select("id")
    .eq("user_id", callerId)
    .maybeSingle();
  if (!me) {
    return NextResponse.json({ error: "No profile found for you." }, { status: 404 });
  }

  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("id")
    .in("status", ["active", "tied"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ players: [] });
  }

  const { data: pending } = await supabaseAdmin
    .from("missions")
    .select("id, title, text, points, reward_kind, player_id, players (id, name, icon_id, emoji)")
    .eq("trip_id", trip.id)
    .eq("status", "pending")
    .neq("player_id", me.id);
  if (!pending?.length) {
    return NextResponse.json({ players: [] });
  }

  const { data: lockedTrades } = await supabaseAdmin
    .from("mission_trades")
    .select("proposer_mission_id, recipient_mission_id")
    .eq("trip_id", trip.id)
    .eq("status", "pending");
  const lockedIds = new Set(
    (lockedTrades || []).flatMap((t) => [t.proposer_mission_id, t.recipient_mission_id])
  );

  const byPlayer = new Map();
  for (const m of pending) {
    if (lockedIds.has(m.id)) continue;
    const p = m.players;
    if (!p) continue;
    if (!byPlayer.has(p.id)) {
      byPlayer.set(p.id, { playerId: p.id, name: p.name, iconId: p.icon_id, emoji: p.emoji, missions: [] });
    }
    byPlayer.get(p.id).missions.push({
      id: m.id,
      title: m.title,
      text: m.text,
      points: m.points,
      rewardKind: m.reward_kind,
    });
  }

  return NextResponse.json({ players: Array.from(byPlayer.values()) });
}
