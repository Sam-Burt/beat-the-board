import { supabaseAdmin } from "./supabaseAdmin";
import { pushConfigured, sendMissionPing } from "./webpush";
import { recordNotification } from "./notifications";

// Sends any scheduled missions that have come due. Called from two places:
// app/api/cron (a real scheduled job, the reliable path) and
// app/api/process-due (fired opportunistically whenever a player's device
// happens to have the app open, kept as a backstop for if the cron ever
// silently dies). Safe to call as often as you like — a mission is stamped
// sent_at the moment it goes out, so it can't be sent twice.
export async function processDueMissions() {
  if (!supabaseAdmin) return { processed: 0, cancelled: 0 };

  const { data: due } = await supabaseAdmin
    .from("scheduled_missions")
    .select("id, player_id, title, text, random, points, trip_id, trips (status)")
    .is("sent_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .limit(20);

  if (!due?.length) return { processed: 0, cancelled: 0 };

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
  let cancelled = 0;
  for (const row of due) {
    // A queued mission belongs to the event it was queued for, and dies with
    // it. finalizeTrip already clears out a finished event's queue, so this
    // mostly catches rows queued before missions were tied to an event at
    // all — they can never fire meaningfully, so bin them rather than
    // leaving them to be re-examined forever.
    if (!row.trip_id || row.trips?.status === "finalized") {
      await supabaseAdmin.from("scheduled_missions").delete().eq("id", row.id);
      cancelled += 1;
      continue;
    }

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
      .insert({ player_id: row.player_id, title, text, points, trip_id: row.trip_id });
    if (insertError) continue;

    await recordNotification(row.player_id, {
      kind: "mission",
      title: "🤫 Don't tell anyone",
      body: "You've got a secret mission. Try not to bottle it like last time.",
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

  return { processed, cancelled };
}
