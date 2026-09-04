"use client";

import PlayerAvatar from "./PlayerAvatar";
import { badgeSrc } from "../lib/badges";

const CONFETTI_COUNT = 18;
const CONFETTI = Array.from({ length: CONFETTI_COUNT }, (_, i) => i);

// Full-screen takeover shown the moment an event's deadline finalizes a
// winner (see lib/useEventCelebration.js) — whoever has the app open at
// that point sees the badge, the winner's name/icon and their final score
// before dismissing it. Purely CSS confetti/pop-in, no libraries.
export default function EventCelebration({ trophy, winner, onDismiss }) {
  if (!trophy) return null;
  const src = badgeSrc(trophy.badge_id);

  return (
    <div className="celebration-backdrop" onClick={onDismiss}>
      <div className="celebration-confetti" aria-hidden="true">
        {CONFETTI.map((i) => (
          <span key={i} className={`confetti-piece c${i % 6}`} style={{ "--i": i }} />
        ))}
      </div>
      <div className="card celebration-card" onClick={(e) => e.stopPropagation()}>
        <div className="celebration-kicker">🏆 Event won!</div>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="celebration-badge" src={src} alt="" />
        )}
        <div className="celebration-winner">
          {winner && <PlayerAvatar iconId={winner.icon_id} emoji={winner.emoji} size={56} />}
          <div className="celebration-name">{winner ? winner.name : "Someone"}</div>
        </div>
        <div className="celebration-points">
          {trophy.points} point{trophy.points === 1 ? "" : "s"}
        </div>
        <div className="celebration-trip">{trophy.trip_name}</div>
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 20 }}>
          <button type="button" className="btn btn-primary" onClick={onDismiss}>
            Nice!
          </button>
        </div>
      </div>
    </div>
  );
}
