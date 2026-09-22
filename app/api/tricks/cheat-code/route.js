import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";
import { pushConfigured, sendPush } from "../../../../lib/webpush";
import { recordNotification } from "../../../../lib/notifications";

const REUSE_PENALTY = 5;
const ADMIN_BONUS_EVERY = 3;

// Points is the common outcome by design — Leroy and Jackpot are both
// genuinely strong wins, so they're rationed equally hard: 90% points,
// 5% Jackpot, 5% Leroy.
function rollReward() {
  const roll = Math.random();
  if (roll < 0.9) return "points";
  if (roll < 0.95) return "jackpot";
  return "leroy";
}

// Sam's the one handing codes out, so him redeeming them too would be
// judge, jury and executioner — every ADMIN_BONUS_EVERY-th code someone
// ELSE successfully redeems this trip, every admin actually PLAYING this
// trip gets their own automatic roll of the same odds, for free, no code
// typed.
// Doesn't touch or reset anything about the normal flow — an admin can
// still type in a real code themselves too (see the callerIsAdmin check
// below, which just skips counting THEIR OWN win toward this milestone so
// they can't trigger their own bonus).
//
// excludeAdminIds (every admin-linked player, system-wide) is what keeps
// the milestone count honest — an admin's own win never counts as one of
// the "others". rewardAdminIds is deliberately a SEPARATE, narrower list:
// only admins on THIS trip's roster. An admin account that isn't even
// playing this event has no business getting pinged or paid out for it.
async function maybeGrantAdminBonus(tripId, excludeAdminIds, rewardAdminIds) {
  if (!rewardAdminIds.length) return;

  const { data: redemptions } = await supabaseAdmin
    .from("cheat_code_redemptions")
    .select("player_id")
    .eq("trip_id", tripId);
  const excludeSet = new Set(excludeAdminIds);
  const nonAdminCount = (redemptions || []).filter((r) => !excludeSet.has(r.player_id)).length;
  if (nonAdminCount === 0 || nonAdminCount % ADMIN_BONUS_EVERY !== 0) return;

  for (const adminPlayerId of rewardAdminIds) {
    const reward = rollReward();

    // code_id is null — this isn't tied to any real code text, it's a
    // milestone bonus. Nothing about the (trip_id, player_id, code_id)
    // uniqueness check minds multiple null code_ids for the same admin
    // across different milestones (SQL never treats two nulls as equal).
    const { error: insertError } = await supabaseAdmin.from("cheat_code_redemptions").insert({
      trip_id: tripId,
      player_id: adminPlayerId,
      code_id: null,
      reward,
    });
    if (insertError) continue; // one admin's failure shouldn't block another's

    if (reward === "points") {
      await supabaseAdmin.from("point_adjustments").insert({
        trip_id: tripId,
        player_id: adminPlayerId,
        amount: 5,
        note: `Admin's cut — ${nonAdminCount} nosey gits got lucky`,
      });
    }

    const title = "🎁 Three suckers took the bait";
    const body =
      reward === "points"
        ? "Your cut: +5 points, straight to your score."
        : reward === "leroy"
        ? "Your cut: an extra Leroy."
        : "Your cut: an extra Jackpot.";

    await recordNotification(adminPlayerId, { kind: "admin", title, body, url: "/tricks" });

    if (pushConfigured) {
      const { data: subs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth_key")
        .eq("player_id", adminPlayerId);
      if (subs?.length) {
        const deadIds = await sendPush(subs, { title, body, url: "/tricks", tag: "beat-the-board-admin" });
        if (deadIds.length) {
          await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
        }
      }
    }
  }
}

// Any signed-in player can call this. A real code, entered for the first
// time this event, rolls 90/5/5: 5 points, an extra Jackpot charge, or
// an extra Leroy charge (see lib/useBoardData.js for how those extra
// charges actually get counted — nothing here touches leroy_sends or
// point_boosts directly, redeeming just banks the entitlement). A code
// that doesn't exist at all is a harmless miss. The one real trap: typing
// the SAME code you've already redeemed this event costs you 5 points —
// the unique constraint on cheat_code_redemptions is what actually decides
// that, not a lookup here, so there's no race where two fast taps both
// "win".
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
  const rawCode = (body.code || "").toString();
  const normalized = rawCode.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "Type something first." }, { status: 400 });
  }

  const { data: me } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("user_id", callerId)
    .maybeSingle();
  if (!me) {
    return NextResponse.json({ error: "No player profile is linked to your account." }, { status: 400 });
  }

  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("id")
    .in("status", ["active", "tied"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "There's no event running." }, { status: 400 });
  }

  const { data: cheatCode } = await supabaseAdmin
    .from("cheat_codes")
    .select("id")
    .eq("code", normalized)
    .maybeSingle();
  if (!cheatCode) {
    return NextResponse.json({ ok: true, outcome: "invalid" });
  }

  const { data: adminRows } = await supabaseAdmin.from("admins").select("user_id");
  const adminUserIds = (adminRows || []).map((a) => a.user_id);
  let adminPlayerIds = [];
  if (adminUserIds.length) {
    const { data: adminPlayers } = await supabaseAdmin
      .from("players")
      .select("id")
      .in("user_id", adminUserIds);
    adminPlayerIds = (adminPlayers || []).map((p) => p.id);
  }
  const callerIsAdmin = adminPlayerIds.includes(me.id);

  // Only admins actually on this trip's roster are eligible to receive the
  // automatic bonus — see maybeGrantAdminBonus above.
  let rosterAdminPlayerIds = [];
  if (adminPlayerIds.length) {
    const { data: rosterRows } = await supabaseAdmin
      .from("trip_players")
      .select("player_id")
      .eq("trip_id", trip.id)
      .in("player_id", adminPlayerIds);
    rosterAdminPlayerIds = (rosterRows || []).map((r) => r.player_id);
  }

  const reward = rollReward();

  const { error: insertError } = await supabaseAdmin.from("cheat_code_redemptions").insert({
    trip_id: trip.id,
    player_id: me.id,
    code_id: cheatCode.id,
    reward,
  });

  if (insertError) {
    // 23505 = unique_violation — this exact (trip, player, code) row
    // already exists, meaning they've redeemed this one before this event.
    if (insertError.code === "23505") {
      await supabaseAdmin.from("point_adjustments").insert({
        trip_id: trip.id,
        player_id: me.id,
        amount: -REUSE_PENALTY,
        note: "Had a nosey somewhere they'd already been — greedy bastard",
      });
      return NextResponse.json({ ok: true, outcome: "reused" });
    }
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  if (reward === "points") {
    await supabaseAdmin.from("point_adjustments").insert({
      trip_id: trip.id,
      player_id: me.id,
      amount: 5,
      note: "Had a nosey and got lucky",
    });
  }

  if (!callerIsAdmin) {
    await maybeGrantAdminBonus(trip.id, adminPlayerIds, rosterAdminPlayerIds);
  }

  return NextResponse.json({ ok: true, outcome: "won", reward });
}
