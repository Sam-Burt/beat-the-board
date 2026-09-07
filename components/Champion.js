import { useChampionStar } from "../lib/useChampionStar";
import { starSrc } from "../lib/stars";

export default function Champion({ standings }) {
  // Hooks must run every render, so this is called before the early return
  // below — it no-ops until there's a real leader id to key off of.
  const starId = useChampionStar(standings[0]?.id);

  if (standings.length === 0) return null;
  const leader = standings[0];
  const second = standings[1];

  // Keep these short. The overlay only has room for two lines, and a
  // 30-character name (the profile input's max) plus a longer gag tips it
  // over and spills out of the star.
  let leadText;
  if (!second || leader.points === 0) {
    leadText = "Nobody's scored. Riveting stuff.";
  } else if (leader.points === second.points) {
    leadText = `Level with ${second.name}. Awkward.`;
  } else {
    const diff = leader.points - second.points;
    leadText = `${diff} clear of ${second.name}. Poor them.`;
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
