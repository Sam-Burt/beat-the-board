import PlayerAvatar from "./PlayerAvatar";

export default function Board({ standings }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Leaderboard</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          1 pt per person beaten
        </span>
      </div>
      {standings.length === 0 ? (
        <div className="empty">No players yet — add everyone playing below to start the board.</div>
      ) : (
        standings.map((p, i) => {
          const rank = i + 1;
          const badgeClass = rank === 1 ? "r1" : rank === 2 ? "r2" : rank === 3 ? "r3" : "";
          return (
            <div className="board-row" key={p.id}>
              <div className={`rank-badge ${badgeClass}`}>{rank}</div>
              <div className="board-name">
                <div className="n">
                  <PlayerAvatar iconId={p.iconId} emoji={p.emoji} size={22} />
                  {p.name}
                </div>
                <div className="stat">
                  {p.wins} event{p.wins === 1 ? "" : "s"} won
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
