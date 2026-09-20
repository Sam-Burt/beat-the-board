import { supabaseAdmin } from "./supabaseAdmin";

// Picks a random task from the pool for this player — excluding anything
// already sent to them FROM THE POOL this event (see missions.template_id,
// set whenever a mission actually came from a template rather than being
// typed by hand). Two distinct ways this can come back with nothing: the
// pool itself has never had anything added to it ("empty"), or this
// specific player has already had every task currently in it this event
// ("exhausted"). Callers decide what to do with each.
export async function pickPoolTask(tripId, playerId) {
  const { data: pool } = await supabaseAdmin
    .from("mission_templates")
    .select("id, title, text, points, reward_kind");
  if (!pool?.length) return { status: "empty" };

  const { data: used } = await supabaseAdmin
    .from("missions")
    .select("template_id")
    .eq("trip_id", tripId)
    .eq("player_id", playerId)
    .not("template_id", "is", null);
  const usedIds = new Set((used || []).map((m) => m.template_id));
  const available = pool.filter((t) => !usedIds.has(t.id));
  if (!available.length) return { status: "exhausted" };

  return { status: "ok", task: available[Math.floor(Math.random() * available.length)] };
}
