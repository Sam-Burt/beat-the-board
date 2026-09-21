"use client";

import { useState } from "react";
import { rewardLabel } from "../lib/missionReward";

// Full-screen, un-dismissable takeover shown the moment a player opens the
// app with a trade proposal still waiting on them (see missionTrades in
// lib/useBoardData.js — this is fed whichever pending row has them as
// recipient_player_id). Deliberately no backdrop-dismiss and no "later"
// button: per the brief, it's Accept or Decline before anything else in the
// app works. If there's more than one pending trade queued up, resolving
// this one just surfaces the next — the caller re-runs its own find() the
// moment missionTrades updates.
export default function TradeAlert({ trade, proposerName, onRespond }) {
  const [responding, setResponding] = useState(false);

  if (!trade) return null;

  async function handle(accept) {
    if (responding) return;
    setResponding(true);
    await onRespond({ tradeId: trade.id, accept });
    setResponding(false);
  }

  return (
    <div className="celebration-backdrop">
      <div className="card celebration-card celebration-card--trade" onClick={(e) => e.stopPropagation()}>
        <div className="celebration-kicker">Incoming trade</div>
        <h2 className="leroy-headline">{proposerName || "Someone"} wants to swap</h2>
        <p className="celebration-subtext">
          Take it or leave it — no ignoring this one, it&#39;s not going away on its own.
        </p>

        <div className="trade-compare">
          <div className="trade-compare-side">
            <div className="trade-compare-label">You&#39;d give up</div>
            {trade.recipient_title && <div className="trade-compare-title">{trade.recipient_title}</div>}
            <div className="trade-compare-text">{trade.recipient_text}</div>
            <div className="trade-compare-points">
              Worth {rewardLabel(trade.recipient_reward_kind, trade.recipient_points)}
            </div>
          </div>
          <div className="trade-compare-arrow">⇅</div>
          <div className="trade-compare-side">
            <div className="trade-compare-label">You&#39;d get</div>
            {trade.proposer_title && <div className="trade-compare-title">{trade.proposer_title}</div>}
            <div className="trade-compare-text">{trade.proposer_text}</div>
            <div className="trade-compare-points">
              Worth {rewardLabel(trade.proposer_reward_kind, trade.proposer_points)}
            </div>
          </div>
        </div>

        <div className="btn-row" style={{ justifyContent: "center", marginTop: 20 }}>
          <button type="button" className="btn btn-primary" disabled={responding} onClick={() => handle(true)}>
            {responding ? "…" : "Accept"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-outline-pink"
            disabled={responding}
            onClick={() => handle(false)}
          >
            {responding ? "…" : "Decline"}
          </button>
        </div>
      </div>
    </div>
  );
}
