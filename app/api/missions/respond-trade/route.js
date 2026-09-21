import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendTradeResponsePing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

// Only the recipient of a trade can call this — accepting swaps the two
// missions' player_id (everything else about each mission, points, reward,
// photo-proof state, template_id, travels with it as-is); declining just
// closes the proposal out. Either way the proposer gets told.
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
  const tradeId = body.tradeId;
  const accept = !!body.accept;
  if (!tradeId) {
    return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
  }

  const { data: trade } = await supabaseAdmin
    .from("mission_trades")
    .select(
      "id, status, trip_id, proposer_player_id, proposer_mission_id, recipient_player_id, recipient_mission_id, trips (status)"
    )
    .eq("id", tradeId)
    .maybeSingle();
  if (!trade) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  const { data: recipientPlayer } = await supabaseAdmin
    .from("players")
    .select("user_id")
    .eq("id", trade.recipient_player_id)
    .maybeSingle();
  if (recipientPlayer?.user_id !== callerId) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  if (trade.status !== "pending") {
    return NextResponse.json({ error: "That trade's already been dealt with." }, { status: 400 });
  }
  if (trade.trips?.status === "finalized") {
    // The event ended before anyone got to this — nothing left to swap
    // into. Close it out rather than leave it dangling.
    await supabaseAdmin
      .from("mission_trades")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", tradeId);
    return NextResponse.json({ error: "That event's already over." }, { status: 400 });
  }

  if (!accept) {
    const { error } = await supabaseAdmin
      .from("mission_trades")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", tradeId)
      .eq("status", "pending");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await notifyProposer(trade, false);
    return NextResponse.json({ ok: true, accepted: false });
  }

  // Re-check both missions are still genuinely pending, in case something
  // slipped through — upload-proof and decline both refuse to touch a
  // mission that's locked in a pending trade, so this should never actually
  // fire, but a swap is the one place getting it wrong is irreversible.
  const [{ data: proposerMission }, { data: recipientMission }] = await Promise.all([
    supabaseAdmin.from("missions").select("id, status").eq("id", trade.proposer_mission_id).maybeSingle(),
    supabaseAdmin.from("missions").select("id, status").eq("id", trade.recipient_mission_id).maybeSingle(),
  ]);
  if (proposerMission?.status !== "pending" || recipientMission?.status !== "pending") {
    await supabaseAdmin
      .from("mission_trades")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", tradeId)
      .eq("status", "pending");
    return NextResponse.json(
      { error: "That mission's no longer up for trade — the offer's been cancelled." },
      { status: 400 }
    );
  }

  // Claim the trade first (same atomic-claim pattern as upload-proof) so a
  // double-tap on Accept can't run the swap twice.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("mission_trades")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 400 });
  }
  if (!claimed) {
    return NextResponse.json({ error: "That trade's already been dealt with." }, { status: 400 });
  }

  const [swapProposer, swapRecipient] = await Promise.all([
    supabaseAdmin.from("missions").update({ player_id: trade.recipient_player_id }).eq("id", trade.proposer_mission_id),
    supabaseAdmin.from("missions").update({ player_id: trade.proposer_player_id }).eq("id", trade.recipient_mission_id),
  ]);
  if (swapProposer.error || swapRecipient.error) {
    return NextResponse.json(
      { error: (swapProposer.error || swapRecipient.error).message },
      { status: 400 }
    );
  }

  await notifyProposer(trade, true);
  return NextResponse.json({ ok: true, accepted: true });
}

async function notifyProposer(trade, accepted) {
  await recordNotification(trade.proposer_player_id, {
    kind: "trade",
    title: accepted ? "🤝 Trade's on" : "🙅 Trade's dead",
    body: accepted ? "They took it. Go see what you're stuck with now." : "They took one look and said no.",
    url: "/missions",
  });
  if (!pushConfigured) return;
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("player_id", trade.proposer_player_id);
  if (subs?.length) {
    const deadIds = await sendTradeResponsePing(subs, accepted);
    if (deadIds.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
    }
  }
}
