// What a mission's reward is worth, in words — shared between the live
// Missions tab and Secret Missions Review. Only "points" cares about the
// actual number; Leroy/Jackpot are a flat extra charge, same as a cheat
// code win (see app/api/missions/upload-proof, which is what actually
// grants it on completion).
export function rewardLabel(rewardKind, points) {
  if (rewardKind === "leroy") return "an extra Leroy";
  if (rewardKind === "jackpot") return "an extra Jackpot";
  return `${points} pt${points === 1 ? "" : "s"}`;
}
