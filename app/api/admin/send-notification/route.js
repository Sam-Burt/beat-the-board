import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendPush } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

// A free-form push alert, admin-authored and sent as-is — unlike
// send-mission's fixed "you've got a mission" teaser, whatever title/body
// the admin types here IS the notification. Not tied to an event, so
// there's no active-trip check like send-mission has: an admin might want
// to ping someone before or after an event just as easily as during one.
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
  const title = (body.title || "").trim();
  const text = (body.text || "").trim();

  if (!playerId || !title || !text) {
    return NextResponse.json({ error: "playerId, title and text are required." }, { status: 400 });
  }

  await recordNotification(playerId, { kind: "admin", title, body: text, url: "/" });

  if (!pushConfigured) {
    return NextResponse.json({ sent: true, pushed: 0, pushConfigured: false });
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("player_id", playerId);

  let pushed = 0;
  if (subs?.length) {
    const deadIds = await sendPush(subs, { title, body: text, url: "/", tag: "beat-the-board-admin" });
    pushed = subs.length - deadIds.length;
    if (deadIds.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
    }
  }

  return NextResponse.json({ sent: true, pushed, pushConfigured: true });
}
