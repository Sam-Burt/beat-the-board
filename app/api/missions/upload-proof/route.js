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
    .select("id, status, player_id, players (user_id)")
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

  const { error: updateError } = await supabaseAdmin
    .from("missions")
    .update({
      status: "completed",
      photo_url: publicUrlData.publicUrl,
      responded_at: new Date().toISOString(),
    })
    .eq("id", missionId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, photoUrl: publicUrlData.publicUrl });
}
