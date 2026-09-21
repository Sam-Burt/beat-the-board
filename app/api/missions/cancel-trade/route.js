import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";
import { recordNotification } from "../../../../lib/notifications";

// Lets the proposer back out of their own still-pending offer — otherwise
// their mission stays locked (see lib/missionTrades.js) until the other
// player happens to open the app and deal with it, which could be a while.
// No push for this one, just the quiet in-app record — the recipient finds
// out by the popup simply not being there next time they open up.
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
  if (!tradeId) {
    return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
  }

  const { data: trade } = await supabaseAdmin
    .from("mission_trades")
    .select("id, status, proposer_player_id, recipient_player_id")
    .eq("id", tradeId)
    .maybeSingle();
  if (!trade) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  const { data: proposerPlayer } = await supabaseAdmin
    .from("players")
    .select("user_id")
    .eq("id", trade.proposer_player_id)
    .maybeSingle();
  if (proposerPlayer?.user_id !== callerId) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  if (trade.status !== "pending") {
    return NextResponse.json({ error: "That trade's already been dealt with." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("mission_trades")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("status", "pending");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordNotification(trade.recipient_player_id, {
    kind: "trade",
    title: "🙈 Offer pulled",
    body: "They thought better of it. That trade's off the table.",
    url: "/missions",
  });

  return NextResponse.json({ ok: true });
}
