import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";

// The target's one shot at guessing who sent Leroy, within the 60-second
// window app/api/leroy/reveal opened. Guess right and it pays off — wrong,
// too late, or a second attempt after the first one's already landed all
// come back the same: no reveal, no payout. The deadline is enforced here
// server-side (not just the client's own countdown) since that's the only
// copy of "now" that actually matters.
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
  const guessedPlayerId = body.guessedPlayerId;
  if (!leroySendId || !guessedPlayerId) {
    return NextResponse.json({ error: "Pick who you think it was." }, { status: 400 });
  }

  const { data: me } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("user_id", callerId)
    .maybeSingle();
  if (!me) {
    return NextResponse.json({ error: "No player profile is linked to your account." }, { status: 400 });
  }

  const { data: leroy } = await supabaseAdmin
    .from("leroy_sends")
    .select("id, trip_id, sender_id, target_id, amount, resolved_at, guess_deadline, guessed_at")
    .eq("id", leroySendId)
    .maybeSingle();
  if (!leroy) {
    return NextResponse.json({ error: "That doesn't exist." }, { status: 404 });
  }
  if (leroy.target_id !== me.id) {
    return NextResponse.json({ error: "This one isn't yours to guess." }, { status: 403 });
  }
  if (!leroy.resolved_at) {
    return NextResponse.json({ error: "He hasn't struck yet." }, { status: 400 });
  }

  const now = new Date();
  const withinWindow = leroy.guess_deadline && now <= new Date(leroy.guess_deadline);
  const correct = withinWindow && guessedPlayerId === leroy.sender_id;

  // Atomic claim on guessed_at — one attempt, whichever request actually
  // flips it from null wins. A retry after that (double-tap, slow network
  // resubmit) just comes back with whatever the first attempt decided.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("leroy_sends")
    .update({ guessed_at: now.toISOString(), guessed_player_id: guessedPlayerId, guess_correct: correct })
    .eq("id", leroySendId)
    .is("guessed_at", null)
    .select()
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 400 });

  if (!claimed) {
    const { data: existing } = await supabaseAdmin
      .from("leroy_sends")
      .select("guess_correct")
      .eq("id", leroySendId)
      .maybeSingle();
    return NextResponse.json({ ok: true, correct: !!existing?.guess_correct });
  }

  if (correct) {
    await supabaseAdmin.from("point_adjustments").insert([
      {
        trip_id: leroy.trip_id,
        player_id: leroy.target_id,
        amount: leroy.amount * 2,
        note: "Caught Leroy's sender — refund plus bounty",
      },
      {
        trip_id: leroy.trip_id,
        player_id: leroy.sender_id,
        amount: -leroy.amount,
        note: "Leroy blew your cover — bounty paid",
      },
    ]);
  }

  return NextResponse.json({ ok: true, correct });
}
