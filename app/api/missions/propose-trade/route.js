import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendTradeRequestPing } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";
import { hasPendingTrade } from "../../../../lib/missionTrades";

// Any signed-in player can call this — offer one of their own pending
// missions in exchange for another player's. Doesn't move anything itself:
// it just puts a proposal in front of the other player, who has to accept
// or decline (see respond-trade) before either mission actually changes
// hands.
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
  const proposerMissionId = body.proposerMissionId;
  const recipientMissionId = body.recipientMissionId;
  if (!proposerMissionId || !recipientMissionId) {
    return NextResponse.json(
      { error: "proposerMissionId and recipientMissionId are required." },
      { status: 400 }
    );
  }
  if (proposerMissionId === recipientMissionId) {
    return NextResponse.json({ error: "Can't trade a mission for itself." }, { status: 400 });
  }

  const [{ data: proposerMission }, { data: recipientMission }] = await Promise.all([
    supabaseAdmin
      .from("missions")
      .select(
        "id, title, text, points, reward_kind, status, trip_id, player_id, players (user_id, name), trips (status)"
      )
      .eq("id", proposerMissionId)
      .maybeSingle(),
    supabaseAdmin
      .from("missions")
      .select(
        "id, title, text, points, reward_kind, status, trip_id, player_id, players (user_id, name), trips (status)"
      )
      .eq("id", recipientMissionId)
      .maybeSingle(),
  ]);

  if (!proposerMission || proposerMission.players?.user_id !== callerId) {
    return NextResponse.json({ error: "That's not your mission to offer." }, { status: 404 });
  }
  if (!recipientMission) {
    return NextResponse.json({ error: "That mission doesn't exist any more." }, { status: 404 });
  }
  if (recipientMission.player_id === proposerMission.player_id) {
    return NextResponse.json({ error: "Can't trade with yourself." }, { status: 400 });
  }
  if (proposerMission.status !== "pending" || recipientMission.status !== "pending") {
    return NextResponse.json({ error: "One of those missions has already been dealt with." }, { status: 400 });
  }
  if (proposerMission.trip_id !== recipientMission.trip_id) {
    return NextResponse.json({ error: "Those missions aren't from the same event." }, { status: 400 });
  }
  if (proposerMission.trips?.status === "finalized") {
    return NextResponse.json({ error: "That event's already over." }, { status: 400 });
  }

  const [proposerLocked, recipientLocked] = await Promise.all([
    hasPendingTrade(proposerMissionId),
    hasPendingTrade(recipientMissionId),
  ]);
  if (proposerLocked || recipientLocked) {
    return NextResponse.json(
      { error: "One of those missions is already tied up in another trade." },
      { status: 400 }
    );
  }

  const { data: trade, error: insertError } = await supabaseAdmin
    .from("mission_trades")
    .insert({
      trip_id: proposerMission.trip_id,
      proposer_player_id: proposerMission.player_id,
      proposer_mission_id: proposerMission.id,
      proposer_title: proposerMission.title,
      proposer_text: proposerMission.text,
      proposer_points: proposerMission.points,
      proposer_reward_kind: proposerMission.reward_kind,
      recipient_player_id: recipientMission.player_id,
      recipient_mission_id: recipientMission.id,
      recipient_title: recipientMission.title,
      recipient_text: recipientMission.text,
      recipient_points: recipientMission.points,
      recipient_reward_kind: recipientMission.reward_kind,
    })
    .select()
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const proposerName = proposerMission.players?.name || "Someone";
  await recordNotification(recipientMission.player_id, {
    kind: "trade",
    title: `😏 ${proposerName} wants to swap`,
    body: "They reckon their mission's better than yours. Go see if they're right.",
    url: "/missions",
  });

  if (pushConfigured) {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("player_id", recipientMission.player_id);
    if (subs?.length) {
      const deadIds = await sendTradeRequestPing(subs, `😏 ${proposerName} wants to swap`);
      if (deadIds.length) {
        await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
      }
    }
  }

  return NextResponse.json({ ok: true, trade });
}
