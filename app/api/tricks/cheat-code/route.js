import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";

const REUSE_PENALTY = 5;

// Any signed-in player can call this. A real code, entered for the first
// time this event, rolls a flat 50/25/25: 5 points, an extra Leroy charge,
// or an extra Jackpot charge (see lib/useBoardData.js for how those extra
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

  const roll = Math.random();
  const reward = roll < 0.5 ? "points" : roll < 0.75 ? "leroy" : "jackpot";

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
        note: "Cheat code — tried to reuse one, greedy bastard",
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
      note: "Cheat code — got lucky",
    });
  }

  return NextResponse.json({ ok: true, outcome: "won", reward });
}
