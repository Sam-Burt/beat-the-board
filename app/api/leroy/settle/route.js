import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";

// Housekeeping tick for the "timer ran out and nobody guessed" case.
// app/api/leroy/guess only ever fires if the target actually taps a guess —
// if they don't (app closed, phone asleep, whatever), nothing else nudges
// the steal from "pending" to "settled" on its own. So any signed-in
// player's open client polls for this (see lib/useBoardData.js) and calls
// it once a pending guess's deadline has actually passed server-side.
// Same atomic claim on guessed_at as app/api/leroy/guess, so a real guess
// landing a moment before this still wins — this is a no-op either way if
// someone beat it to the claim.
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
  const leroySendId = body.leroySendId;
  if (!leroySendId) {
    return NextResponse.json({ error: "leroySendId is required." }, { status: 400 });
  }

  const { data: leroy } = await supabaseAdmin
    .from("leroy_sends")
    .select("id, trip_id, sender_id, target_id, amount, resolved_at, guess_deadline, guessed_at")
    .eq("id", leroySendId)
    .maybeSingle();
  if (!leroy || !leroy.resolved_at || leroy.guessed_at || !leroy.guess_deadline) {
    return NextResponse.json({ ok: true, settled: false });
  }
  if (new Date(leroy.guess_deadline) > new Date()) {
    return NextResponse.json({ ok: true, settled: false });
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("leroy_sends")
    .update({ guessed_at: now, guessed_player_id: null, guess_correct: false })
    .eq("id", leroySendId)
    .is("guessed_at", null)
    .select()
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 400 });
  if (!claimed) {
    return NextResponse.json({ ok: true, settled: false });
  }

  await supabaseAdmin.from("point_adjustments").insert([
    { trip_id: leroy.trip_id, player_id: leroy.target_id, amount: -leroy.amount, note: "Mugged blind — no idea who." },
    { trip_id: leroy.trip_id, player_id: leroy.sender_id, amount: leroy.amount, note: "Clean getaway." },
  ]);

  return NextResponse.json({ ok: true, settled: true });
}
