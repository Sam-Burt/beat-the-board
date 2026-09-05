import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendMissionPing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

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

  let title = (body.title || "").trim() || null;
  let text = (body.text || "").trim();

  // "Send a random one" — picked here, server-side, so the admin genuinely
  // doesn't see which task from the pool went out (same spirit as the
  // scheduler below picking a random one at fire time).
  if (body.random) {
    const { data: pool } = await supabaseAdmin.from("mission_templates").select("title, text");
    if (!pool?.length) {
      return NextResponse.json(
        { error: "The mission pool is empty — add some tasks first." },
        { status: 400 }
      );
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    title = picked.title || null;
    text = picked.text;
  }

  if (!text) {
    return NextResponse.json({ error: "playerId and text are required." }, { status: 400 });
  }

  const { data: mission, error: insertError } = await supabaseAdmin
    .from("missions")
    .insert({ player_id: playerId, title, text })
    .select()
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  await recordNotification(playerId, {
    kind: "mission",
    title: "🤫 Shhh…",
    body: "You've got a secret mission 👀",
    url: "/missions",
  });

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
