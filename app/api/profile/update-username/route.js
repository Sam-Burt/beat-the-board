import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser, isAdminUser } from "../../../../lib/supabaseAdmin";
import { normalizeUsername, usernameToEmail } from "../../../../lib/username";

// Lets ANY signed-in player (not just the admin) change their own login
// username. This needs the service role key for two reasons a plain client
// update can't do: (1) enforcing uniqueness against everyone else's
// username, and (2) — for non-admin players — updating the real Supabase
// Auth email underneath it (since that's derived from the username) without
// triggering Supabase's normal "confirm both old and new email" flow, which
// would never complete since these are made-up addresses with no inbox.
//
// The admin's own account keeps its real email untouched either way — see
// the isAdminUser check below — so this never breaks their sign-in.
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
  const username = normalizeUsername(body.username);
  if (!username || username.length < 3) {
    return NextResponse.json(
      { error: "Username needs to be at least 3 characters (letters, numbers, - or _)." },
      { status: 400 }
    );
  }

  const { data: myPlayer, error: myPlayerError } = await supabaseAdmin
    .from("players")
    .select("id, username")
    .eq("user_id", callerId)
    .maybeSingle();
  if (myPlayerError || !myPlayer) {
    return NextResponse.json(
      { error: "No player profile is linked to your account." },
      { status: 400 }
    );
  }

  if (myPlayer.username !== username) {
    const { data: taken } = await supabaseAdmin
      .from("players")
      .select("id")
      .ilike("username", username)
      .neq("id", myPlayer.id)
      .maybeSingle();
    if (taken) {
      return NextResponse.json(
        { error: "That username's taken — try another." },
        { status: 400 }
      );
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("players")
    .update({ username })
    .eq("id", myPlayer.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // The admin signs in with their real email and always will — don't
  // touch it. Everyone else's login email is just derived from their
  // username, so keep it in sync.
  const callerIsAdmin = await isAdminUser(callerId);
  if (!callerIsAdmin) {
    const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(callerId, {
      email: usernameToEmail(username),
      email_confirm: true,
    });
    if (emailError) {
      return NextResponse.json({ error: emailError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ username });
}
