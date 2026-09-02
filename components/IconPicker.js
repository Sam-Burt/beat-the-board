"use client";

import { useState } from "react";
import { ICON_IDS, iconSrc } from "../lib/icons";

// Shown once to a signed-in player whose account isn't linked to a profile
// icon yet. Picking one calls updateMyIcon and the prompt won't come back
// (me.icon_id will be set on the next realtime refresh).
export default function IconPicker({ onPick }) {
  const [working, setWorking] = useState(null); // icon id currently saving

  async function pick(id) {
    setWorking(id);
    await onPick(id);
    setWorking(null);
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Pick your icon</h2>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 14 }}>
        This shows up next to your name on the board. You can change it later.
      </p>
      <div className="icon-picker-grid">
        {ICON_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="icon-picker-btn"
            disabled={working !== null}
            onClick={() => pick(id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSrc(id)} alt="" width={56} height={56} />
            {working === id && <span className="icon-picker-saving">Saving…</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
