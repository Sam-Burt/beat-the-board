import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";

const GUESS_WINDOW_SECONDS = 60;

// Starts the target's 60-second guess clock — called by the TARGET's own
// client the moment it's actually about to show them the "You've been
// Leroy'd" popup (see lib/useLeroyAlert.js), not by app/api/leroy/reveal.
// Reveal only marks that he's struck; if the clock started there instead,
// it would just burn down in the background — someone who doesn't open
// the app for ten minutes after their round got logged would come back to
// find their window already expired without ever having seen it. This way
// Leroy really does wait "as long as it takes" the same way the rest of
// the trick does — the countdown only exists once someone's actually
// looking at it.
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
    .select("id, target_id, resolved_at, guess_deadline, guessed_at")
    .eq("id", leroySendId)
    .maybeSingle();
  if (!leroy) {
    return NextResponse.json({ error: "That doesn't exist." }, { status: 404 });
  }
  if (leroy.target_id !== me.id) {
    return NextResponse.json({ error: "This one isn't yours." }, { status: 403 });
  }
  if (!leroy.resolved_at) {
    return NextResponse.json({ error: "He hasn't struck yet." }, { status: 400 });
  }
  if (leroy.guessed_at) {
    return NextResponse.json({ ok: true, guessDeadline: leroy.guess_deadline });
  }
  if (leroy.guess_deadline) {
    // Already started — by this same client on an earlier render, or by
    // another of the target's own devices/tabs a moment ago. Everyone
    // converges on whichever deadline actually got written first.
    return NextResponse.json({ ok: true, guessDeadline: leroy.guess_deadline });
  }

  const guessDeadline = new Date(Date.now() + GUESS_WINDOW_SECONDS * 1000).toISOString();

  // Atomic claim on guess_deadline — only the first request to actually
  // flip it from null wins; a near-simultaneous second tab just gets back
  // whatever the winner set.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("leroy_sends")
    .update({ guess_deadline: guessDeadline })
    .eq("id", leroySendId)
    .is("guess_deadline", null)
    .select()
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 400 });

  if (!claimed) {
    const { data: existing } = await supabaseAdmin
      .from("leroy_sends")
      .select("guess_deadline")
      .eq("id", leroySendId)
      .maybeSingle();
    return NextResponse.json({ ok: true, guessDeadline: existing?.guess_deadline });
  }

  return NextResponse.json({ ok: true, guessDeadline });
}
