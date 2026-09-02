// Scoring rule, unchanged from the original board: 1 point for every
// participant you beat in that event. A field of n players hands out
// n-1 points to 1st place, down to 0 for last.

export function eventPoints(event) {
  const ranking = event.ranking || [];
  const n = ranking.length;
  const pts = {};
  ranking.forEach((playerId, idx) => {
    pts[playerId] = n - 1 - idx;
  });
  return pts;
}

// Combines every event into a sorted leaderboard: points desc, then wins
// desc, then name asc (matches the original tie-break order exactly).
export function totals(players, events) {
  const points = {};
  const wins = {};
  players.forEach((p) => {
    points[p.id] = 0;
    wins[p.id] = 0;
  });

  events.forEach((ev) => {
    const pts = eventPoints(ev);
    Object.entries(pts).forEach(([playerId, value]) => {
      points[playerId] = (points[playerId] || 0) + value;
    });
    const ranking = ev.ranking || [];
    if (ranking.length) {
      const winnerId = ranking[0];
      wins[winnerId] = (wins[winnerId] || 0) + 1;
    }
  });

  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      iconId: p.icon_id,
      points: points[p.id] || 0,
      wins: wins[p.id] || 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.name.localeCompare(b.name);
    });
}

export function playerUsedInEvents(events, playerId) {
  return events.some((ev) => (ev.ranking || []).includes(playerId));
}
