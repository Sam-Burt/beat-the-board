import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";

// Clears a mission off the player's own missions page without proving it —
// only for their own mission, and only while it's still pending. Declined
// missions aren't deleted: they still show up (marked declined) in the
// end-of-event Secret Missions Review, same as a completed one would.
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

  const body = await request.json().catch(() => ({}));
  const missionId = body.missionId;
  if (!missionId) {
    return NextResponse.json({ error: "missionId is required." }, { status: 400 });
  }

  const { data: mission } = await supabaseAdmin
    .from("missions")
    .select("id, status, players (user_id)")
    .eq("id", missionId)
    .maybeSingle();
  if (!mission || mission.players?.user_id !== callerId) {
    return NextResponse.json({ error: "Mission not found." }, { status: 404 });
  }
  if (mission.status !== "pending") {
    return NextResponse.json({ error: "This mission's already been dealt with." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("missions")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", missionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
