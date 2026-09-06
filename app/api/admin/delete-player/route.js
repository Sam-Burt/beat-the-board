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

  // events.ranking is a plain uuid[] column, not a foreign key, so it's the
  // one place a deleted player would leave a dangling reference (everything
  // else — point_adjustments, trophies, missions, notifications — already
  // cascades via the schema). Strip them out of every round they're in
  // before deleting, rather than just refusing. This does shift the points
  // of whoever else was in that round, since scoring is "1 point per
  // player you beat" within whatever's left.
  const { data: events } = await supabaseAdmin
    .from("events")
    .select("id, ranking")
    .contains("ranking", [playerId]);
  for (const ev of events || []) {
    const { error: rankingError } = await supabaseAdmin
      .from("events")
      .update({ ranking: ev.ranking.filter((id) => id !== playerId) })
      .eq("id", ev.id);
    if (rankingError) {
      return NextResponse.json({ error: rankingError.message }, { status: 400 });
    }
  }

  const { error: deleteError } = await supabaseAdmin.from("players").delete().eq("id", playerId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  // Only delete the auth account if it isn't the admin's own login (an
  // admin who is also a player unlinks their player row, not their account).
  if (player.user_id && player.user_id !== callerId) {
    await supabaseAdmin.auth.admin.deleteUser(player.user_id).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
