"use client";

import { useState } from "react";

// Full-screen, un-dismissable takeover for an admin-authored announcement
// (see the Pop Up Creator on the Profile page) — same forced pattern as
// components/TradeAlert.js: no backdrop-dismiss, has to be a button. Unlike
// a trade, confirming or declining has no side effect beyond closing this
// out — has_decline is the admin's per-popup choice of whether there's a
// real either/or here or just the one "Got it" (or whatever they typed).
export default function PopupAlert({ popup, onRespond }) {
  const [responding, setResponding] = useState(false);

  if (!popup) return null;

  async function handle(confirmed) {
    if (responding) return;
    setResponding(true);
    await onRespond({ popupId: popup.id, confirmed });
    setResponding(false);
  }

  return (
    <div className="celebration-backdrop">
      <div className="card celebration-card" onClick={(e) => e.stopPropagation()}>
        {popup.icon && <div className="celebration-crown-emoji">{popup.icon}</div>}
        {popup.kicker && <div className="celebration-kicker">{popup.kicker}</div>}
        <h2 className="leroy-headline">{popup.headline}</h2>
        {popup.body && <p className="celebration-subtext">{popup.body}</p>}
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 20 }}>
          <button type="button" className="btn btn-primary" disabled={responding} onClick={() => handle(true)}>
            {responding ? "…" : popup.confirm_label || "Got it"}
          </button>
          {popup.has_decline && (
            <button
              type="button"
              className="btn btn-ghost btn-outline-pink"
              disabled={responding}
              onClick={() => handle(false)}
            >
              {responding ? "…" : popup.decline_label || "No"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
