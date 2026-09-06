// The set of "current champion" star designs. Drop a file in as
// public/stars/star-N.png and add "star-N" here, same pattern as icons.js
// and badges.js. The champion display picks one of these at random whenever
// the leaderboard's #1 spot changes hands (see lib/useChampionStar.js), so
// more entries here means more variety in what shows up.
export const STAR_IDS = ["star-1", "star-2", "star-3"];

export function starSrc(starId) {
  return STAR_IDS.includes(starId) ? `/stars/${starId}.png` : `/stars/${STAR_IDS[0]}.png`;
}
