"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBoardData } from "../../lib/useBoardData";
import { useEventCelebration } from "../../lib/useEventCelebration";
import { useLeroyAlert } from "../../lib/useLeroyAlert";
import { supabase } from "../../lib/supabaseClient";
import BottomNav from "../../components/BottomNav";
import EventCelebration from "../../components/EventCelebration";
import LeroyAlert from "../../components/LeroyAlert";
import TradeAlert from "../../components/TradeAlert";
import PlayerAvatar from "../../components/PlayerAvatar";
import { rewardLabel } from "../../lib/missionReward";

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

function RewardKindPicker({ value, onChange }) {
  return (
    <div className="chips" style={{ marginBottom: 8 }}>
      {[
        { id: "points", label: "Points" },
        { id: "leroy", label: "Leroy" },
        { id: "jackpot", label: "Jackpot" },
      ].map((opt) => (
        <button
          type="button"
          key={opt.id}
          className={`chip${value === opt.id ? " selected" : ""}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
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
  onClearTemplates,
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
  const [rewardKind, setRewardKind] = useState("points");
  const [sending, setSending] = useState(false);
  const [sentFor, setSentFor] = useState(null);
  const [sentPushInfo, setSentPushInfo] = useState("");
  const [sendError, setSendError] = useState("");

  // task pool
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolTitle, setPoolTitle] = useState("");
  const [poolText, setPoolText] = useState("");
  const [poolPoints, setPoolPoints] = useState(5);
  const [poolRewardKind, setPoolRewardKind] = useState("points");
  const [poolSaving, setPoolSaving] = useState(false);
  const [confirmClearPool, setConfirmClearPool] = useState(false);
  const [clearingPool, setClearingPool] = useState(false);

  // scheduler
  const [schedPlayerId, setSchedPlayerId] = useState(null);
  const [schedRandom, setSchedRandom] = useState(true);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedText, setSchedText] = useState("");
  const [schedPoints, setSchedPoints] = useState(5);
  const [schedRewardKind, setSchedRewardKind] = useState("points");
  const [schedWhen, setSchedWhen] = useState("");
  const [schedSaving, setSchedSaving] = useState(false);

  // The route already knows exactly how many devices got pushed — worth
  // showing, since "Sent!" on its own looks identical whether the mission
  // actually buzzed someone's phone or quietly went nowhere.
  function describePush(data) {
    if (!data?.pushConfigured) return "";
    if (data.pushed > 0) return ` (pinged ${data.pushed} device${data.pushed === 1 ? "" : "s"})`;
    return " (no push — they haven't turned on mission alerts, or it's gone stale)";
  }

  async function handleSend() {
    if (!playerId || !text.trim()) return;
    setSendError("");
    setSending(true);
    const result = await onSendMission({ playerId, title: title.trim(), text: text.trim(), points, rewardKind });
    setSending(false);
    if (result?.ok) {
      setTitle("");
      setText("");
      setPoints(5);
      setRewardKind("points");
      setSentFor(playerId);
      setSentPushInfo(describePush(result.data));
      setTimeout(() => setSentFor((id) => (id === playerId ? null : id)), 4000);
    } else {
      setSendError(result?.error || "Couldn't send that — try again.");
    }
  }

  async function handleSendRandom() {
    if (!playerId) return;
    setSendError("");
    setSending(true);
    const result = await onSendRandomMission({ playerId });
    setSending(false);
    if (result?.ok) {
      setSentFor(playerId);
      setSentPushInfo(describePush(result.data));
      setTimeout(() => setSentFor((id) => (id === playerId ? null : id)), 4000);
    } else {
      setSendError(result?.error || "Couldn't send that — try again.");
    }
  }

  async function handleAddTemplate() {
    if (!poolText.trim()) return;
    setPoolSaving(true);
    await onAddTemplate({
      title: poolTitle.trim(),
      text: poolText.trim(),
      points: poolPoints,
      rewardKind: poolRewardKind,
    });
    setPoolSaving(false);
    setPoolTitle("");
    setPoolText("");
    setPoolPoints(5);
    setPoolRewardKind("points");
  }

  async function handleClearPool() {
    setClearingPool(true);
    await onClearTemplates();
    setClearingPool(false);
    setConfirmClearPool(false);
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
      rewardKind: schedRewardKind,
      scheduledFor: new Date(schedWhen).toISOString(),
    });
    setSchedSaving(false);
    setSchedTitle("");
    setSchedText("");
    setSchedPoints(5);
    setSchedRewardKind("points");
    setSchedWhen("");
    setSchedPlayerId(null);
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <button className="btn toggle-panel-btn" onClick={() => setOpen((o) => !o)}>
        <h2>Send a mission</h2>
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
            <label>Reward</label>
            <RewardKindPicker value={rewardKind} onChange={setRewardKind} />
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
              {rewardKind === "points" && (
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
              )}
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
          {sentFor === playerId && sentPushInfo && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {sentPushInfo}
            </p>
          )}
          {sendError && <div className="banner-note error">{sendError}</div>}

          <div className="field" style={{ marginTop: 22 }}>
            <button type="button" className="btn toggle-panel-btn" onClick={() => setPoolOpen((o) => !o)}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--ink-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Task pool ({missionTemplates.length})
              </span>
              <span className={`chevron${poolOpen ? " open" : ""}`}>▾</span>
            </button>

            {poolOpen && (
              <div style={{ marginTop: 10 }}>
                <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  Write a load of humiliating nonsense in here once. &quot;Send random&quot; and
                  the scheduler pull from it without telling you which one landed, so you get to
                  look innocent while someone eats a raw onion. Nobody gets the same one twice in
                  one event.
                </p>
                {missionTemplates.length > 0 && (
                  <div className="mission-list" style={{ marginBottom: 10 }}>
                    {missionTemplates.map((m) => (
                      <div className="mission-item" key={m.id}>
                        <div className="mission-text">
                          {m.title && <strong>{m.title} — </strong>}
                          {m.text}
                          <span className="muted"> ({rewardLabel(m.reward_kind, m.points)})</span>
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
                <RewardKindPicker value={poolRewardKind} onChange={setPoolRewardKind} />
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Title (optional)"
                    maxLength={60}
                    value={poolTitle}
                    onChange={(e) => setPoolTitle(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {poolRewardKind === "points" && (
                    <input
                      type="number"
                      min={0}
                      max={999}
                      aria-label="Points"
                      value={poolPoints}
                      onChange={(e) => setPoolPoints(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 76 }}
                    />
                  )}
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

                <div className="btn-row" style={{ marginTop: 16 }}>
                  {!confirmClearPool ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={missionTemplates.length === 0}
                      onClick={() => setConfirmClearPool(true)}
                    >
                      Remove all
                    </button>
                  ) : (
                    <>
                      <span className="muted" style={{ fontSize: 13 }}>
                        Wipe every task in the pool?
                      </span>
                      <button className="btn btn-danger" disabled={clearingPool} onClick={handleClearPool}>
                        {clearingPool ? "Clearing…" : "Yes, clear them"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setConfirmClearPool(false)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
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
                <RewardKindPicker value={schedRewardKind} onChange={setSchedRewardKind} />
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Title (optional)"
                    maxLength={60}
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {schedRewardKind === "points" && (
                    <input
                      type="number"
                      min={0}
                      max={999}
                      aria-label="Points"
                      value={schedPoints}
                      onChange={(e) => setSchedPoints(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 76 }}
                    />
                  )}
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
                          <span className="muted"> ({rewardLabel(s.reward_kind, s.points)})</span>
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
    tripPlayers,
    currentTrip,
    trophies,
    eventTrophies,
    leroySends,
    guessLeroy,
    startLeroyGuessWindow,
    isAdmin,
    missionTemplates,
    scheduledMissions,
    sendMission,
    sendRandomMission,
    declineMission,
    uploadMissionProof,
    addMissionTemplate,
    deleteMissionTemplate,
    clearMissionTemplates,
    scheduleMission,
    cancelScheduledMission,
    missionTrades,
    fetchTradablePlayers,
    proposeTrade,
    respondTrade,
    cancelTrade,
  } = useBoardData();

  const [missions, setMissions] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const [errorFor, setErrorFor] = useState({}); // mission id -> error message
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [tradeModalFor, setTradeModalFor] = useState(null); // my mission id currently being offered
  const [tradablePlayers, setTradablePlayers] = useState([]);
  const [tradableLoading, setTradableLoading] = useState(false);
  const [tradeError, setTradeError] = useState("");
  const [proposingId, setProposingId] = useState(null); // recipient mission id being offered against right now
  const [cancellingTradeId, setCancellingTradeId] = useState(null);
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

  async function openTradeModal(missionId) {
    setTradeModalFor(missionId);
    setTradeError("");
    setTradablePlayers([]);
    setTradableLoading(true);
    const result = await fetchTradablePlayers();
    setTradableLoading(false);
    if (result?.ok) {
      setTradablePlayers(result.data.players || []);
    } else {
      setTradeError(result?.error || "Couldn't load anyone to trade with.");
    }
  }

  function closeTradeModal() {
    setTradeModalFor(null);
    setTradablePlayers([]);
    setTradeError("");
    setProposingId(null);
  }

  async function handleProposeTrade(recipientMissionId) {
    setTradeError("");
    setProposingId(recipientMissionId);
    const result = await proposeTrade({ proposerMissionId: tradeModalFor, recipientMissionId });
    setProposingId(null);
    if (result?.ok) {
      closeTradeModal();
    } else {
      setTradeError(result?.error || "Couldn't send that trade.");
    }
  }

  async function handleCancelTrade(tradeId) {
    setCancellingTradeId(tradeId);
    await cancelTrade(tradeId);
    setCancellingTradeId(null);
  }

  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players, me);
  const { alerting: leroyAlert, dismiss: dismissLeroyAlert } = useLeroyAlert(
    leroySends,
    players,
    me,
    startLeroyGuessWindow
  );
  const incomingTrade =
    me && currentTrip && currentTrip.status !== "finalized"
      ? missionTrades.find(
          (t) => t.recipient_player_id === me.id && t.status === "pending" && t.trip_id === currentTrip.id
        )
      : null;
  const incomingTradeProposer = incomingTrade
    ? players.find((p) => p.id === incomingTrade.proposer_player_id)
    : null;
  // My own missions currently offered into a pending trade — locked out of
  // Prove it/Decline/Trade (see lib/missionTrades.js's server-side twin of
  // this same rule) and shown "waiting on them" instead, with a way to back
  // out via cancelTrade.
  const outgoingTradeByMissionId = new Map(
    missionTrades
      .filter((t) => t.proposer_player_id === me?.id && t.status === "pending")
      .map((t) => [t.proposer_mission_id, t])
  );

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
    // Once the event's finalized, this tab is no longer where its missions
    // live — Secret Missions Review is (see app/missions-review), and
    // scores are frozen from here bar the admin correcting them. Clearing
    // rather than just hiding the Prove it/Decline buttons means a mission
    // sent right at the wire can't be actioned from a page that was already
    // open when the deadline hit.
    if (!supabase || !me || !currentTrip || currentTrip.status === "finalized") {
      setMissions([]);
      return;
    }
    let cancelled = false;

    function load() {
      supabase
        .from("missions")
        .select("id, title, text, status, photo_url, points, reward_kind, created_at")
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
          variant={celebrating.variant}
          eventTrophies={eventTrophies}
          onDismiss={dismiss}
        />
      )}
      {leroyAlert && (
        <LeroyAlert
          leroy={leroyAlert.leroy}
          tripPlayers={tripPlayers}
          me={me}
          onGuess={guessLeroy}
          onDismiss={dismissLeroyAlert}
        />
      )}
      <TradeAlert trade={incomingTrade} proposerName={incomingTradeProposer?.name} onRespond={respondTrade} />
      <div className="card header-card">
        <div className="header-card-title-row">
          <span className="card-help-btn-spacer" aria-hidden="true" />
          <h2>Missions</h2>
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

      {currentTrip?.status === "finalized" ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty">
            That event&#39;s over — whatever you were sent lives on Missions Review now.
          </div>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 12 }}>
            <Link href="/missions-review" className="btn btn-signout" style={{ textTransform: "uppercase" }}>
              See all missions
            </Link>
          </div>
        </div>
      ) : missions.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty" style={{ textAlign: "center" }}>
            Nothing yet. Enjoy the quiet, it won&#39;t last.
          </div>
        </div>
      ) : (
        missions.map((m, i) => {
          const pending = m.status === "pending";
          const uploading = uploadingId === m.id;
          const declining = decliningId === m.id;
          const outgoingTrade = outgoingTradeByMissionId.get(m.id);
          const cancelling = cancellingTradeId === outgoingTrade?.id;
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
                  <div className="mission-proof-points">Worth {rewardLabel(m.reward_kind, m.points)}</div>

                  {pending && outgoingTrade && (
                    <div style={{ marginTop: 12 }}>
                      <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                        Trade offered — waiting on{" "}
                        {players.find((p) => p.id === outgoingTrade.recipient_player_id)?.name || "them"} to
                        answer.
                      </p>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={cancelling}
                          onClick={() => handleCancelTrade(outgoingTrade.id)}
                        >
                          {cancelling ? "Cancelling…" : "Cancel trade"}
                        </button>
                      </div>
                    </div>
                  )}
                  {pending && !outgoingTrade && (
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
                        className="btn btn-ghost btn-outline-pink"
                        disabled={uploading || declining}
                        onClick={() => handleDecline(m.id)}
                      >
                        {declining ? "Declining…" : "Decline"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-outline-acid"
                        disabled={uploading || declining}
                        onClick={() => openTradeModal(m.id)}
                      >
                        Trade
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
                      Done. Bagged {rewardLabel(m.reward_kind, m.points)}, and a photo that will
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

      {tradeModalFor && (
        <div className="modal-backdrop" onClick={closeTradeModal}>
          <button
            type="button"
            className="modal-close-btn"
            onClick={closeTradeModal}
            aria-label="Close"
          >
            ✕
          </button>
          <div
            className="card modal-card"
            style={{ maxWidth: 420, maxHeight: "80vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ textAlign: "center" }}>Trade for what?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8, textAlign: "center" }}>
              Pick a player, then which of their pending missions you want instead of yours.
              They&#39;ll have to accept before anything actually swaps.
            </p>
            {tradeError && (
              <div className="banner-note error" style={{ marginTop: 10 }}>
                {tradeError}
              </div>
            )}
            {tradableLoading ? (
              <p className="muted" style={{ fontSize: 13, marginTop: 16, textAlign: "center" }}>
                Loading&hellip;
              </p>
            ) : tradablePlayers.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, marginTop: 16, textAlign: "center" }}>
                Nobody else has anything pending to trade right now.
              </p>
            ) : (
              tradablePlayers.map((p, playerIndex) => (
                <div
                  key={p.playerId}
                  className={playerIndex > 0 ? "trade-pick-player" : undefined}
                  style={{ marginTop: playerIndex > 0 ? 20 : 18 }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 16,
                    }}
                  >
                    <PlayerAvatar iconId={p.iconId} emoji={p.emoji} size={32} />
                    <div className="trade-pick-name">{p.name}</div>
                  </div>
                  <div className="mission-list">
                    {p.missions.map((m) => (
                      <div className="mission-item" key={m.id}>
                        {m.title && <div className="mission-title">{m.title}</div>}
                        <div className="mission-text">{m.text}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          Worth {rewardLabel(m.rewardKind, m.points)}
                        </div>
                        <div className="btn-row" style={{ justifyContent: "center", marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-outline-acid"
                            disabled={!!proposingId}
                            onClick={() => handleProposeTrade(m.id)}
                          >
                            {proposingId === m.id ? "Sending…" : "Trade for this"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            <div className="btn-row" style={{ justifyContent: "center", marginTop: 18 }}>
              <button type="button" className="btn btn-signout" onClick={closeTradeModal}>
                Close
              </button>
            </div>
          </div>
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
          onClearTemplates={clearMissionTemplates}
          onSchedule={scheduleMission}
          onCancelScheduled={cancelScheduledMission}
        />
      )}

      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
