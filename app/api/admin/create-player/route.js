import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "../../../../lib/supabaseAdmin";
import { normalizeUsername, usernameToEmail } from "../../../../lib/username";

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
  const name = (body.name || "").trim();
  const isSelf = !!body.isSelf;

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  let userId;
  let username = null;

  if (isSelf) {
    // The admin is also a player — link this player row straight to their
    // existing admin account instead of creating a second one.
    userId = callerId;
  } else {
    username = normalizeUsername(body.username);
    const password = body.password || "";
    if (!username || username.length < 3) {
      return NextResponse.json(
        { error: "Username needs to be at least 3 characters (letters, numbers, - or _)." },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password needs to be at least 6 characters." },
        { status: 400 }
      );
    }

    const { data: taken } = await supabaseAdmin
      .from("players")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (taken) {
      return NextResponse.json(
        { error: "That username's taken — try another." },
        { status: 400 }
      );
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(username),
      password,
      email_confirm: true,
      user_metadata: { name, username },
    });
    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }
    userId = created.user.id;
  }

  const { data: player, error: insertError } = await supabaseAdmin
    .from("players")
    .insert({ name, emoji: "", user_id: userId, username })
    .select()
    .single();

  if (insertError) {
    // Roll back the auth user we just created so retrying isn't blocked by
    // "email already registered".
    if (!isSelf) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ player });
}
