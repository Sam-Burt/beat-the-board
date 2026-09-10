"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { useEventCelebration } from "../../lib/useEventCelebration";
import { useLeroyAlert } from "../../lib/useLeroyAlert";
import { supabase } from "../../lib/supabaseClient";
import BottomNav from "../../components/BottomNav";
import EventCelebration from "../../components/EventCelebration";
import LeroyAlert from "../../components/LeroyAlert";
import PlayerAvatar from "../../components/PlayerAvatar";

function hoursLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (60 * 60 * 1000)));
}

export default function TricksPage() {
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
    leroySends,
    sendLeroy,
    pointBoosts,
    activateBoost,
  } = useBoardData();

  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players, me);
  const { alerting: leroyAlert, dismiss: dismissLeroyAlert } = useLeroyAlert(leroySends, players, me);

  const [helpOpen, setHelpOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [pushInfo, setPushInfo] = useState("");
  const [boosting, setBoosting] = useState(false);
  const [boostError, setBoostError] = useState("");

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  // Clears the pink dot BottomNav shows for a send landing on you —
  // landing on this tab at all counts as "seen", same as Missions/Gay
  // Card do.
  useEffect(() => {
    if (!supabase || !me) return;
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("player_id", me.id)
      .eq("kind", "leroy")
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

  const eventLive = !!currentTrip && (currentTrip.status === "active" || currentTrip.status === "tied");
  const mySend = leroySends.find((l) => l.sender_id === me.id);
  const now = new Date();
  const incoming = leroySends.find(
    (l) => l.target_id === me.id && !l.resolved_at && new Date(l.expires_at) > now
  );
  const myBoost = pointBoosts.find((b) => b.player_id === me.id);

  function describePush(data) {
    if (!data?.pushConfigured) return "";
    if (data.pushed > 0) return `Pinged ${data.pushed} device${data.pushed === 1 ? "" : "s"}.`;
    return "No push went out — they haven't turned on alerts, or it's gone stale.";
  }

  async function handleSend() {
    if (!target) return;
    setSendError("");
    setPushInfo("");
    setSending(true);
    const result = await sendLeroy({ targetId: target });
    setSending(false);
    if (result?.ok) {
      setTarget(null);
      setPushInfo(describePush(result.data));
    } else {
      setSendError(result?.error || "Couldn't send him — try again.");
    }
  }

  async function handleBoost() {
    setBoostError("");
    setBoosting(true);
    const result = await activateBoost();
    setBoosting(false);
    if (!result?.ok) {
      setBoostError(result?.error || "Couldn't activate it — try again.");
    }
  }

  return (
    <div className="wrap">
      {celebrating && (
        <EventCelebration
          trophy={celebrating.trophy}
          winner={celebrating.winner}
          variant={celebrating.variant}
          onDismiss={dismiss}
        />
      )}
      {leroyAlert && (
        <LeroyAlert leroy={leroyAlert.leroy} sender={leroyAlert.sender} onDismiss={dismissLeroyAlert} />
      )}

      <div className="card header-card">
        <div className="header-card-title-row">
          <span className="card-help-btn-spacer" aria-hidden="true" />
          <h1 style={{ fontSize: 26 }}>Tricks</h1>
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
            <h3>Leroy</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              You get one shot per event. Pick anyone else on the board and send Leroy after
              them — next time they play anything, he takes 5 points off them and hands them
              straight to you. They&#39;ll get told the second you send him, so this isn&#39;t
              exactly subtle. It just isn&#39;t stoppable either.
            </p>
            <h3 style={{ marginTop: 18 }}>Fine print</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              He&#39;s only got 18 hours in him. If they don&#39;t play anything before then,
              he gives up and goes home empty-handed — nobody gets anything.
            </p>
            <h3 style={{ marginTop: 18 }}>Jackpot</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              One shot per event, same as Leroy — but on yourself. Activate it and whatever
              you score in your next game gets doubled. It has nothing to do with Leroy
              either way: he always takes exactly 5, boosted or not, and doubling never
              makes him take more. Also 18 hours — use it or lose it.
            </p>
            <div className="btn-row modal-close" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => setHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="subtitle" style={{ textAlign: "center", marginTop: 20 }}>
        Leroy
      </div>
      <div className="card hot-potato-card-face" style={{ marginTop: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/cheater-icon.png" alt="" style={{ width: 72, height: 72, objectFit: "contain" }} />
        <div className="hot-potato-card-label">He&#39;s Available</div>
      </div>

      {!eventLive && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ textAlign: "center" }}>
            Nothing to send him after. Wait for an event to start.
          </p>
        </div>
      )}

      {eventLive && incoming && (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <p className="gay-card-title">Leroy&#39;s coming for you</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Next time you play anything, he takes {incoming.amount} points off you. About{" "}
            {hoursLeft(incoming.expires_at)} hour{hoursLeft(incoming.expires_at) === 1 ? "" : "s"} left
            on the clock.
          </p>
        </div>
      )}

      {eventLive && !mySend && (
        <div className="card" style={{ marginTop: 16 }}>
          <label>Who&#39;s getting Leroy?</label>
          <div className="chips" style={{ marginTop: 6 }}>
            {tripPlayers
              .filter((p) => p.id !== me.id)
              .map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`chip${target === p.id ? " selected" : ""}`}
                  onClick={() => setTarget(p.id)}
                >
                  <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={20} />
                  {p.name}
                </button>
              ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            One send, once, for the whole event — choose wisely.
          </p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" disabled={!target || sending} onClick={handleSend}>
              {sending ? "Sending…" : "Send Leroy"}
            </button>
          </div>
          {sendError && <div className="banner-note error">{sendError}</div>}
          {pushInfo && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {pushInfo}
            </p>
          )}
        </div>
      )}

      {eventLive && mySend && (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <p className="muted">
            You sent Leroy after{" "}
            <strong>{players.find((p) => p.id === mySend.target_id)?.name || "someone"}</strong> this
            event.{" "}
            {mySend.resolved_at
              ? "He's been and gone."
              : new Date(mySend.expires_at) > now
              ? "Still waiting on him."
              : "He never caught them in time."}
          </p>
        </div>
      )}

      <div className="subtitle" style={{ textAlign: "center", marginTop: 28 }}>
        Jackpot
      </div>
      <div className="card hot-potato-card-face" style={{ marginTop: 8 }}>
        <div className="boost-emoji" style={{ fontSize: 56 }} aria-hidden="true">
          🎰
        </div>
        <div className="hot-potato-card-label">Double or Nothing</div>
      </div>

      {!eventLive && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ textAlign: "center" }}>
            Nothing to double yet. Wait for an event to start.
          </p>
        </div>
      )}

      {eventLive && !myBoost && (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <p className="muted" style={{ marginBottom: 10 }}>
            Double whatever you score in your next game. One use, for the whole event.
          </p>
          <button className="btn btn-primary" disabled={boosting} onClick={handleBoost}>
            {boosting ? "Activating…" : "Activate Jackpot"}
          </button>
          {boostError && <div className="banner-note error">{boostError}</div>}
        </div>
      )}

      {eventLive && myBoost && (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          <p className="muted">
            {myBoost.resolved_at
              ? "Jackpot's been and gone this event."
              : new Date(myBoost.expires_at) > now
              ? "Jackpot's live — whatever you score in your next game doubles."
              : "Jackpot expired before you played anything. Gone, unused."}
          </p>
        </div>
      )}

      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
