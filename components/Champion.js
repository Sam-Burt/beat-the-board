import { useChampionStar } from "../lib/useChampionStar";
import { starSrc } from "../lib/stars";

export default function Champion({ standings }) {
  // Hooks must run every render, so this is called before the early return
  // below — it no-ops until there's a real leader id to key off of.
  const starId = useChampionStar(standings[0]?.id);

  if (standings.length === 0) return null;
  const leader = standings[0];
  const second = standings[1];

  let leadText;
  if (!second || leader.points === 0) {
    leadText = "Waiting on the rest of the players to get on the board.";
  } else if (leader.points === second.points) {
    leadText = `Tied at the top with ${second.name}.`;
  } else {
    const diff = leader.points - second.points;
    leadText = `${diff} point${diff === 1 ? "" : "s"} clear of ${second.name}.`;
  }

  return (
    <div className="champion">
      <div className="champion-star-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="champion-star-img" src={starSrc(starId)} alt="" width={663} height={700} />
        <div className="champion-overlay">
          <div className="name">{leader.name}</div>
          <div className="pts">
            {leader.points}
            <span className="unit"> pts</span>
          </div>
          <div className="lead">{leadText}</div>
        </div>
      </div>
    </div>
  );
}
