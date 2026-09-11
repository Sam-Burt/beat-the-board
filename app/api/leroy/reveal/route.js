import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendLeroyPing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

// Called from saveEvent (lib/useBoardData.js) the moment a pending Leroy's
// target plays any round — this is where he actually strikes. Deliberately
// does NOT move any points yet: doing that here, before anyone's had a
// chance to guess, would flash two matching +5/-5 rows into everyone's
// History at the same instant — trivial for any onlooker to correlate into
// "who sent it", even though the target themselves hasn't been told yet.
// So this route only marks that he's struck and notifies the target; the
// actual steal (or its reversal) is applied by whichever of
// app/api/leroy/guess or app/api/leroy/settle resolves the guess window.
//
// Deliberately does NOT start the 60-second guess window either — that
// would let it burn down in the background before the target's even
// opened the app, which isn't a fair shot at guessing. The window only
// starts once app/api/leroy/start-guess-window fires, which the target's
// own client calls the moment it's actually about to show them the popup
// (see lib/useLeroyAlert.js).
//
// Admin-only because saveEvent is the only caller and it's already an
// admin-gated action; the target themselves never calls this directly.
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
  const leroySendId = body.leroySendId;
  if (!leroySendId) {
    return NextResponse.json({ error: "leroySendId is required." }, { status: 400 });
  }

  const { data: leroy } = await supabaseAdmin
    .from("leroy_sends")
    .select("id, trip_id, sender_id, target_id, amount, resolved_at")
    .eq("id", leroySendId)
    .maybeSingle();
  if (!leroy) {
    return NextResponse.json({ error: "That Leroy send doesn't exist." }, { status: 404 });
  }
  if (leroy.resolved_at) {
    // Already resolved (a concurrent call got there first) — nothing left
    // to do, and definitely not the steal a second time.
    return NextResponse.json({ ok: true, alreadyResolved: true });
  }

  const now = new Date();

  // Atomic claim — only the call that actually flips resolved_at from null
  // proceeds to notify. Same race guard as tripFinalize's finalized_at
  // claim.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("leroy_sends")
    .update({ resolved_at: now.toISOString() })
    .eq("id", leroySendId)
    .is("resolved_at", null)
    .select()
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 400 });
  if (!claimed) {
    return NextResponse.json({ ok: true, alreadyResolved: true });
  }

  const pingBody = "Leroy's here to steal your shit!! Who the fuck sent him?! Figure it out you prick…";
  await recordNotification(leroy.target_id, {
    kind: "leroy",
    title: "🥷 You've been Leroy'd",
    body: pingBody,
    url: "/tricks",
  });

  if (pushConfigured) {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("player_id", leroy.target_id);
    if (subs?.length) {
      const deadIds = await sendLeroyPing(subs, pingBody);
      if (deadIds.length) {
        await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
