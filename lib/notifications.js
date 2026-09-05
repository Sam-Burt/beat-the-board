// SERVER-ONLY. Every push alert (secret mission or Hot Potato pass) also
// gets logged to the notifications table so a player can look it back up
// from the bell in the app, even if they missed the actual phone alert or
// never turned alerts on in the first place. Always insert this — it's the
// in-app record, independent of whether the push itself was configured or
// actually delivered.
import { supabaseAdmin } from "./supabaseAdmin";

export async function recordNotification(playerId, { kind, title, body, url }) {
  if (!supabaseAdmin || !playerId) return;
  await supabaseAdmin.from("notifications").insert({
    player_id: playerId,
    kind,
    title,
    body,
    url: url || null,
  });
}
