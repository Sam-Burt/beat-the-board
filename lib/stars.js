// The set of "current champion" star designs. Only one exists today
// (star-1, the original champion-star art) — drop more files in as
// public/stars/star-N.png and add "star-N" here, exactly like icons.js and
// badges.js. The champion display picks one of these at random whenever the
// leaderboard's #1 spot changes hands (see lib/useChampionStar.js), so more
// entries here means more variety in what shows up.
export const STAR_IDS = ["star-1"];

export function starSrc(starId) {
  return STAR_IDS.includes(starId) ? `/stars/${starId}.png` : `/stars/${STAR_IDS[0]}.png`;
}
