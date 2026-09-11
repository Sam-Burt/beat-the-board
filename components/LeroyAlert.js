"use client";

import { useEffect, useState } from "react";
import PlayerAvatar from "./PlayerAvatar";

// Full-screen takeover shown the moment a player opens the app after
// Leroy's actually struck (see lib/useLeroyAlert.js) — never before that,
// since sending him is silent by design. This is the whole game: a
// 60-second countdown (kept server-authoritative — see app/api/leroy/guess,
// which checks the real deadline rather than trusting this component's own
// clock) to pick who sent him. Guess right before it runs out and it pays
// off; guess wrong, pick nobody, or run out the clock and the popup just
// closes with nothing to show for it.
export default function LeroyAlert({ leroy, tripPlayers, me, onGuess, onDismiss }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [guessing, setGuessing] = useState(false);
  const [result, setResult] = useState(null); // { correct: boolean } | null

  useEffect(() => {
    if (!leroy) return;
    function tick() {
      const ms = new Date(leroy.guess_deadline).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [leroy]);

  if (!leroy) return null;

  const timedOut = secondsLeft <= 0 && !result;
  const done = !!result || timedOut;

  async function handlePick(playerId) {
    if (guessing || done) return;
    setGuessing(true);
    // onGuess is callAdminApi under the hood — the actual { ok, correct }
    // payload from the route lands in res.data, not res itself (res.ok
    // just means "the request went through").
    const res = await onGuess({ leroySendId: leroy.id, guessedPlayerId: playerId });
    setGuessing(false);
    setResult({ correct: !!res?.data?.correct });
  }

  const suspects = (tripPlayers || []).filter((p) => p.id !== me?.id);

  return (
    <div className="celebration-backdrop" onClick={done ? onDismiss : undefined}>
      <div className="card celebration-card celebration-card--leroy" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="celebration-crown" src="/icons/cheater-icon.png" alt="" />
        <div className="celebration-kicker">Uh oh</div>
        <h2 className="leroy-headline">You&#39;ve been Leroy&#39;d!</h2>

        {!done && (
          <>
            <p className="celebration-subtext">
              Someone sent him after you. Guess who before the clock runs out and get your 5
              back, plus 5 more out of their pocket.
            </p>
            <div className="leroy-timer">{secondsLeft}s</div>
            <div className="chips" style={{ justifyContent: "center", marginTop: 14 }}>
              {suspects.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="chip"
                  disabled={guessing}
                  onClick={() => handlePick(p.id)}
                >
                  <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={20} />
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}

        {result && (
          <p className="celebration-subtext">
            {result.correct
              ? "Got it. Your 5 back, plus 5 more out of their pocket."
              : "Wrong. You'll never know who it was."}
          </p>
        )}

        {timedOut && <p className="celebration-subtext">Too slow. You&#39;ll never know who it was.</p>}

        {done && (
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 20 }}>
            <button type="button" className="btn btn-primary" onClick={onDismiss}>
              Yeah, alright
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
