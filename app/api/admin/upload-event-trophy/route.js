import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";

// Admin-only: uploads real artwork for a one-off event (e.g. Centre Parcs
// 2026) and catalogs it in event_trophies so it shows up as a pickable
// option alongside the generic pool from then on — see
// components/TrophyPicker.js. Same storage pattern as mission proof photos
// (app/api/missions/upload-proof): public bucket, nobody uploads to it
// except this route, server-side with the service role key.
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

  const formData = await request.formData().catch(() => null);
  const label = (formData?.get("label") || "").toString().trim();
  const image = formData?.get("image");
  if (!label) {
    return NextResponse.json({ error: "Give it a name." }, { status: 400 });
  }
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Pick an image." }, { status: 400 });
  }
  if (!image.type?.startsWith("image/")) {
    return NextResponse.json({ error: "That doesn't look like an image." }, { status: 400 });
  }

  const ext = (image.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
  const path = `${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await image.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from("event-trophies")
    .upload(path, bytes, { contentType: image.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from("event-trophies").getPublicUrl(path);

  const { data: trophy, error: insertError } = await supabaseAdmin
    .from("event_trophies")
    .insert({ label, image_url: publicUrlData.publicUrl })
    .select()
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, trophy });
}
