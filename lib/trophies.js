// Two trophy pools, picked from in the same spot (components/TrophyPicker.js)
// but sourced differently:
//
// - GENERIC: a fixed set of static placeholder images under
//   public/generic-trophies/ — reusable across any event, swap the files
//   for real illustrated art whenever it's ready, same as lib/icons.js.
// - EVENT: real artwork uploaded for one specific named event (e.g. Centre
//   Parcs 2026) via app/api/admin/upload-event-trophy — stored in Supabase
//   Storage and cataloged in the event_trophies table (see schema.sql),
//   not here, since the list is dynamic.
//
// A trip's `badge_id` is a plain string either way; trophySrc() is what
// tells the two pools apart when resolving one to an actual image.
export const GENERIC_TROPHY_IDS = [
  "badge-1",
  "badge-2",
  "badge-3",
  "badge-4",
  "badge-5",
  "badge-6",
  "badge-7",
  "badge-8",
  "badge-9",
];

export function genericTrophySrc(trophyId) {
  return GENERIC_TROPHY_IDS.includes(trophyId) ? `/generic-trophies/${trophyId}.png` : null;
}

// The one function everything else should actually call — checks the
// generic pool first (cheap, no lookup needed), then falls back to
// whatever event trophies the caller has loaded (see useBoardData's
// `eventTrophies`, sourced from the event_trophies table).
export function trophySrc(trophyId, eventTrophies) {
  if (!trophyId) return null;
  const generic = genericTrophySrc(trophyId);
  if (generic) return generic;
  return (eventTrophies || []).find((t) => t.id === trophyId)?.image_url || null;
}
