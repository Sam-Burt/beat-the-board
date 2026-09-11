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
    players,
    tripPlayers,
    currentTrip,
    trophies,
    leroySends,
    sendLeroy,
    guessLeroy,
    pointBoosts,
    activateBoost,
  } = useBoardData();

  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players, me);
  const { alerting: leroyAlert, dismiss: dismissLeroyAlert } = useLeroyAlert(leroySends, players, me);

  const [leroyHelpOpen, setLeroyHelpOpen] = useState(false);
  const [boostHelpOpen, setBoostHelpOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
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
  const myBoost = pointBoosts.find((b) => b.player_id === me.id);

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
            <h3 style={{ marginTop: 18 }}>Fine print</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              No expiry. He waits as long as it takes for their next game — could be their very
              next round, could be next week. He&#39;s patient. You should be too.
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
              One shot per event. Hit activate, and whatever tragic score you manage to scrape
              together in your next game gets doubled. Congratulations, you&#39;re officially a
              gambler.
            </p>
            <h3 style={{ marginTop: 18 }}>Does it work with Leroy?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              No. Nice try, though. Leroy takes exactly 5 points off you, boosted or not. Your
              desperate greed doesn&#39;t make him work any harder.
            </p>
            <h3 style={{ marginTop: 18 }}>Fine print</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              You have 18 hours. If you&#39;re too lazy to actually play a game before the clock
              runs out, the boost just vanishes. Completely wasted. Just like your potential.
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
            He&#39;s Available
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
              Whatever you score next game, doubled. One shot — don&#39;t fumble it.
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
              ? "Cashed in. However that went for you."
              : new Date(myBoost.expires_at) > now
              ? "Live and loaded. Next game you play, it's double or nothing."
              : "Expired. You didn't even play. Embarrassing."}
          </p>
        )}
      </div>

      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
