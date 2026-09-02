"use client";

import { useState } from "react";
import PlayerAvatar from "./PlayerAvatar";

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function LogResultForm({ players, onSave }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState([]);
  const [ranking, setRanking] = useState([]);

  function reset() {
    setName("");
    setDate(todayISO());
    setNote("");
    setSelected([]);
    setRanking([]);
  }

  function toggleSelected(id) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        setRanking((r) => r.filter((x) => x !== id));
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  function tapRank(id) {
    setRanking((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function undoRank() {
    setRanking((prev) => prev.slice(0, -1));
  }

  const canSave = name.trim() && selected.length >= 2 && ranking.length === selected.length;

  async function handleSave() {
    if (!canSave) return;
    const ok = await onSave({ name, date, note, ranking });
    if (ok !== false) {
      reset();
      setOpen(false);
    }
  }

  return (
    <div className="card">
      <button className="btn toggle-panel-btn" onClick={() => setOpen((o) => !o)}>
        <h2>+ Log a result</h2>
        <span className={`chevron${open ? " open" : ""}`}>▾</span>
      </button>

      {open && players.length < 2 && (
        <div className="empty">Add at least two players first, then come back to log a result.</div>
      )}

      {open && players.length >= 2 && (
        <>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="ev-name">What was the event?</label>
            <input
              id="ev-name"
              type="text"
              placeholder="e.g. Uno, tennis, Fortnite kills"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ev-date">Date</label>
            <input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="field">
            <label>Who played?</label>
            <div className="chips">
              {players.map((p) => {
                const sel = selected.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    className={`chip${sel ? " selected" : ""}`}
                    onClick={() => toggleSelected(p.id)}
                  >
                    <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={16} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          {selected.length >= 2 && (
            <div className="field">
              <label>Tap in order of finish — winner first</label>
              <div className="step-hint">
                {ranking.length} of {selected.length} placed
              </div>
              <div className="chips">
                {selected.map((id) => {
                  const p = players.find((pl) => pl.id === id);
                  if (!p) return null;
                  const rankIdx = ranking.indexOf(id);
                  const ranked = rankIdx !== -1;
                  return (
                    <button
                      type="button"
                      key={id}
                      className={`chip${ranked ? " ranked" : ""}`}
                      disabled={ranked}
                      onClick={() => tapRank(id)}
                    >
                      {ranked && <span className="badge-num">{rankIdx + 1}</span>}
                      <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={16} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
              {ranking.length > 0 && (
                <div className="btn-row">
                  <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={undoRank}>
                    Undo last
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="ev-note">Note (optional)</label>
            <textarea
              id="ev-note"
              rows={2}
              placeholder="Anything worth remembering?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="btn-row">
            <button className="btn btn-primary" disabled={!canSave} onClick={handleSave}>
              Save result
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
