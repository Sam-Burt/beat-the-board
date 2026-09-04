"use client";

import { useState } from "react";
import { playerUsedInEvents } from "../lib/points";
import { iconSrc } from "../lib/icons";
import { normalizeUsername } from "../lib/username";

function randomPassword() {
  // Not cryptographically fussy — this is a temporary password Sam reads
  // out to a family member, who can be told to change it later if wanted.
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function PlayersPanel({
  players,
  events,
  rosterIdSet,
  onCreate,
  onRemove,
  onSendMission,
  onAddPoints,
}) {
  const [open, setOpen] = useState(players.length === 0);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [isSelf, setIsSelf] = useState(false);
  const [working, setWorking] = useState(false);
  const [justCreated, setJustCreated] = useState(null); // { name, username, password }
  const [missionOpenFor, setMissionOpenFor] = useState(null); // player id
  const [missionText, setMissionText] = useState("");
  const [missionSending, setMissionSending] = useState(false);
  const [missionSentFor, setMissionSentFor] = useState(null);
  const [pointsOpenFor, setPointsOpenFor] = useState(null); // player id
  const [pointsAmount, setPointsAmount] = useState(1);
  const [pointsNote, setPointsNote] = useState("");
  const [pointsSending, setPointsSending] = useState(false);
  const [pointsSentFor, setPointsSentFor] = useState(null);

  async function handleAddPoints(playerId) {
    if (!pointsAmount) return;
    setPointsSending(true);
    const result = await onAddPoints({ playerId, amount: pointsAmount, note: pointsNote.trim() });
    setPointsSending(false);
    if (result !== false) {
      setPointsAmount(1);
      setPointsNote("");
      setPointsOpenFor(null);
      setPointsSentFor(playerId);
      setTimeout(() => setPointsSentFor((id) => (id === playerId ? null : id)), 4000);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isSelf && (!username.trim() || password.length < 6)) return;
    setWorking(true);
    const result = await onCreate({ name, username, password, isSelf });
    setWorking(false);
    if (result?.ok) {
      setJustCreated(isSelf ? null : { name, username: normalizeUsername(username), password });
      setName("");
      setUsername("");
      setPassword(randomPassword());
      setIsSelf(false);
    }
  }

  async function handleSendMission(playerId) {
    if (!missionText.trim()) return;
    setMissionSending(true);
    const result = await onSendMission({ playerId, text: missionText.trim() });
    setMissionSending(false);
    if (result?.ok) {
      setMissionText("");
      setMissionOpenFor(null);
      setMissionSentFor(playerId);
      setTimeout(() => setMissionSentFor((id) => (id === playerId ? null : id)), 4000);
    }
  }

  return (
    <div className="card">
      <button className="btn toggle-panel-btn" onClick={() => setOpen((o) => !o)}>
        <h2>Players</h2>
        <span className={`chevron${open ? " open" : ""}`}>▾</span>
      </button>

      {open && (
        <>
          <div style={{ marginTop: 10 }}>
            {players.length === 0 ? (
              <div className="empty">No one added yet.</div>
            ) : (
              players.map((p) => {
                const used = playerUsedInEvents(events, p.id);
                const src = iconSrc(p.icon_id);
                const missionOpen = missionOpenFor === p.id;
                return (
                  <div className="player-row-wrap" key={p.id}>
                    <div className="player-row">
                      <div className="player-emoji">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
                        ) : (
                          p.emoji || "👤"
                        )}
                      </div>
                      <div className="pname">
                        {p.name}
                        {!p.user_id && (
                          <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                            no account
                          </span>
                        )}
                      </div>
                      {rosterIdSet?.has(p.id) && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            setPointsOpenFor((cur) => (cur === p.id ? null : p.id))
                          }
                        >
                          {pointsSentFor === p.id ? "Added! ✓" : "±Points"}
                        </button>
                      )}
                      {p.user_id && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            setMissionOpenFor((cur) => (cur === p.id ? null : p.id))
                          }
                        >
                          {missionSentFor === p.id ? "Sent! 🎯" : "Mission"}
                        </button>
                      )}
                      {used ? (
                        <div className="used">in results</div>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          aria-label="Remove"
                          onClick={() => onRemove(p.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {missionOpen && (
                      <div className="mission-composer">
                        <textarea
                          placeholder={`Secret mission for ${p.name}…`}
                          maxLength={280}
                          value={missionText}
                          onChange={(e) => setMissionText(e.target.value)}
                          rows={3}
                        />
                        <div className="btn-row">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={missionSending || !missionText.trim()}
                            onClick={() => handleSendMission(p.id)}
                          >
                            {missionSending ? "Sending…" : "Send mission"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              setMissionOpenFor(null);
                              setMissionText("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                          They&#39;ll see it on their Missions tab under &quot;My Eyes
                          Only&quot; — and get a phone alert if they&#39;ve turned mission
                          alerts on (it won&#39;t reveal the text on their lock screen).
                        </p>
                      </div>
                    )}
                    {pointsOpenFor === p.id && (
                      <div className="points-composer">
                        <div className="points-amount-row">
                          <button
                            type="button"
                            className="points-step-btn"
                            onClick={() => setPointsAmount((n) => n - 1)}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={pointsAmount}
                            onChange={(e) => setPointsAmount(Number(e.target.value))}
                          />
                          <button
                            type="button"
                            className="points-step-btn"
                            onClick={() => setPointsAmount((n) => n + 1)}
                          >
                            +
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Reason (optional) — e.g. caught on secret mission"
                          maxLength={140}
                          value={pointsNote}
                          onChange={(e) => setPointsNote(e.target.value)}
                          style={{ marginTop: 8 }}
                        />
                        <div className="btn-row">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={pointsSending || !pointsAmount}
                            onClick={() => handleAddPoints(p.id)}
                          >
                            {pointsSending
                              ? "Saving…"
                              : `${pointsAmount > 0 ? "Award" : "Deduct"} ${Math.abs(
                                  pointsAmount
                                )} pt${Math.abs(pointsAmount) === 1 ? "" : "s"}`}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              setPointsOpenFor(null);
                              setPointsAmount(1);
                              setPointsNote("");
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

          {justCreated && (
            <div className="banner-note" style={{ marginTop: 14 }}>
              Account created for <strong>{justCreated.name}</strong>. Give them these to sign in
              at <code>/login</code> (they won&#39;t be shown again):
              <br />
              Username: <code>{justCreated.username}</code>
              <br />
              Password: <code>{justCreated.password}</code>
            </div>
          )}

          <form className="field" style={{ marginTop: 14 }} onSubmit={handleSubmit}>
            <label htmlFor="new-player-name">Add a player</label>
            <input
              id="new-player-name"
              type="text"
              placeholder="Name"
              maxLength={30}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ marginBottom: 8 }}
            />

            <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}>
              <input
                type="checkbox"
                checked={isSelf}
                onChange={(e) => setIsSelf(e.target.checked)}
                style={{ width: "auto" }}
              />
              This is me — links this entry to my own admin login instead of
              creating a new one (only tick this when you're adding
              yourself; leave it unticked for everyone else)
            </label>

            {!isSelf && (
              <>
                <input
                  type="text"
                  placeholder="username they'll sign in with, e.g. dan"
                  maxLength={20}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ marginTop: 8, marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setPassword(randomPassword())}
                  >
                    New
                  </button>
                </div>
              </>
            )}

            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={working}>
                {working ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
