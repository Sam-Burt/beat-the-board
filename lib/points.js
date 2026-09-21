// Scoring rule for a single logged round: 1st place scores a point for
// every player in the round, counting down to 1 point for last place — a
// field of n players hands out n points to 1st, down to 1 for last, so
// everyone gets something just for playing instead of last place scoring
// zero. This is the "standard" scoring format for a round — on top of it,
// an admin can hand out (or take away) arbitrary point_adjustments at any
// time (see totals() below), completely separate from any logged round.
//
// A round's ranking is an ordered array of placement *groups* rather than
// a flat list of player ids — each group is whoever tied for that
// position. A normal solo result is just a run of singleton groups
// ([[a],[b],[c]]); a doubles match logs as one team per placement instead
// of forcing an arbitrary order between teammates ([[a,b],[c,d]]). A group
// occupying a block of positions gets the TOP value of that block, full
// stop, for every member — not an average. A 2v2 in a 4-player field
// scores 4/4/2/2 rather than 3.5/3.5/1.5/1.5: no fractions, and nobody on
// a team is shorted for their teammate's placement, at the cost of a team
// round handing out more total points than a fully solo one would.
export function eventPoints(event) {
  const groups = event.ranking || [];
  const n = groups.reduce((sum, g) => sum + g.length, 0);
  const pts = {};
  let position = 0;
  groups.forEach((group) => {
    const top = n - position;
    group.forEach((playerId) => {
      pts[playerId] = top;
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
      cheatFlagged: !!p.cheat_flagged,
      points: points[p.id] || 0,
      roundsPlayed: roundsPlayed[p.id] || 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.roundsPlayed !== a.roundsPlayed) return b.roundsPlayed - a.roundsPlayed;
      return a.name.localeCompare(b.name);
    });
}
