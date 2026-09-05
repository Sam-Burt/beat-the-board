// The set of "current champion" star designs. These are plain placeholder
// shapes (pink/violet/gold, matching the app's existing neon palette) —
// swap them for real illustrated art whenever it's ready, same pattern as
// icons.js and badges.js: drop a file in as public/stars/star-N.png and add
// "star-N" here. The champion display picks one of these at random whenever
// the leaderboard's #1 spot changes hands (see lib/useChampionStar.js), so
// more entries here means more variety in what shows up.
//
// Note: the original star-1.png this replaced was a stock cartoon-character
// graphic that turned out to include a rude gesture — not something to
// reuse as a base for future designs. These three were drawn from scratch
// as plain geometric shapes instead.
export const STAR_IDS = ["star-1", "star-2", "star-3"];

export function starSrc(starId) {
  return STAR_IDS.includes(starId) ? `/stars/${starId}.png` : `/stars/${STAR_IDS[0]}.png`;
}
