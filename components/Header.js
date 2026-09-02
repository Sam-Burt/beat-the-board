"use client";

import { useState } from "react";

export default function Header({ tripName, isAdmin, onRename }) {
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

  return (
    <div className="card header-card">
      <div className="topbar">
        <div className="trip-name">
          {renaming ? (
            <div className="rename-row" style={{ width: "100%" }}>
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
                <button className="edit-pencil" aria-label="Rename trip" onClick={startRename}>
                  ✎
                </button>
              )}
            </>
          )}
        </div>
        {!isAdmin && <span className="readonly-badge">● Live</span>}
      </div>
      <div className="subtitle">Player Leaderboard</div>
    </div>
  );
}
