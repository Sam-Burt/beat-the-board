"use client";

import { useState } from "react";
import { eventPoints } from "../lib/points";
import PlayerAvatar from "./PlayerAvatar";

function fmtDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export default function History({ players, events, isAdmin, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);

  if (events.length === 0) return null;

  function playerLabel(id) {
    const p = players.find((pl) => pl.id === id);
    if (!p) return <>(removed)</>;
    return (
      <>
        <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={18} /> {p.name}
      </>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>History</h2>
      </div>
      {events.map((ev) => {
        const pts = eventPoints(ev);
        const deleting = confirmId === ev.id;
        return (
          <div className="history-item" key={ev.id}>
            <div className="history-top">
              <h3>{ev.name}</h3>
              <span className="history-date">{fmtDate(ev.date)}</span>
            </div>
            <div className="history-results">
              {ev.ranking.map((pid, idx) => (
                <div className="row" key={pid + idx}>
                  <span className="place">{idx + 1}.</span>
                  <span className="hname">{playerLabel(pid)}</span>
                  <span className="pts">
                    {pts[pid] || 0} pt{pts[pid] === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
            {ev.note && <div className="history-note">{ev.note}</div>}
            {isAdmin && (
              <div className="history-actions">
                {deleting ? (
                  <>
                    <span className="muted" style={{ fontSize: 13 }}>
                      Delete this result?{" "}
                    </span>
                    <button
                      className="btn btn-danger"
                      style={{ padding: "4px 10px", fontSize: 13 }}
                      onClick={() => {
                        onDelete(ev.id);
                        setConfirmId(null);
                      }}
                    >
                      Delete
                    </button>{" "}
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 13 }}
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: "4px 10px", fontSize: 13 }}
                    onClick={() => setConfirmId(ev.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
