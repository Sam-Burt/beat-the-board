import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../lib/supabaseAdmin";
import { pushConfigured, sendMissionPing } from "../../../lib/webpush";
import { recordNotification } from "../../../lib/notifications";

// There's no server cron running for a small family app like this — instead,
// any signed-in player's device calls this opportunistically on load (see
// lib/useBoardData.js) and it fires whatever scheduled missions have come
// due since the last time anyone happened to have the app open. That's why
// the admin picking a "hidden" send time really does stay hidden: nothing
// fires it early, and it only actually lands once somebody's phone checks in
// after that moment — could be seconds later, could be a while, same as the
// existing trip-deadline auto-finalize check.
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

  const { data: due } = await supabaseAdmin
    .from("scheduled_missions")
    .select("id, player_id, title, text, random, points")
    .is("sent_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .limit(20);

  if (!due?.length) {
    return NextResponse.json({ processed: 0 });
  }

  // Whichever trip is current when a scheduled mission actually fires, not
  // whichever was current when it was scheduled — same "no server cron,
  // resolved at the moment someone's device checks in" spirit as the trip
  // deadline auto-finalize check.
  const { data: currentTrip } = await supabaseAdmin
    .from("trips")
    .select("id")
    .in("status", ["active", "tied"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let pool = null;
  async function pickRandom() {
    if (pool === null) {
      const { data } = await supabaseAdmin.from("mission_templates").select("title, text, points");
      pool = data || [];
    }
    if (!pool.length) {
      return { title: null, text: "Do something sneaky before the day's out 👀", points: 5 };
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  let processed = 0;
  for (const row of due) {
    let title = row.title;
    let text = row.text;
    let points = row.points ?? 5;
    if (row.random) {
      const picked = await pickRandom();
      title = picked.title || null;
      text = picked.text;
      points = picked.points;
    }
    if (!text) continue;

    const { error: insertError } = await supabaseAdmin
      .from("missions")
      .insert({ player_id: row.player_id, title, text, points, trip_id: currentTrip?.id ?? null });
    if (insertError) continue;

    await recordNotification(row.player_id, {
      kind: "mission",
      title: "🤫 Shhh…",
      body: "You've got a secret mission 👀",
      url: "/missions",
    });

    if (pushConfigured) {
      const { data: subs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth_key")
        .eq("player_id", row.player_id);
      if (subs?.length) {
        const deadIds = await sendMissionPing(subs);
        if (deadIds.length) {
          await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
        }
      }
    }

    await supabaseAdmin
      .from("scheduled_missions")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", row.id);
    processed += 1;
  }

  return NextResponse.json({ processed });
}
