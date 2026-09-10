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

  const [leroyHelpOpen, setLeroyHelpOpen] = useState(false);
  const [boostHelpOpen, setBoostHelpOpen] = useState(false);
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
        <h1 style={{ fontSize: 26 }}>Tricks</h1>
      </div>

      {leroyHelpOpen && (
        <div className="modal-backdrop" onClick={() => setLeroyHelpOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>What is this?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              You get one shot per event to ruin someone&#39;s day.
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Pick a victim.</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              The exact second they try to play anything, Leroy mugs them for 5 points and
              hands them to you.
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>We notify them immediately.</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              They can&#39;t stop it, they just have to sit there and take it like a bitch.
            </p>
            <h3 style={{ marginTop: 18 }}>Fine print</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Leroy has better things to do. He gives it 18 hours.
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              If your target is such a bitch that they refuse to play anything before time
              runs out, Leroy gets bored and leaves.
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>You get absolutely nothing.</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Don&#39;t cry about it. Just get on with it.
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
              One shot per event. Same deal as Leroy, except this time you&#39;re the victim.
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Hit activate and whatever you score in your next game gets doubled.
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Congratulations, you&#39;re a gambler now.
            </p>
            <h3 style={{ marginTop: 18 }}>Does it work with Leroy?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>No. Nice try.</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              He always takes exactly 5 off you, boosted or not.
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Being greedy doesn&#39;t make him greedier.
            </p>
            <h3 style={{ marginTop: 18 }}>Fine print</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              18 hours, same as everything else round here.
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Don&#39;t play anything in time and it&#39;s gone. Wasted. Like your potential.
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

        {eventLive && incoming && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <p className="gay-card-title">Leroy&#39;s coming for you</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              The second you play anything, he&#39;s taking {incoming.amount} points off you and
              legging it. About {hoursLeft(incoming.expires_at)} hour
              {hoursLeft(incoming.expires_at) === 1 ? "" : "s"} before he gives up and goes home.
            </p>
          </div>
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
            {pushInfo && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {pushInfo}
              </p>
            )}
          </div>
        )}

        {eventLive && mySend && (
          <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
            You sent Leroy after{" "}
            <strong>{players.find((p) => p.id === mySend.target_id)?.name || "someone"}</strong> this
            event.{" "}
            {mySend.resolved_at
              ? "Job done. Hope it was worth it."
              : new Date(mySend.expires_at) > now
              ? "Still waiting on him to earn his cut."
              : "He bottled it. Nobody got anything."}
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
