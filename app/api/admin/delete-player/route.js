import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";

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
  if (!playerId) {
    return NextResponse.json({ error: "playerId is required." }, { status: 400 });
  }

  const { data: player, error: fetchError } = await supabaseAdmin
    .from("players")
    .select("id, user_id")
    .eq("id", playerId)
    .maybeSingle();
  if (fetchError || !player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  // "Removing" a player never hard-deletes the row — past rounds
  // (events.ranking), point adjustments and trophies all reference their
  // id, and should keep showing their real name forever, not go dangling
  // or get stripped out and quietly rewrite old scoring. So this just:
  //   1. drops them off the current trip's roster, so they disappear from
  //      any active leaderboard/picker right away
  //   2. revokes their login (unless it's the admin's own account)
  //   3. marks the row deleted_at instead of deleting it, so History/
  //      trophies/point adjustments still resolve their name
  await supabaseAdmin.from("trip_players").delete().eq("player_id", playerId);

  if (player.user_id && player.user_id !== callerId) {
    await supabaseAdmin.auth.admin.deleteUser(player.user_id).catch(() => {});
  }

  // Clear username (not name) so it's free for a new player to reuse —
  // it's the one field with a uniqueness constraint, and it's only ever
  // used for logging in, never shown in History/trophies.
  const { error: deleteError } = await supabaseAdmin
    .from("players")
    .update({ deleted_at: new Date().toISOString(), username: null })
    .eq("id", playerId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
