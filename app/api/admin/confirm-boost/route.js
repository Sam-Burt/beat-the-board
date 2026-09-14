import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";

// The step that stops Jackpot being gamed around when results get logged:
// activating it (app/api/tricks/boost) only plants a marker, it doesn't do
// anything on its own. It only becomes live once the admin taps this —
// in person, at the table, before the round it's meant to cover actually
// gets played. Without that, a player could just watch themselves win (or
// already have won) and activate afterward, banking a double that was
// never actually at risk, since the admin logs results well after the
// fact rather than as they happen. There's no technical way to verify the
// timing beyond that — it's the same trust model as everything else an
// admin attests to in this app (cheat flags, VAR score revisions) — this
// route just gives them somewhere to do it.
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
  const boostId = body.boostId;
  if (!boostId) {
    return NextResponse.json({ error: "boostId is required." }, { status: 400 });
  }

  const { data: boost } = await supabaseAdmin
    .from("point_boosts")
    .select("id, resolved_at, confirmed_at, expires_at")
    .eq("id", boostId)
    .maybeSingle();
  if (!boost) {
    return NextResponse.json({ error: "That doesn't exist." }, { status: 404 });
  }
  if (boost.resolved_at) {
    return NextResponse.json({ error: "That's already been cashed in or expired." }, { status: 400 });
  }
  if (new Date(boost.expires_at) <= new Date()) {
    return NextResponse.json({ error: "That's already expired." }, { status: 400 });
  }
  if (boost.confirmed_at) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  const { error: updateError } = await supabaseAdmin
    .from("point_boosts")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", boostId)
    .is("confirmed_at", null);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
