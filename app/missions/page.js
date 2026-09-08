"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { useEventCelebration } from "../../lib/useEventCelebration";
import { supabase } from "../../lib/supabaseClient";
import BottomNav from "../../components/BottomNav";
import EventCelebration from "../../components/EventCelebration";
import PlayerAvatar from "../../components/PlayerAvatar";

// datetime-local inputs want "YYYY-MM-DDTHH:MM" in the browser's own
// timezone, which is what the scheduler's min (no scheduling into the past)
// and max (no scheduling past the event's deadline — a mission that fires
// after the final whistle is worth nothing) are built from.
function toLocalValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function nowLocalValue() {
  return toLocalValue(new Date());
}

function AdminMissionComposer({
  players,
  currentTrip,
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
  const eventRunning = !!currentTrip && currentTrip.status !== "finalized";
  // Nothing can be queued past the deadline — it would fire into an event
  // that's already been finalized and cleared out.
  const schedMax = currentTrip?.deadline ? toLocalValue(new Date(currentTrip.deadline)) : undefined;

  // send-now composer
  const [playerId, setPlayerId] = useState(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [points, setPoints] = useState(5);
  const [sending, setSending] = useState(false);
  const [sentFor, setSentFor] = useState(null);

  // task pool
  const [poolTitle, setPoolTitle] = useState("");
  const [poolText, setPoolText] = useState("");
  const [poolPoints, setPoolPoints] = useState(5);
  const [poolSaving, setPoolSaving] = useState(false);

  // scheduler
  const [schedPlayerId, setSchedPlayerId] = useState(null);
  const [schedRandom, setSchedRandom] = useState(true);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedText, setSchedText] = useState("");
  const [schedPoints, setSchedPoints] = useState(5);
  const [schedWhen, setSchedWhen] = useState("");
  const [schedSaving, setSchedSaving] = useState(false);

  async function handleSend() {
    if (!playerId || !text.trim()) return;
    setSending(true);
    const result = await onSendMission({ playerId, title: title.trim(), text: text.trim(), points });
    setSending(false);
    if (result?.ok) {
      setTitle("");
      setText("");
      setPoints(5);
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
    await onAddTemplate({ title: poolTitle.trim(), text: poolText.trim(), points: poolPoints });
    setPoolSaving(false);
    setPoolTitle("");
    setPoolText("");
    setPoolPoints(5);
  }

  // The date input's max stops the obvious mistake, but a typed-in date can
  // still slip past it on some browsers, so the deadline is checked here too.
  const withinDeadline =
    !currentTrip?.deadline || !schedWhen || new Date(schedWhen) <= new Date(currentTrip.deadline);
  const canSchedule =
    eventRunning && schedPlayerId && schedWhen && withinDeadline && (schedRandom || schedText.trim());

  async function handleSchedule() {
    if (!canSchedule) return;
    setSchedSaving(true);
    await onSchedule({
      playerId: schedPlayerId,
      title: schedRandom ? null : schedTitle.trim(),
      text: schedRandom ? null : schedText.trim(),
      random: schedRandom,
      points: schedPoints,
      scheduledFor: new Date(schedWhen).toISOString(),
    });
    setSchedSaving(false);
    setSchedTitle("");
    setSchedText("");
    setSchedPoints(5);
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
              <div className="empty">Nobody to torment yet.</div>
            ) : (
              <div className="chips">
                {eligiblePlayers.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`chip${playerId === p.id ? " selected" : ""}`}
                    onClick={() => setPlayerId(p.id)}
                  >
                    <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={20} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="mission-title">Mission title (optional)</label>
                <input
                  id="mission-title"
                  type="text"
                  placeholder="e.g. Operation Sneaky Snack"
                  maxLength={60}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div style={{ width: 76 }}>
                <label htmlFor="mission-points">Points</label>
                <input
                  id="mission-points"
                  type="number"
                  min={0}
                  max={999}
                  value={points}
                  onChange={(e) => setPoints(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
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
              Write a load of humiliating nonsense in here once. &quot;Send random&quot; and the
              scheduler pull from it without telling you which one landed, so you get to look
              innocent while someone eats a raw onion.
            </p>
            {missionTemplates.length > 0 && (
              <div className="mission-list" style={{ marginBottom: 10 }}>
                {missionTemplates.map((m) => (
                  <div className="mission-item" key={m.id}>
                    <div className="mission-text">
                      {m.title && <strong>{m.title} — </strong>}
                      {m.text}
                      <span className="muted"> ({m.points} pt{m.points === 1 ? "" : "s"})</span>
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
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="Title (optional)"
                maxLength={60}
                value={poolTitle}
                onChange={(e) => setPoolTitle(e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                type="number"
                min={0}
                max={999}
                aria-label="Points"
                value={poolPoints}
                onChange={(e) => setPoolPoints(Math.max(0, Number(e.target.value) || 0))}
                style={{ width: 76 }}
              />
            </div>
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
              Set one going off later. Once it&#39;s queued the time is hidden from you as
              well, so your shock will be almost convincing.
              {currentTrip?.deadline && " Can't be set past the event's deadline."}
            </p>
            {!eventRunning && (
              <div className="empty" style={{ marginBottom: 8 }}>
                No event running — missions belong to an event, so there&#39;s nothing to
                queue one against.
              </div>
            )}
            <div className="chips" style={{ marginBottom: 8 }}>
              {eligiblePlayers.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`chip${schedPlayerId === p.id ? " selected" : ""}`}
                  onClick={() => setSchedPlayerId(p.id)}
                >
                  <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={20} />
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
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Title (optional)"
                    maxLength={60}
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={999}
                    aria-label="Points"
                    value={schedPoints}
                    onChange={(e) => setSchedPoints(Math.max(0, Number(e.target.value) || 0))}
                    style={{ width: 76 }}
                  />
                </div>
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
              max={schedMax}
              disabled={!eventRunning}
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
                        {!s.random && (
                          <span className="muted">
                            {" "}
                            ({s.points} pt{s.points === 1 ? "" : "s"})
                          </span>
                        )}
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
    declineMission,
    uploadMissionProof,
    addMissionTemplate,
    deleteMissionTemplate,
    scheduleMission,
    cancelScheduledMission,
  } = useBoardData();

  const [missions, setMissions] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const [errorFor, setErrorFor] = useState({}); // mission id -> error message
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  async function handleProveIt(missionId, file) {
    if (!file) return;
    setErrorFor((prev) => ({ ...prev, [missionId]: null }));
    setUploadingId(missionId);
    const result = await uploadMissionProof({ missionId, file });
    setUploadingId(null);
    if (!result?.ok) {
      setErrorFor((prev) => ({ ...prev, [missionId]: result?.error || "Couldn't upload that." }));
    }
  }

  async function handleDecline(missionId) {
    setErrorFor((prev) => ({ ...prev, [missionId]: null }));
    setDecliningId(missionId);
    const result = await declineMission(missionId);
    setDecliningId(null);
    if (!result?.ok) {
      setErrorFor((prev) => ({ ...prev, [missionId]: result?.error || "Couldn't decline that." }));
    }
  }

  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players, me);

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  // This player's secret missions FOR THE CURRENT EVENT ONLY, newest first,
  // live-updated so a mission sent while this page is open shows up without
  // a reload. Missions belong to whichever trip was current when they were
  // sent (see send-mission/process-due routes) — scoping by trip_id here is
  // what makes the list actually reset once one event ends and the next
  // starts, instead of showing every mission ever sent.
  useEffect(() => {
    if (!supabase || !me || !currentTrip) {
      setMissions([]);
      return;
    }
    let cancelled = false;

    function load() {
      supabase
        .from("missions")
        .select("id, title, text, status, photo_url, points, created_at")
        .eq("player_id", me.id)
        .eq("trip_id", currentTrip.id)
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
  }, [me, currentTrip]);

  // Clears the pink dot BottomNav shows for a new mission — landing on this
  // tab at all counts as "seen", same as opening the notification bell does.
  useEffect(() => {
    if (!supabase || !me) return;
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("player_id", me.id)
      .eq("kind", "mission")
      .is("read_at", null)
      .then(() => {});
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
            You exist, technically, but not on the board. Go and ask whoever runs this to
            add you from the Players panel, and try to sound like you deserve it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      {celebrating && (
        <EventCelebration
          trophy={celebrating.trophy}
          winner={celebrating.winner}
          onDismiss={dismiss}
        />
      )}
      <div className="card header-card">
        <div className="header-card-title-row">
          <span className="card-help-btn-spacer" aria-hidden="true" />
          <h2>Secret missions</h2>
          <button
            type="button"
            className="card-help-btn"
            onClick={() => setHelpOpen(true)}
            aria-label="What is this?"
          >
            ?
          </button>
        </div>
      </div>

      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>What is this?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Stupid little jobs, sent to you at random, that nobody else can see. Do the
              thing, photograph yourself doing the thing, get the points. Or press Decline,
              which is the button for people who talk a big game in the group chat and then
              do absolutely nothing.
            </p>
            <h3 style={{ marginTop: 18 }}>The catch</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Every photo you upload gets kept. When the event ends, the whole lot goes up
              on one page and we all sit and go through them together, worst player first.
              No, you can&#39;t delete it. That&#39;s rather the point.
            </p>
            <div className="btn-row modal-close" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => setHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {missions.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty">Nothing yet. Enjoy the quiet, it won&#39;t last.</div>
        </div>
      ) : (
        missions.map((m, i) => {
          const pending = m.status === "pending";
          const uploading = uploadingId === m.id;
          const declining = decliningId === m.id;
          return (
            <div className="card mission-proof-card" key={m.id}>
              <div className="mission-proof-row">
                <div className="mission-proof-body">
                  {m.title && <div className="mission-proof-title">{m.title}</div>}
                  <div className="mission-proof-date">
                    {new Date(m.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                  <div className="mission-proof-text">{m.text}</div>
                  <div className="mission-proof-points">
                    Worth {m.points} pt{m.points === 1 ? "" : "s"}
                  </div>

                  {pending && (
                    <div className="btn-row" style={{ marginTop: 12 }}>
                      <label className="btn btn-primary" style={{ margin: 0 }}>
                        {uploading ? "Uploading…" : "Prove it 📸"}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: "none" }}
                          disabled={uploading || declining}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            handleProveIt(m.id, file);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={uploading || declining}
                        onClick={() => handleDecline(m.id)}
                      >
                        {declining ? "Declining…" : "Decline"}
                      </button>
                    </div>
                  )}
                  {m.status === "declined" && (
                    <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                      Declined. Everyone will hear about it.
                    </p>
                  )}
                  {m.status === "completed" && (
                    <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                      Done. {m.points} pt{m.points === 1 ? "" : "s"}, and a photo that will
                      follow you around forever ✅
                    </p>
                  )}
                  {errorFor[m.id] && (
                    <div className="banner-note error" style={{ marginTop: 10 }}>
                      {errorFor[m.id]}
                    </div>
                  )}
                </div>

                {m.photo_url && (
                  <button
                    type="button"
                    className={`mission-polaroid${i % 2 === 1 ? " mission-polaroid-alt" : ""}`}
                    onClick={() => setLightboxUrl(m.photo_url)}
                    aria-label="View proof photo full size"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.photo_url} alt="" />
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      {lightboxUrl && (
        <div className="modal-backdrop" onClick={() => setLightboxUrl(null)}>
          <button
            type="button"
            className="mission-lightbox-close"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close photo"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mission-lightbox-img" src={lightboxUrl} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {isAdmin && (
        <AdminMissionComposer
          players={players}
          currentTrip={currentTrip}
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
