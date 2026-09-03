import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendMissionPing } from "../../../../lib/webpush";

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
  const text = (body.text || "").trim();
  if (!playerId || !text) {
    return NextResponse.json({ error: "playerId and text are required." }, { status: 400 });
  }

  const { data: mission, error: insertError } = await supabaseAdmin
    .from("missions")
    .insert({ player_id: playerId, text })
    .select()
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  if (!pushConfigured) {
    // Mission is saved and will show up on their profile page either way —
    // the phone alert is just a bonus that needs the VAPID keys set up.
    return NextResponse.json({ mission, pushed: 0, pushConfigured: false });
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("player_id", playerId);

  let pushed = 0;
  if (subs?.length) {
    const deadIds = await sendMissionPing(subs);
    pushed = subs.length - deadIds.length;
    if (deadIds.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
    }
  }

  return NextResponse.json({ mission, pushed, pushConfigured: true });
}
