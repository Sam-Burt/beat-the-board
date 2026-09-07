import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";

// Any signed-in player can call this — not just the admin — but only for
// their OWN mission, and only while it's still pending (one shot: once a
// photo lands the mission is "completed" and can't be re-proved or
// declined). Runs server-side with the service role key so the storage
// upload never needs its own RLS policies — this route is the only thing
// that ever writes to the mission-photos bucket.
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

  const formData = await request.formData().catch(() => null);
  const missionId = formData?.get("missionId");
  const photo = formData?.get("photo");
  if (!missionId || !(photo instanceof File)) {
    return NextResponse.json({ error: "missionId and photo are required." }, { status: 400 });
  }
  if (!photo.type?.startsWith("image/")) {
    return NextResponse.json({ error: "That doesn't look like an image." }, { status: 400 });
  }

  const { data: mission } = await supabaseAdmin
    .from("missions")
    .select("id, status, player_id, trip_id, title, points, players (user_id)")
    .eq("id", missionId)
    .maybeSingle();
  if (!mission || mission.players?.user_id !== callerId) {
    return NextResponse.json({ error: "Mission not found." }, { status: 404 });
  }
  if (mission.status !== "pending") {
    return NextResponse.json({ error: "This mission's already been dealt with." }, { status: 400 });
  }

  const ext = (photo.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
  const path = `${missionId}-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await photo.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from("mission-photos")
    .upload(path, bytes, { contentType: photo.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from("mission-photos").getPublicUrl(path);

  // Atomic claim (same pattern as finalizeTrip's .is("finalized_at", null))
  // so a double-submit can't award points twice: only the request that
  // actually flips pending -> completed gets a row back here.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("missions")
    .update({
      status: "completed",
      photo_url: publicUrlData.publicUrl,
      responded_at: new Date().toISOString(),
    })
    .eq("id", missionId)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  if (updated && mission.points > 0) {
    if (mission.trip_id) {
      await supabaseAdmin.from("point_adjustments").insert({
        trip_id: mission.trip_id,
        player_id: mission.player_id,
        amount: mission.points,
        note: mission.title
          ? `Completed a secret mission: "${mission.title}"`
          : "Completed a secret mission",
      });
    } else {
      console.error(`mission ${missionId} completed with no trip_id — points not awarded`);
    }
  }

  return NextResponse.json({ ok: true, photoUrl: publicUrlData.publicUrl, points: mission.points });
}
