import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../../lib/supabaseAdmin";

// Any signed-in player can call this — only for their own popup, and only
// while it's still pending. Purely a status record: confirming or
// declining an admin-authored popup (see components/PopupAlert.js) has no
// side effect beyond closing it out, unlike a mission trade's swap.
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
  const popupId = body.popupId;
  const confirmed = !!body.confirmed;
  if (!popupId) {
    return NextResponse.json({ error: "popupId is required." }, { status: 400 });
  }

  const { data: popup } = await supabaseAdmin
    .from("popup_alerts")
    .select("id, status, players (user_id)")
    .eq("id", popupId)
    .maybeSingle();
  if (!popup || popup.players?.user_id !== callerId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (popup.status !== "pending") {
    return NextResponse.json({ error: "That's already been dealt with." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("popup_alerts")
    .update({ status: confirmed ? "confirmed" : "declined", responded_at: new Date().toISOString() })
    .eq("id", popupId)
    .eq("status", "pending");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
