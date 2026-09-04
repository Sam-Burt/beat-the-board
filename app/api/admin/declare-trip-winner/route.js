import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { finalizeTrip } from "../../../../lib/tripFinalize";

// Used only when the current trip's status is "tied" (finalize-trip found
// more than one player sharing the top score at the deadline) — the admin
// picks which of the tied players actually gets the trophy.
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
  const winnerId = body.winnerId;
  if (!winnerId) {
    return NextResponse.json({ error: "Pick who won." }, { status: 400 });
  }

  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("*")
    .eq("status", "tied")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "There's no tied trip waiting on a decision." }, { status: 400 });
  }

  const result = await finalizeTrip(trip, winnerId);
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
