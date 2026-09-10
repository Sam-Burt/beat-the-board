// Scoring rule for a single logged round, unchanged from the original
// board: 1 point for every participant you beat in that round. A field of
// n players hands out n-1 points to 1st place, down to 0 for last. This is
// the "standard" scoring format for a round — on top of it, an admin can
// hand out (or take away) arbitrary point_adjustments at any time (see
// totals() below), completely separate from any logged round.
//
// A round's ranking is an ordered array of placement *groups* rather than
// a flat list of player ids — each group is whoever tied for that
// position. A normal solo result is just a run of singleton groups
// ([[a],[b],[c]]); a doubles match logs as one team per placement instead
// of forcing an arbitrary order between teammates ([[a,b],[c,d]]). A
// group occupying a block of positions splits the *average* of those
// positions' values across its members — since the values are always
// consecutive integers, that average is either a whole number or a clean
// .5, never anything messier.

export function eventPoints(event) {
  const groups = event.ranking || [];
  const n = groups.reduce((sum, g) => sum + g.length, 0);
  const pts = {};
  let position = 0;
  groups.forEach((group) => {
    const values = group.map((_, i) => n - 1 - (position + i));
    const share = values.reduce((a, b) => a + b, 0) / values.length;
    group.forEach((playerId) => {
      pts[playerId] = share;
    });
    position += group.length;
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
    (ev.ranking || []).flat().forEach((playerId) => {
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
      cheatCount: p.cheat_count || 0,
      points: points[p.id] || 0,
      roundsPlayed: roundsPlayed[p.id] || 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.roundsPlayed !== a.roundsPlayed) return b.roundsPlayed - a.roundsPlayed;
      return a.name.localeCompare(b.name);
    });
}
