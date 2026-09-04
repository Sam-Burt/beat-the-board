"use client";

import { useState } from "react";
import { badgeSrc } from "../lib/badges";

export default function Header({ tripName, badgeId, isAdmin, onRename }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(tripName);

  function startRename() {
    setDraft(tripName);
    setRenaming(true);
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
    setRenaming(false);
  }

  const src = badgeSrc(badgeId);

  return (
    <div className="card header-card">
      {!isAdmin && <span className="readonly-badge corner">● Live</span>}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="header-trip-badge" src={src} alt="" />
      )}
      <div className="trip-name">
        {renaming ? (
          <div className="rename-row" style={{ width: "100%", justifyContent: "center" }}>
            <input
              type="text"
              value={draft}
              maxLength={60}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setRenaming(false);
              }}
            />
            <button className="btn btn-primary" onClick={save}>
              Save
            </button>
            <button className="btn btn-ghost" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <h1>{tripName}</h1>
            {isAdmin && (
              <button className="edit-pencil" aria-label="Rename event" onClick={startRename}>
                ✎
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
