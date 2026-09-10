"use client";

import { useState } from "react";
import PlayerAvatar from "./PlayerAvatar";

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function teamName(team, players) {
  return team
    .map((id) => players.find((p) => p.id === id)?.name || "?")
    .join(" + ");
}

export default function LogResultForm({ players, onSave }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState([]);
  const [ranking, setRanking] = useState([]);

  // Team mode: instead of ranking individuals, players get grouped into
  // teams first (e.g. doubles at tennis or badminton), then the teams
  // themselves get ranked — a team's points for that placement split
  // evenly across its members. `teams` builds up as an array of arrays,
  // with the last one being whichever bucket taps currently land in.
  const [teamMode, setTeamMode] = useState(false);
  const [teams, setTeams] = useState([[]]);
  const [teamPhase, setTeamPhase] = useState("assign"); // "assign" | "rank"
  const [teamRanking, setTeamRanking] = useState([]); // indices into nonEmptyTeams

  function reset() {
    setName("");
    setDate(todayISO());
    setNote("");
    setSelected([]);
    setRanking([]);
    setTeamMode(false);
    setTeams([[]]);
    setTeamPhase("assign");
    setTeamRanking([]);
  }

  function resetTeams() {
    setTeams([[]]);
    setTeamPhase("assign");
    setTeamRanking([]);
  }

  function toggleSelected(id) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        setRanking((r) => r.filter((x) => x !== id));
        resetTeams();
        return prev.filter((x) => x !== id);
      }
      resetTeams();
      return [...prev, id];
    });
  }

  function tapRank(id) {
    setRanking((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function undoRank() {
    setRanking((prev) => prev.slice(0, -1));
  }

  function assignToCurrentTeam(id) {
    setTeams((prev) => {
      const next = prev.map((t) => t.slice());
      next[next.length - 1] = [...next[next.length - 1], id];
      return next;
    });
  }

  function startNextTeam() {
    setTeams((prev) => [...prev, []]);
  }

  function undoTeamAssign() {
    setTeams((prev) => {
      const next = prev.map((t) => t.slice());
      const last = next[next.length - 1];
      if (last.length > 0) {
        last.pop();
      } else if (next.length > 1) {
        next.pop();
      }
      return next;
    });
  }

  function tapTeamRank(idx) {
    setTeamRanking((prev) => (prev.includes(idx) ? prev : [...prev, idx]));
  }

  function undoTeamRank() {
    setTeamRanking((prev) => prev.slice(0, -1));
  }

  const assignedIds = teams.flat();
  const unassigned = selected.filter((id) => !assignedIds.includes(id));
  const nonEmptyTeams = teams.filter((t) => t.length > 0);
  const teamsReady = unassigned.length === 0 && nonEmptyTeams.length >= 2;

  const canSave = teamMode
    ? Boolean(
        name.trim() &&
          teamPhase === "rank" &&
          teamRanking.length === nonEmptyTeams.length &&
          nonEmptyTeams.length >= 2
      )
    : Boolean(name.trim() && selected.length >= 2 && ranking.length === selected.length);

  async function handleSave() {
    if (!canSave) return;
    const groupedRanking = teamMode
      ? teamRanking.map((idx) => nonEmptyTeams[idx])
      : ranking.map((id) => [id]);
    const ok = await onSave({ name, date, note, ranking: groupedRanking });
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
        <div className="empty">
          You need at least two players. Beating yourself isn&#39;t a competition, it&#39;s a
          cry for help.
        </div>
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
                    <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={20} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          {selected.length >= 2 && (
            <div className="field">
              <label>How was it played?</label>
              <div className="chips" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className={`chip${!teamMode ? " selected" : ""}`}
                  onClick={() => {
                    setTeamMode(false);
                    resetTeams();
                  }}
                >
                  Solo
                </button>
                <button
                  type="button"
                  className={`chip${teamMode ? " selected" : ""}`}
                  onClick={() => setTeamMode(true)}
                >
                  Teams
                </button>
              </div>

              {!teamMode ? (
                <>
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
                          <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={20} />
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
                </>
              ) : teamPhase === "assign" ? (
                <>
                  <label>Tap a player to add them to Team {teams.length}</label>
                  <div className="step-hint">{unassigned.length} left to place</div>
                  <div className="chips">
                    {selected.map((id) => {
                      const p = players.find((pl) => pl.id === id);
                      if (!p) return null;
                      const teamIdx = teams.findIndex((t) => t.includes(id));
                      const placed = teamIdx !== -1;
                      return (
                        <button
                          type="button"
                          key={id}
                          className={`chip${placed ? " ranked" : ""}`}
                          disabled={placed}
                          onClick={() => assignToCurrentTeam(id)}
                        >
                          {placed && <span className="badge-num">{teamIdx + 1}</span>}
                          <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={20} />
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    {assignedIds.length > 0 && (
                      <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={undoTeamAssign}>
                        Undo last
                      </button>
                    )}
                    {teams[teams.length - 1].length > 0 && unassigned.length > 0 && (
                      <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={startNextTeam}>
                        Start Team {teams.length + 1}
                      </button>
                    )}
                    {teamsReady && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: "6px 10px" }}
                        onClick={() => setTeamPhase("rank")}
                      >
                        Next: rank the teams
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <label>Tap teams in order of finish — winner first</label>
                  <div className="step-hint">
                    {teamRanking.length} of {nonEmptyTeams.length} placed
                  </div>
                  <div className="chips">
                    {nonEmptyTeams.map((team, idx) => {
                      const rankIdx = teamRanking.indexOf(idx);
                      const ranked = rankIdx !== -1;
                      return (
                        <button
                          type="button"
                          key={idx}
                          className={`chip team-chip${ranked ? " ranked" : ""}`}
                          disabled={ranked}
                          onClick={() => tapTeamRank(idx)}
                        >
                          {ranked && <span className="badge-num">{rankIdx + 1}</span>}
                          {team.map((id) => {
                            const p = players.find((pl) => pl.id === id);
                            return p ? (
                              <PlayerAvatar key={id} iconId={p.icon_id} emoji={p.emoji} size={20} />
                            ) : null;
                          })}
                          {teamName(team, players)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "6px 10px" }}
                      onClick={() => {
                        setTeamPhase("assign");
                        setTeamRanking([]);
                      }}
                    >
                      Back to teams
                    </button>
                    {teamRanking.length > 0 && (
                      <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={undoTeamRank}>
                        Undo last
                      </button>
                    )}
                  </div>
                </>
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
