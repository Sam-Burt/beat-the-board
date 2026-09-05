"use client";

import { useState } from "react";
import PlayerAvatar from "./PlayerAvatar";

export default function Board({ standings, trophyCounts, isAdmin, onAddPoints }) {
  const [openFor, setOpenFor] = useState(null); // player id
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sentFor, setSentFor] = useState(null);

  async function handleAddPoints(playerId) {
    if (!amount) return;
    setSending(true);
    const result = await onAddPoints({ playerId, amount, note: note.trim() });
    setSending(false);
    if (result !== false) {
      setAmount(1);
      setNote("");
      setOpenFor(null);
      setSentFor(playerId);
      setTimeout(() => setSentFor((id) => (id === playerId ? null : id)), 4000);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Leaderboard</h2>
      </div>
      {standings.length === 0 ? (
        <div className="empty">No players yet — add everyone playing below to start the board.</div>
      ) : (
        standings.map((p, i) => {
          const rank = i + 1;
          const badgeClass = rank === 1 ? "r1" : rank === 2 ? "r2" : rank === 3 ? "r3" : "";
          const wins = trophyCounts?.[p.id] || 0;
          const open = openFor === p.id;
          return (
            <div className="board-row-wrap" key={p.id}>
              <div className="board-row">
                <div className={`rank-badge ${badgeClass}`}>{rank}</div>
                <PlayerAvatar iconId={p.iconId} emoji={p.emoji} size={34} />
                <div className="board-name">
                  <div className="n">
                    <span className="name-text">{p.name}</span>
                    <span className="stat">
                      {p.roundsPlayed} round{p.roundsPlayed === 1 ? "" : "s"}
                    </span>
                    {wins > 0 && (
                      <span className="crown" title={`${wins} event${wins === 1 ? "" : "s"} won`}>
                        👑{wins > 1 && <span className="crown-count">{wins}</span>}
                      </span>
                    )}
                  </div>
                </div>
                <div className="board-pts num">{p.points}</div>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-ghost board-points-btn"
                    onClick={() => setOpenFor((cur) => (cur === p.id ? null : p.id))}
                  >
                    {sentFor === p.id ? "Added! ✓" : "±"}
                  </button>
                )}
              </div>
              {open && (
                <div className="points-composer">
                  <div className="points-amount-row">
                    <button
                      type="button"
                      className="points-step-btn"
                      onClick={() => setAmount((n) => n - 1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                    />
                    <button
                      type="button"
                      className="points-step-btn"
                      onClick={() => setAmount((n) => n + 1)}
                    >
                      +
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Reason (optional) — e.g. caught on secret mission"
                    maxLength={140}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={sending || !amount}
                      onClick={() => handleAddPoints(p.id)}
                    >
                      {sending
                        ? "Saving…"
                        : `${amount > 0 ? "Award" : "Deduct"} ${Math.abs(amount)} pt${
                            Math.abs(amount) === 1 ? "" : "s"
                          }`}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setOpenFor(null);
                        setAmount(1);
                        setNote("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
