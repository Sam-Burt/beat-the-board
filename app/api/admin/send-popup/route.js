import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendPush } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

// Admin-authored, forced full-screen announcement (see the Pop Up Creator
// on the Profile page and components/PopupAlert.js) — one row per
// recipient, same fan-out as send-notification. Not tied to any trip: an
// admin might want to announce something before, during, or after an
// event just as easily. The push never spoils the actual content, same
// "open the app to find out" pattern as everything else forced like this.
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
  const playerIds = Array.isArray(body.playerIds) ? [...new Set(body.playerIds.filter(Boolean))] : [];
  const kicker = (body.kicker || "").trim() || null;
  const headline = (body.headline || "").trim();
  const popupBody = (body.body || "").trim() || null;
  const icon = (body.icon || "").trim() || null;
  const confirmLabel = (body.confirmLabel || "").trim() || "Got it";
  const hasDecline = !!body.hasDecline;
  const declineLabel = hasDecline ? (body.declineLabel || "").trim() || "No" : null;

  if (!playerIds.length || !headline) {
    return NextResponse.json({ error: "playerIds and a headline are required." }, { status: 400 });
  }

  const { error: insertError } = await supabaseAdmin.from("popup_alerts").insert(
    playerIds.map((playerId) => ({
      player_id: playerId,
      kicker,
      headline,
      body: popupBody,
      icon,
      confirm_label: confirmLabel,
      has_decline: hasDecline,
      decline_label: declineLabel,
    }))
  );
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  await Promise.all(
    playerIds.map((playerId) =>
      recordNotification(playerId, {
        kind: "popup_alert",
        title: "📣 Listen up",
        body: "Something's waiting for you in the app.",
        url: "/",
      })
    )
  );

  if (!pushConfigured) {
    return NextResponse.json({ sent: true, pushed: 0, pushConfigured: false, recipients: playerIds.length });
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("player_id", playerIds);

  let pushed = 0;
  if (subs?.length) {
    const deadIds = await sendPush(subs, {
      title: "📣 Listen up",
      body: "Something's waiting for you in the app.",
      url: "/",
      tag: "beat-the-board-popup-alert",
    });
    pushed = subs.length - deadIds.length;
    if (deadIds.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
    }
  }

  return NextResponse.json({ sent: true, pushed, pushConfigured: true, recipients: playerIds.length });
}
