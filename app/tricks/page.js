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

export default function TricksPage() {
  const router = useRouter();
  const {
    configured,
    loading,
    session,
    me,
    isAdmin,
    players,
    tripPlayers,
    currentTrip,
    trophies,
    eventTrophies,
    leroySends,
    sendLeroy,
    guessLeroy,
    startLeroyGuessWindow,
    pointBoosts,
    activateBoost,
    confirmBoost,
  } = useBoardData();

  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players, me);
  const { alerting: leroyAlert, dismiss: dismissLeroyAlert } = useLeroyAlert(
    leroySends,
    players,
    me,
    startLeroyGuessWindow
  );

  const [leroyHelpOpen, setLeroyHelpOpen] = useState(false);
  const [boostHelpOpen, setBoostHelpOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [boosting, setBoosting] = useState(false);
  const [boostError, setBoostError] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmError, setConfirmError] = useState("");

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  // Clears the pink dot BottomNav shows for a Leroy send landing on you,
  // or a Jackpot request going out — landing on this tab at all counts as
  // "seen", same as Missions/Gay Card do.
  useEffect(() => {
    if (!supabase || !me) return;
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("player_id", me.id)
      .in("kind", ["leroy", "jackpot"])
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
  const myBoost = pointBoosts.find((b) => b.player_id === me.id);
  // Anything activated but not yet confirmed, and not already expired —
  // this is what an admin needs to actually see and act on to make the
  // trick usable at all (see app/api/admin/confirm-boost).
  const pendingConfirmations = pointBoosts.filter(
    (b) => !b.resolved_at && !b.confirmed_at && new Date(b.expires_at) > now
  );

  async function handleSend() {
    if (!target) return;
    setSendError("");
    setSending(true);
    const result = await sendLeroy({ targetId: target });
    setSending(false);
    if (result?.ok) {
      setTarget(null);
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

  async function handleConfirm(boostId) {
    setConfirmError("");
    setConfirmingId(boostId);
    const result = await confirmBoost({ boostId });
    setConfirmingId(null);
    if (!result?.ok) {
      setConfirmError(result?.error || "Couldn't confirm it — try again.");
    }
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

      <div className="card header-card">
        <h1 style={{ fontSize: 26 }}>Tricks</h1>
      </div>

      {leroyHelpOpen && (
        <div className="modal-backdrop" onClick={() => setLeroyHelpOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>What is this?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              You get one shot per event to ruin someone&#39;s day. Pick a victim. The exact
              second they try to play anything, Leroy mugs them for 5 points and hands them to
              you. We notify them immediately. They can&#39;t stop it, they just have to sit
              there and take it like a bitch.
            </p>
            <h3 style={{ marginTop: 18 }}>Can they get it back?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              The second he strikes, they get told and get 60 seconds to guess who sent him.
              Guess right and they get their 5 back, plus 5 more out of your pocket. Guess
              wrong, or they&#39;re not fast enough, and they never find out it was you.
            </p>
            <div className="btn-row modal-close" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => setLeroyHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {boostHelpOpen && (
        <div className="modal-backdrop" onClick={() => setBoostHelpOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>What is this?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              One shot per event. Real double or nothing: come first in your next game and
              everything you scored gets doubled. Come anything else and that game&#39;s worth
              precisely zero. No middle ground, no consolation prize.
            </p>
            <h3 style={{ marginTop: 18 }}>Why do I need it confirmed?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Because results get logged after the fact, not live — so activating this the
              second you already know you&#39;ve won (or that you haven&#39;t) would be free
              money. It doesn&#39;t count until whoever runs the board confirms it, in person,
              before that game happens. Try to sneak one in afterward and they&#39;ll just say
              no.
            </p>
            <h3 style={{ marginTop: 18, lineHeight: 1.15 }}>Does it work with Leroy?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              No. Nice try, though. Leroy takes exactly 5 points off you, boosted or not. Your
              desperate greed doesn&#39;t make him work any harder.
            </p>
            <div className="btn-row modal-close" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => setBoostHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card trick-card" style={{ marginTop: 16 }}>
        <div className="header-card-title-row">
          <span className="card-help-btn-spacer" aria-hidden="true" />
          <h2 style={{ fontSize: 20, textAlign: "center" }}>Leroy</h2>
          <button
            type="button"
            className="card-help-btn"
            onClick={() => setLeroyHelpOpen(true)}
            aria-label="What is this?"
          >
            ?
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/leroy.png" alt="" style={{ width: 110, height: 110, objectFit: "contain" }} />
          <div className="hot-potato-card-label" style={{ marginTop: 4 }}>
            {mySend ? "He's Bored Of Your Shit" : "He's Available"}
          </div>
        </div>

        {!eventLive && (
          <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>
            Nothing to send him after. No event, no victims, no fun.
          </p>
        )}

        {eventLive && !mySend && (
          <div style={{ marginTop: 16 }}>
            <label>Who&#39;s getting mugged?</label>
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
              One shot, once, for the whole event. Choose wisely, or don&#39;t — not my problem.
            </p>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" disabled={!target || sending} onClick={handleSend}>
                {sending ? "Sending…" : "Send Leroy"}
              </button>
            </div>
            {sendError && <div className="banner-note error">{sendError}</div>}
          </div>
        )}

        {eventLive && mySend && (
          <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
            You sent Leroy after{" "}
            <strong>{players.find((p) => p.id === mySend.target_id)?.name || "someone"}</strong> this
            event.{" "}
            {!mySend.resolved_at
              ? "Still waiting on him to earn his cut. They've no idea."
              : !mySend.guessed_at
              ? "He's struck. Any second now they'll find out — or won't."
              : mySend.guess_correct
              ? "They worked it out. Cost you 5 on top."
              : "Job done. They never twigged it was you."}
          </p>
        )}
      </div>

      <div className="card trick-card" style={{ marginTop: 16 }}>
        <div className="header-card-title-row">
          <span className="card-help-btn-spacer" aria-hidden="true" />
          <h2 style={{ fontSize: 20, textAlign: "center" }}>Jackpot</h2>
          <button
            type="button"
            className="card-help-btn"
            onClick={() => setBoostHelpOpen(true)}
            aria-label="What is this?"
          >
            ?
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 10 }}>
          <div style={{ fontSize: 56 }} aria-hidden="true">
            🎰
          </div>
          <div className="hot-potato-card-label" style={{ marginTop: 4 }}>
            Double or Nothing
          </div>
        </div>

        {!eventLive && (
          <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>
            Nothing to double yet. No event, nothing to multiply.
          </p>
        )}

        {eventLive && !myBoost && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <p className="muted" style={{ marginBottom: 10 }}>
              Come first next game and it&#39;s doubled. Anything else and it scores nothing.
              One shot — don&#39;t fumble it.
            </p>
            <button className="btn btn-primary" disabled={boosting} onClick={handleBoost}>
              {boosting ? "Activating…" : "Activate Jackpot"}
            </button>
            {boostError && <div className="banner-note error">{boostError}</div>}
          </div>
        )}

        {eventLive && myBoost && (
          <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
            {myBoost.resolved_at
              ? "Cashed in. All or nothing, however that round went for you."
              : new Date(myBoost.expires_at) <= now
              ? myBoost.confirmed_at
                ? "Expired. You never played. Embarrassing."
                : "Expired. Nobody confirmed it in time — wasted."
              : myBoost.confirmed_at
              ? "Confirmed and live. Next game you play, it's everything or nothing."
              : "Activated. Now go find whoever runs this and get them to confirm it — before your next game, not after."}
          </p>
        )}

        {isAdmin && eventLive && pendingConfirmations.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ fontSize: 12, textAlign: "center", marginBottom: 8 }}>
              Only confirm one of these if you&#39;re watching it happen right now — not after
              you already know how their next game went.
            </p>
            {pendingConfirmations.map((b) => {
              const p = players.find((pl) => pl.id === b.player_id);
              return (
                <div
                  className="btn-row"
                  style={{ justifyContent: "center", alignItems: "center", marginTop: 8 }}
                  key={b.id}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <PlayerAvatar iconId={p?.icon_id} emoji={p?.emoji} size={20} />
                    {p?.name || "?"}
                  </span>
                  <button
                    className="btn btn-primary"
                    disabled={confirmingId === b.id}
                    onClick={() => handleConfirm(b.id)}
                  >
                    {confirmingId === b.id ? "Confirming…" : "Confirm"}
                  </button>
                </div>
              );
            })}
            {confirmError && <div className="banner-note error">{confirmError}</div>}
          </div>
        )}
      </div>

      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
