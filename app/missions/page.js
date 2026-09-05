"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { useEventCelebration } from "../../lib/useEventCelebration";
import { supabase } from "../../lib/supabaseClient";
import BottomNav from "../../components/BottomNav";
import NotificationBell from "../../components/NotificationBell";
import EventCelebration from "../../components/EventCelebration";
import PlayerAvatar from "../../components/PlayerAvatar";

// Local "now, in the browser's timezone" value for the scheduler's
// datetime-local input's min attribute — can't schedule into the past.
function nowLocalValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function AdminMissionComposer({
  players,
  missionTemplates,
  scheduledMissions,
  onSendMission,
  onSendRandomMission,
  onAddTemplate,
  onDeleteTemplate,
  onSchedule,
  onCancelScheduled,
}) {
  const [open, setOpen] = useState(false);
  const eligiblePlayers = players.filter((p) => p.user_id);

  // send-now composer
  const [playerId, setPlayerId] = useState(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sentFor, setSentFor] = useState(null);

  // task pool
  const [poolTitle, setPoolTitle] = useState("");
  const [poolText, setPoolText] = useState("");
  const [poolSaving, setPoolSaving] = useState(false);

  // scheduler
  const [schedPlayerId, setSchedPlayerId] = useState(null);
  const [schedRandom, setSchedRandom] = useState(true);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedText, setSchedText] = useState("");
  const [schedWhen, setSchedWhen] = useState("");
  const [schedSaving, setSchedSaving] = useState(false);

  async function handleSend() {
    if (!playerId || !text.trim()) return;
    setSending(true);
    const result = await onSendMission({ playerId, title: title.trim(), text: text.trim() });
    setSending(false);
    if (result?.ok) {
      setTitle("");
      setText("");
      setSentFor(playerId);
      setTimeout(() => setSentFor((id) => (id === playerId ? null : id)), 4000);
    }
  }

  async function handleSendRandom() {
    if (!playerId) return;
    setSending(true);
    const result = await onSendRandomMission({ playerId });
    setSending(false);
    if (result?.ok) {
      setSentFor(playerId);
      setTimeout(() => setSentFor((id) => (id === playerId ? null : id)), 4000);
    }
  }

  async function handleAddTemplate() {
    if (!poolText.trim()) return;
    setPoolSaving(true);
    await onAddTemplate({ title: poolTitle.trim(), text: poolText.trim() });
    setPoolSaving(false);
    setPoolTitle("");
    setPoolText("");
  }

  const canSchedule = schedPlayerId && schedWhen && (schedRandom || schedText.trim());

  async function handleSchedule() {
    if (!canSchedule) return;
    setSchedSaving(true);
    await onSchedule({
      playerId: schedPlayerId,
      title: schedRandom ? null : schedTitle.trim(),
      text: schedRandom ? null : schedText.trim(),
      random: schedRandom,
      scheduledFor: new Date(schedWhen).toISOString(),
    });
    setSchedSaving(false);
    setSchedTitle("");
    setSchedText("");
    setSchedWhen("");
    setSchedPlayerId(null);
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <button className="btn toggle-panel-btn" onClick={() => setOpen((o) => !o)}>
        <h2>Send a secret mission</h2>
        <span className={`chevron${open ? " open" : ""}`}>▾</span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div className="field">
            <label>Who&#39;s it for?</label>
            {eligiblePlayers.length === 0 ? (
              <div className="empty">No player accounts to send to yet.</div>
            ) : (
              <div className="chips">
                {eligiblePlayers.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`chip${playerId === p.id ? " selected" : ""}`}
                    onClick={() => setPlayerId(p.id)}
                  >
                    <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={16} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="mission-title">Mission title (optional)</label>
            <input
              id="mission-title"
              type="text"
              placeholder="e.g. Operation Sneaky Snack"
              maxLength={60}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <textarea
              placeholder="What do they have to do?"
              maxLength={280}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!playerId || !text.trim() || sending}
              onClick={handleSend}
            >
              {sending ? "Sending…" : sentFor === playerId ? "Sent! 🎯" : "Send this one"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!playerId || sending || missionTemplates.length === 0}
              onClick={handleSendRandom}
              title={missionTemplates.length === 0 ? "Add some tasks to the pool first" : ""}
            >
              🎲 Send random from pool
            </button>
          </div>

          <div className="field" style={{ marginTop: 22 }}>
            <label>Task pool ({missionTemplates.length})</label>
            <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
              Add a bunch of tasks here once — &quot;send random&quot; and the scheduler below pick
              from these without telling you which one.
            </p>
            {missionTemplates.length > 0 && (
              <div className="mission-list" style={{ marginBottom: 10 }}>
                {missionTemplates.map((m) => (
                  <div className="mission-item" key={m.id}>
                    <div className="mission-text">
                      {m.title && <strong>{m.title} — </strong>}
                      {m.text}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ marginTop: 4 }}
                      onClick={() => onDeleteTemplate(m.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              type="text"
              placeholder="Title (optional)"
              maxLength={60}
              value={poolTitle}
              onChange={(e) => setPoolTitle(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <textarea
              placeholder="Add a task to the pool…"
              maxLength={280}
              rows={2}
              value={poolText}
              onChange={(e) => setPoolText(e.target.value)}
            />
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={!poolText.trim() || poolSaving}
                onClick={handleAddTemplate}
              >
                {poolSaving ? "Adding…" : "Add to pool"}
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: 22 }}>
            <label>Scheduler</label>
            <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
              Queue one for later — once it&#39;s queued, the time isn&#39;t shown back to you
              either.
            </p>
            <div className="chips" style={{ marginBottom: 8 }}>
              {eligiblePlayers.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`chip${schedPlayerId === p.id ? " selected" : ""}`}
                  onClick={() => setSchedPlayerId(p.id)}
                >
                  <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={16} />
                  {p.name}
                </button>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={schedRandom}
                onChange={(e) => setSchedRandom(e.target.checked)}
                style={{ width: "auto" }}
              />
              Pick randomly from the pool when it fires
            </label>
            {!schedRandom && (
              <>
                <input
                  type="text"
                  placeholder="Title (optional)"
                  maxLength={60}
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <textarea
                  placeholder="What do they have to do?"
                  maxLength={280}
                  rows={2}
                  value={schedText}
                  onChange={(e) => setSchedText(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
              </>
            )}
            <input
              type="datetime-local"
              min={nowLocalValue()}
              value={schedWhen}
              onChange={(e) => setSchedWhen(e.target.value)}
            />
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canSchedule || schedSaving}
                onClick={handleSchedule}
              >
                {schedSaving ? "Queuing…" : "Queue it"}
              </button>
            </div>

            {scheduledMissions.length > 0 && (
              <div className="mission-list" style={{ marginTop: 12 }}>
                {scheduledMissions.map((s) => {
                  const p = players.find((pl) => pl.id === s.player_id);
                  return (
                    <div className="mission-item" key={s.id}>
                      <div className="mission-text">
                        Queued for <strong>{p?.name || "someone"}</strong> —{" "}
                        {s.random ? "random from pool" : s.title || "custom task"}
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ marginTop: 4 }}
                        onClick={() => onCancelScheduled(s.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MissionsPage() {
  const router = useRouter();
  const {
    configured,
    loading,
    session,
    me,
    players,
    currentTrip,
    trophies,
    isAdmin,
    missionTemplates,
    scheduledMissions,
    sendMission,
    sendRandomMission,
    addMissionTemplate,
    deleteMissionTemplate,
    scheduleMission,
    cancelScheduledMission,
  } = useBoardData();

  const [missions, setMissions] = useState([]);
  const [revealed, setRevealed] = useState(false);

  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players);

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  // This player's secret missions, newest first, live-updated so a mission
  // sent while this page is open shows up without a reload.
  useEffect(() => {
    if (!supabase || !me) return;
    let cancelled = false;

    function load() {
      supabase
        .from("missions")
        .select("id, title, text, created_at")
        .eq("player_id", me.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (!cancelled && data) setMissions(data);
        });
    }
    load();

    const channel = supabase
      .channel(`missions-${me.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "missions", filter: `player_id=eq.${me.id}` },
        load
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [me]);

  if (!configured || loading || !session) {
    return (
      <div className="wrap">
        <div className="card header-card">
          <div className="subtitle">Loading&hellip;</div>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="wrap">
        <div className="card">
          <h2>No profile yet</h2>
          <p className="muted">
            Your account isn&#39;t linked to a player on the board yet — ask whoever runs it to
            add you from the Players panel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <NotificationBell me={me} />
      {celebrating && (
        <EventCelebration
          trophy={celebrating.trophy}
          winner={celebrating.winner}
          onDismiss={dismiss}
        />
      )}
      <div className="card header-card">
        <h2>Secret missions</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Just for you — nobody else can see these.
        </p>
      </div>

      <div className="mission-flip-wrap">
        <div className={`mission-flip-card${revealed ? " flipped" : ""}`}>
          <div className="mission-flip-front" onClick={() => setRevealed(true)}>
            <div className="flip-hint">👁 My Eyes Only</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              {missions.length === 0
                ? "Tap to check for secret missions."
                : `Tap to reveal ${missions.length} mission${missions.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <div className="mission-flip-back" onClick={() => setRevealed(false)}>
            {missions.length === 0 ? (
              <div className="empty">No missions yet — check back later.</div>
            ) : (
              <div className="mission-list">
                {missions.map((m) => (
                  <div className="mission-item" key={m.id}>
                    {m.title && <div className="mission-title">{m.title}</div>}
                    <div className="mission-date">
                      {new Date(m.created_at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                    <div className="mission-text">{m.text}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Tap to flip back
            </p>
          </div>
        </div>
      </div>

      {isAdmin && (
        <AdminMissionComposer
          players={players}
          missionTemplates={missionTemplates}
          scheduledMissions={scheduledMissions}
          onSendMission={sendMission}
          onSendRandomMission={sendRandomMission}
          onAddTemplate={addMissionTemplate}
          onDeleteTemplate={deleteMissionTemplate}
          onSchedule={scheduleMission}
          onCancelScheduled={cancelScheduledMission}
        />
      )}

      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
