// The fixed set of trophy badges Sam can pick from when setting up a new
// trip — same placeholder-swap pattern as lib/icons.js. Whichever badge is
// chosen becomes that trip's "profile picture" above its name, and — if the
// trip has a winner — the badge that lands in their Trophies collection.
// Swap the files in public/badges/ for real illustrated art whenever it's
// ready; these ids don't need to change.
export const BADGE_IDS = [
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

export function badgeSrc(badgeId) {
  return BADGE_IDS.includes(badgeId) ? `/badges/${badgeId}.png` : null;
}
