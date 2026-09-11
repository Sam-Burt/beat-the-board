import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendLeroyPing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

const GUESS_WINDOW_SECONDS = 60;

// Called from saveEvent (lib/useBoardData.js) the moment a pending Leroy's
// target plays any round — this is where he actually strikes. Everything
// happens here in one place: the steal itself (flat 5, straight from
// target to sender, same as it always was), and the reveal — the target
// only finds out now, with a 60-second window to guess who did it (see
// app/api/leroy/guess).
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
  const guessDeadline = new Date(now.getTime() + GUESS_WINDOW_SECONDS * 1000);

  // Atomic claim — only the call that actually flips resolved_at from null
  // proceeds to move points and notify. Same race guard as tripFinalize's
  // finalized_at claim.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("leroy_sends")
    .update({ resolved_at: now.toISOString(), guess_deadline: guessDeadline.toISOString() })
    .eq("id", leroySendId)
    .is("resolved_at", null)
    .select()
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 400 });
  if (!claimed) {
    return NextResponse.json({ ok: true, alreadyResolved: true });
  }

  await supabaseAdmin.from("point_adjustments").insert([
    {
      trip_id: leroy.trip_id,
      player_id: leroy.target_id,
      amount: -leroy.amount,
      note: "Leroy struck — he's been and gone",
    },
    {
      trip_id: leroy.trip_id,
      player_id: leroy.sender_id,
      amount: leroy.amount,
      note: "Leroy delivered the goods",
    },
  ]);

  const pingBody = "You've been Leroy'd! Quick — you've got 60 seconds to guess who sent him.";
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
