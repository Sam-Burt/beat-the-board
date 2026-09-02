"use client";

import { useState } from "react";
import { playerUsedInEvents } from "../lib/points";
import { iconSrc } from "../lib/icons";

function randomPassword() {
  // Not cryptographically fussy — this is a temporary password Sam reads
  // out to a family member, who can be told to change it later if wanted.
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function PlayersPanel({ players, events, onCreate, onRemove }) {
  const [open, setOpen] = useState(players.length === 0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [isSelf, setIsSelf] = useState(false);
  const [working, setWorking] = useState(false);
  const [justCreated, setJustCreated] = useState(null); // { name, email, password }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isSelf && (!email.trim() || password.length < 6)) return;
    setWorking(true);
    const result = await onCreate({ name, email, password, isSelf });
    setWorking(false);
    if (result?.ok) {
      setJustCreated(isSelf ? null : { name, email, password });
      setName("");
      setEmail("");
      setPassword(randomPassword());
      setIsSelf(false);
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
                return (
                  <div className="player-row" key={p.id}>
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
                );
              })
            )}
          </div>

          {justCreated && (
            <div className="banner-note" style={{ marginTop: 14 }}>
              Account created for <strong>{justCreated.name}</strong>. Give them these to sign in
              at <code>/login</code> (they won&#39;t be shown again):
              <br />
              Email: <code>{justCreated.email}</code>
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
              This is me (link to my own admin account, no new login needed)
            </label>

            {!isSelf && (
              <>
                <input
                  type="email"
                  placeholder="their email (made up is fine, no confirmation needed)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
