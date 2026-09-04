"use client";

import { useState } from "react";
import { badgeSrc } from "../lib/badges";
import BadgePicker from "./BadgePicker";
import PlayerAvatar from "./PlayerAvatar";

function fmtDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtDeadline(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TripPanel({
  currentTrip,
  players,
  standings,
  onCreateTrip,
  onEndTripNow,
  onDeclareWinner,
}) {
  const [open, setOpen] = useState(!currentTrip || currentTrip.status === "finalized");

  // "Start a new trip" form state
  const [name, setName] = useState("");
  const [badgeId, setBadgeId] = useState(null);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [deadline, setDeadline] = useState("");
  const [rosterIds, setRosterIds] = useState([]);
  const [working, setWorking] = useState(false);

  const [endingNow, setEndingNow] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [decidingWinner, setDecidingWinner] = useState(null); // player id
  const [decidingWorking, setDecidingWorking] = useState(false);

  const topScore = standings?.[0]?.points;
  const tiedPlayerIds =
    currentTrip?.status === "tied" && standings
      ? standings.filter((s) => s.points === topScore).map((s) => s.id)
      : [];

  function toggleRoster(id) {
    setRosterIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const canCreate = name.trim() && rosterIds.length >= 1;

  async function handleCreate() {
    if (!canCreate) return;
    setWorking(true);
    const result = await onCreateTrip({
      name,
      badgeId,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      playerIds: rosterIds,
    });
    setWorking(false);
    if (result?.ok) {
      setName("");
      setBadgeId(null);
      setStartsOn("");
      setEndsOn("");
      setDeadline("");
      setRosterIds([]);
    }
  }

  async function handleEndNow() {
    setEndingNow(true);
    await onEndTripNow();
    setEndingNow(false);
    setConfirmEnd(false);
  }

  async function handleDeclare(playerId) {
    setDecidingWorking(true);
    await onDeclareWinner(playerId);
    setDecidingWorking(false);
    setDecidingWinner(null);
  }

  return (
    <div className="card">
      <button className="btn toggle-panel-btn" onClick={() => setOpen((o) => !o)}>
        <h2>Trip</h2>
        <span className={`chevron${open ? " open" : ""}`}>▾</span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {currentTrip && currentTrip.status !== "finalized" && (
            <div className="trip-status-card">
              {badgeSrc(currentTrip.badge_id) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="trip-status-badge" src={badgeSrc(currentTrip.badge_id)} alt="" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="trip-status-name">{currentTrip.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {currentTrip.starts_on && currentTrip.ends_on
                    ? `${fmtDate(currentTrip.starts_on)} – ${fmtDate(currentTrip.ends_on)}`
                    : "No date window set"}
                  {currentTrip.deadline && ` · deadline ${fmtDeadline(currentTrip.deadline)}`}
                </div>
              </div>
            </div>
          )}

          {currentTrip?.status === "active" && (
            <div style={{ marginTop: 12 }}>
              {confirmEnd ? (
                <div className="btn-row">
                  <span className="muted" style={{ fontSize: 13 }}>
                    Finalize this trip now and award the trophy?
                  </span>
                  <button className="btn btn-danger" disabled={endingNow} onClick={handleEndNow}>
                    {endingNow ? "Ending…" : "Yes, end it"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirmEnd(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="btn btn-ghost" onClick={() => setConfirmEnd(true)}>
                  End trip now
                </button>
              )}
            </div>
          )}

          {currentTrip?.status === "tied" && (
            <div className="banner-note" style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 8 }}>
                It&#39;s a tie at the deadline — pick who takes the trophy:
              </div>
              {players
                .filter((p) => tiedPlayerIds.includes(p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn"
                    style={{ marginRight: 8, marginBottom: 8 }}
                    disabled={decidingWorking}
                    onClick={() => setDecidingWinner(p.id)}
                  >
                    <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={16} /> {p.name}
                  </button>
                ))}
              {decidingWinner && (
                <div className="btn-row">
                  <span className="muted" style={{ fontSize: 13 }}>
                    Award the trophy to{" "}
                    {players.find((p) => p.id === decidingWinner)?.name}?
                  </span>
                  <button
                    className="btn btn-primary"
                    disabled={decidingWorking}
                    onClick={() => handleDeclare(decidingWinner)}
                  >
                    {decidingWorking ? "Saving…" : "Confirm"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setDecidingWinner(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {(!currentTrip || currentTrip.status === "finalized") && (
            <>
              {currentTrip?.status === "finalized" && (
                <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  <strong>{currentTrip.name}</strong> is finalized. Start the next one below.
                </p>
              )}
              <div className="field">
                <label htmlFor="trip-name">Trip name</label>
                <input
                  id="trip-name"
                  type="text"
                  placeholder="e.g. Centre Parcs Trip"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Badge (this trip&#39;s trophy)</label>
                <BadgePicker value={badgeId} onChange={setBadgeId} />
              </div>

              <div className="field" style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="trip-starts">Starts</label>
                  <input
                    id="trip-starts"
                    type="date"
                    value={startsOn}
                    onChange={(e) => setStartsOn(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="trip-ends">Ends</label>
                  <input
                    id="trip-ends"
                    type="date"
                    value={endsOn}
                    onChange={(e) => setEndsOn(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="trip-deadline">Deadline (triggers the winner)</label>
                <input
                  id="trip-deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Once this passes, the trophy goes to whoever&#39;s top of the board next time you
                  open the app (or leave it blank and use &quot;End trip now&quot; whenever you&#39;re
                  ready).
                </p>
              </div>

              <div className="field">
                <label>Who&#39;s playing?</label>
                {players.length === 0 ? (
                  <div className="empty">
                    No player accounts yet — add them in the Players panel below first.
                  </div>
                ) : (
                  <div className="chips">
                    {players.map((p) => {
                      const sel = rosterIds.includes(p.id);
                      return (
                        <button
                          type="button"
                          key={p.id}
                          className={`chip${sel ? " selected" : ""}`}
                          onClick={() => toggleRoster(p.id)}
                        >
                          <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={16} />
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="btn-row">
                <button className="btn btn-primary" disabled={!canCreate || working} onClick={handleCreate}>
                  {working ? "Starting…" : "Start trip"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
