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

  const { data: events } = await supabaseAdmin
    .from("events")
    .select("id, ranking")
    .contains("ranking", [playerId]);
  if (events && events.length > 0) {
    return NextResponse.json(
      { error: "This player is already in the results history — remove them from those results first." },
      { status: 400 }
    );
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
