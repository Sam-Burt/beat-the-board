"use client";

import PlayerAvatar from "./PlayerAvatar";

// Full-screen takeover shown the moment a player opens the app after
// someone's sent Leroy after them (see lib/useLeroyAlert.js for the
// per-player "have I seen this one" dismissal, same shape as the trophy
// celebration). Reuses the celebration card/backdrop styling rather than
// inventing new chrome — this is the same "you opened the app, here's
// what happened" pattern as a win or a VAR overturn, just with a thief in
// it instead of a crown.
export default function LeroyAlert({ leroy, sender, onDismiss }) {
  if (!leroy) return null;
  const senderName = sender?.name || "Someone";

  return (
    <div className="celebration-backdrop" onClick={onDismiss}>
      <div className="card celebration-card celebration-card--leroy" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="celebration-crown" src="/icons/cheater-icon.png" alt="" />
        <div className="celebration-kicker">Uh oh</div>
        {sender && (
          <div className="celebration-winner">
            <PlayerAvatar iconId={sender.icon_id} emoji={sender.emoji} size={48} />
          </div>
        )}
        <h2 className="leroy-headline">{senderName} has sent Leroy to steal your shit!</h2>
        <p className="celebration-subtext">
          Next time you play anything, he&#39;s taking {leroy.amount} points off you and handing
          them straight to {senderName}. You&#39;ve got about 18 hours — play something and get
          it over with, or duck the board entirely if you&#39;re feeling brave.
        </p>
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 20 }}>
          <button type="button" className="btn btn-primary" onClick={onDismiss}>
            Yeah, alright
          </button>
        </div>
      </div>
    </div>
  );
}
