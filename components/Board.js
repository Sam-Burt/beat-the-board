import PlayerAvatar from "./PlayerAvatar";

export default function Board({ standings, trophyCounts }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Leaderboard</h2>
      </div>
      {standings.length === 0 ? (
        <div className="empty">No players yet — add everyone playing below to start the board.</div>
      ) : (
        standings.map((p, i) => {
          const rank = i + 1;
          const badgeClass = rank === 1 ? "r1" : rank === 2 ? "r2" : rank === 3 ? "r3" : "";
          const wins = trophyCounts?.[p.id] || 0;
          return (
            <div className="board-row" key={p.id}>
              <div className={`rank-badge ${badgeClass}`}>{rank}</div>
              <PlayerAvatar iconId={p.iconId} emoji={p.emoji} size={34} />
              <div className="board-name">
                <div className="n">
                  <span className="name-text">{p.name}</span>
                  <span className="stat">
                    {p.roundsPlayed} round{p.roundsPlayed === 1 ? "" : "s"}
                  </span>
                  {wins > 0 && (
                    <span className="crown" title={`${wins} trip${wins === 1 ? "" : "s"} won`}>
                      👑{wins > 1 && <span className="crown-count">{wins}</span>}
                    </span>
                  )}
                </div>
              </div>
              <div className="board-pts num">{p.points}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
