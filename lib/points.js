// Scoring rule for a single logged round, unchanged from the original
// board: 1 point for every participant you beat in that round. A field of
// n players hands out n-1 points to 1st place, down to 0 for last. This is
// the "standard" scoring format for a round — on top of it, an admin can
// hand out (or take away) arbitrary point_adjustments at any time (see
// totals() below), completely separate from any logged round.

export function eventPoints(event) {
  const ranking = event.ranking || [];
  const n = ranking.length;
  const pts = {};
  ranking.forEach((playerId, idx) => {
    pts[playerId] = n - 1 - idx;
  });
  return pts;
}

// Combines every logged round plus every free-form point adjustment into a
// sorted leaderboard: points desc, then rounds played desc, then name asc.
// `adjustments` is optional (defaults to none) so callers that only care
// about round-based scoring don't have to pass anything new.
export function totals(players, events, adjustments = []) {
  const points = {};
  const roundsPlayed = {};
  players.forEach((p) => {
    points[p.id] = 0;
    roundsPlayed[p.id] = 0;
  });

  events.forEach((ev) => {
    const pts = eventPoints(ev);
    Object.entries(pts).forEach(([playerId, value]) => {
      points[playerId] = (points[playerId] || 0) + value;
    });
    (ev.ranking || []).forEach((playerId) => {
      roundsPlayed[playerId] = (roundsPlayed[playerId] || 0) + 1;
    });
  });

  adjustments.forEach((adj) => {
    points[adj.player_id] = (points[adj.player_id] || 0) + adj.amount;
  });

  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      iconId: p.icon_id,
      points: points[p.id] || 0,
      roundsPlayed: roundsPlayed[p.id] || 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.roundsPlayed !== a.roundsPlayed) return b.roundsPlayed - a.roundsPlayed;
      return a.name.localeCompare(b.name);
    });
}

export function playerUsedInEvents(events, playerId) {
  return events.some((ev) => (ev.ranking || []).includes(playerId));
}
